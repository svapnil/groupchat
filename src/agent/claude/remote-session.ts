// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
/**
 * Claude Code session for `groupchat --remote` runs.
 *
 * Runs a long-lived `claude --print --input-format stream-json
 * --output-format stream-json --include-partial-messages --verbose`
 * subprocess: newline-delimited user messages go in on stdin, newline-
 * delimited typed events come out on stdout (system/init, stream_event
 * deltas, complete assistant snapshots, tool-result user echoes, result).
 * stdout is reserved exclusively for NDJSON protocol parsing; stderr is
 * captured as a bounded diagnostic tail.
 *
 * Multi-turn: keeping stdin open keeps the process alive; each further user
 * message starts a new turn in the same session. Steering: a user message
 * written while a turn is active is consumed mid-turn (Claude finishes the
 * running tool, folds the new instruction in, and emits ONE result). Cold
 * resume: `--resume <session_id>` restores a prior conversation (same
 * machine + same cwd); when the resumed process dies before its first
 * system/init, we fall back to a fresh session and replay the pending
 * prompt(s), and `didFallbackToFreshThread()` reports the context loss.
 *
 * Permissions are noninteractive: `--permission-mode acceptEdits` plus an
 * explicit `--allowedTools` pre-approval list. In --print mode anything not
 * pre-approved is denied without hanging (there is no prompt to answer), and
 * denials surface in the result. bypassPermissions is never used.
 */
import { getRuntimeCapabilities } from "../../lib/runtime-capabilities"
import { debugLog } from "../../lib/debug"
import type { RemoteHarnessSession, RemoteSessionOptions } from "../core/harness-session"

/**
 * Tools pre-approved for remote runs — the working set an agent needs to be
 * useful in a checkout, and nothing session-interactive. Anything outside
 * this list is auto-denied by --print mode.
 */
const ALLOWED_TOOLS = [
  "Bash",
  "Read",
  "Edit",
  "Write",
  "Glob",
  "Grep",
  "WebFetch",
  "WebSearch",
  "TodoWrite",
  "Task",
  "NotebookEdit",
]

/**
 * Raw event types surfaced to the runner via onNotification (method = the raw
 * type, params = the event minus `type`). Everything else (keep_alive,
 * control traffic) is consumed locally. Mirrors Chat.Harness.Claude's
 * whitelist on the backend.
 */
const NOTIFIABLE_TYPES = new Set([
  "system",
  "assistant",
  "user",
  "stream_event",
  "result",
  "rate_limit_event",
  "tool_progress",
  "tool_use_summary",
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Deep-drop `signature` fields (thinking-block signatures) before forwarding. */
export function stripSignatures(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSignatures)
  if (isRecord(value)) {
    const out: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value)) {
      if (key === "signature") continue
      out[key] = stripSignatures(val)
    }
    return out
  }
  return value
}

/**
 * True when a `user` event carries tool_result blocks (Claude Code's echo of
 * a tool's output). Plain prompt echoes are NOT forwarded — the room already
 * shows the user's message.
 */
export function hasToolResultBlock(event: Record<string, unknown>): boolean {
  const message = event.message
  if (!isRecord(message) || !Array.isArray(message.content)) return false
  return message.content.some(
    (block) => isRecord(block) && block.type === "tool_result",
  )
}

/** True for stream deltas that only carry a thinking signature (never forwarded). */
export function isSignatureDelta(event: Record<string, unknown>): boolean {
  const inner = event.event
  if (!isRecord(inner) || inner.type !== "content_block_delta") return false
  const delta = inner.delta
  return isRecord(delta) && delta.type === "signature_delta"
}

function appendTail(previous: string, chunk: string, maxChars = 4000): string {
  const merged = previous + chunk
  if (merged.length <= maxChars) return merged
  return merged.slice(merged.length - maxChars)
}

function lastNonEmptyLine(text: string): string | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
  return lines.length > 0 ? lines[lines.length - 1] : null
}

function consumeStream(
  stream: ReadableStream<Uint8Array> | number | null | undefined,
  onChunk: (chunk: string) => void,
) {
  if (!stream || typeof stream === "number") return
  void (async () => {
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        if (!value) continue
        onChunk(decoder.decode(value, { stream: true }))
      }
      const trailing = decoder.decode()
      if (trailing) onChunk(trailing)
    } catch {
      // ignore read failures during shutdown
    } finally {
      reader.releaseLock()
    }
  })()
}

export function createClaudeSession(options: RemoteSessionOptions): RemoteHarnessSession {
  let proc: Bun.Subprocess | null = null
  let active = false
  let tearingDown = false
  let lastErr: string | null = null
  let sessionModel: string | null = null
  let fellBack = false
  let threadStartedFired = false

  // Per-process state, reset on (re)spawn.
  let initSeen = false
  let resumeAttempted = false
  let stderrTail = ""
  /** Prompts written to the CURRENT process — replayed on resume fallback. */
  let sentThisProcess: string[] = []

  /**
   * True from a user-message write until the next `result`. Steering is only
   * valid while a turn is active; after `result` the backend re-dispatches
   * the prompt as a continuation instead. (There is an unavoidable ms-level
   * race — Claude may emit `result` while our steer write is in flight; in
   * that case the queued message would start an extra turn in a process the
   * runner is about to kill. The window is the pipe latency only, and the
   * backend's steer-rejected path covers every observable variant.)
   */
  let turnActive = false

  const encoder = new TextEncoder()

  // Set per spawn: Bun gives a FileSink for stdin: "pipe", but tests (and
  // other runtimes) may hand a WritableStream — support both, like the codex
  // transport does.
  let writeChunk: ((data: Uint8Array) => void) | null = null
  let closeStdin: (() => void) | null = null

  const bindStdin = (stdin: Bun.Subprocess["stdin"]) => {
    if (!stdin || typeof stdin === "number") {
      throw new Error("Claude process must expose a stdin pipe")
    }
    const sinkLike = stdin as unknown as {
      write?: (data: Uint8Array) => number
      flush?: () => void
      end?: () => void
    }
    if (typeof sinkLike.write === "function") {
      writeChunk = (data) => {
        sinkLike.write!(data)
        sinkLike.flush?.()
      }
      closeStdin = () => sinkLike.end?.()
    } else {
      const writer = (stdin as unknown as WritableStream<Uint8Array>).getWriter()
      writeChunk = (data) => {
        void writer.write(data)
      }
      closeStdin = () => {
        void writer.close().catch(() => {})
      }
    }
  }

  const writeLine = (payload: Record<string, unknown>) => {
    if (!writeChunk) {
      throw new Error("Claude stdin is not available")
    }
    writeChunk(encoder.encode(`${JSON.stringify(payload)}\n`))
  }

  const writeUserMessage = (prompt: string) => {
    writeLine({
      type: "user",
      message: { role: "user", content: [{ type: "text", text: prompt }] },
    })
    sentThisProcess.push(prompt)
    turnActive = true
  }

  const handleEvent = (event: Record<string, unknown>) => {
    const type = event.type
    if (typeof type !== "string") return

    // A result before any init on a resumed process means the transcript
    // couldn't be loaded (observed live: --resume with an unknown id emits an
    // error_during_execution result and never inits). Fall back to a fresh
    // session instead of surfacing the error; the result is not forwarded.
    if (type === "result" && resumeAttempted && !initSeen) {
      if (fallbackToFresh()) return
      // Couldn't fall back — let the error result flow through so the run
      // fails visibly instead of hanging.
    }

    if (type === "system" && event.subtype === "init") {
      // init recurs across top-level inputs — treat it as idempotent.
      initSeen = true
      if (typeof event.model === "string" && event.model.trim()) {
        sessionModel = event.model.trim()
      }
      const sid = typeof event.session_id === "string" ? event.session_id : null
      if (sid && !threadStartedFired) {
        threadStartedFired = true
        try {
          options.onThreadStarted(sid)
        } catch {
          // observer failures never kill the stream
        }
      }
    }

    if (type === "result") {
      turnActive = false
    }

    if (!NOTIFIABLE_TYPES.has(type)) {
      // keep_alive, control_request/control_response, and future chatter are
      // consumed locally; unknown types are diagnostics, not fatal errors.
      if (type !== "keep_alive") {
        debugLog("claude-session", "Consumed non-forwarded event", { type })
      }
      return
    }

    // Only tool-result user echoes are meaningful downstream; skip prompt echoes.
    if (type === "user" && !hasToolResultBlock(event)) return
    // Thinking signatures never leave the machine.
    if (type === "stream_event" && isSignatureDelta(event)) return

    const { type: _type, ...rest } = event
    try {
      options.onNotification(type, stripSignatures(rest) as Record<string, unknown>)
    } catch {
      // observer failures never kill the stream
    }
  }

  /**
   * The resume couldn't restore the transcript (process death or an error
   * result before any init): start a fresh session and replay whatever was
   * already sent, healing the conversation chain with the new session id
   * (reported through onThreadStarted when its init arrives). One attempt
   * only; returns false when the fallback itself failed.
   */
  const fallbackToFresh = (): boolean => {
    if (fellBack || tearingDown) return false
    fellBack = true
    const pending = sentThisProcess
    const previous = proc
    debugLog("claude-session", "Resume failed; falling back to a fresh session", {
      pendingPrompts: pending.length,
    })
    try {
      spawnProcess(undefined)
    } catch (error) {
      lastErr = error instanceof Error ? error.message : String(error)
      return false
    }
    if (previous) {
      try {
        previous.kill("SIGTERM")
      } catch {
        // already gone
      }
    }
    try {
      for (const prompt of pending) writeUserMessage(prompt)
    } catch (error) {
      lastErr = error instanceof Error ? error.message : String(error)
      return false
    }
    return true
  }

  const handleExit = (exitedProc: Bun.Subprocess, exitCode: number, hadResumeArg: boolean) => {
    if (tearingDown || exitedProc !== proc) return

    if (hadResumeArg && !initSeen && fallbackToFresh()) return

    active = false
    turnActive = false
    const detail = lastNonEmptyLine(stderrTail)
    const message = detail
      ? `Claude process exited (code ${exitCode}). ${detail}`
      : `Claude process exited (code ${exitCode}).`
    lastErr = message
    try {
      options.onFatal(message)
    } catch {
      // best-effort
    }
  }

  const spawnProcess = (resumeThreadId: string | undefined) => {
    const capabilities = getRuntimeCapabilities()
    if (!capabilities.hasClaude || !capabilities.claudePath) {
      throw new Error(
        "Claude Code executable not found on the remote machine. Install Claude Code and try again.",
      )
    }

    // Reset per-process state.
    initSeen = false
    resumeAttempted = resumeThreadId !== undefined
    stderrTail = ""
    sentThisProcess = []
    turnActive = false

    const args = [
      capabilities.claudePath,
      "--print",
      "--input-format",
      "stream-json",
      "--output-format",
      "stream-json",
      "--include-partial-messages",
      "--verbose",
      "--permission-mode",
      "acceptEdits",
      "--allowedTools",
      ALLOWED_TOOLS.join(","),
    ]
    if (options.instructions.trim()) {
      args.push("--append-system-prompt", options.instructions)
    }
    if (resumeThreadId) {
      args.push("--resume", resumeThreadId)
    }

    // CLAUDECODE in the child environment triggers the nested-session refusal;
    // never pass --sdk-url or a positional prompt (stdin carries everything).
    const env = { ...process.env }
    delete env.CLAUDECODE
    delete env.CLAUDE_CODE_ENTRYPOINT

    const spawned = Bun.spawn(args, {
      cwd: process.cwd(),
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      env,
    })
    proc = spawned
    bindStdin(spawned.stdin)

    if (!spawned.stdout || typeof spawned.stdout === "number") {
      throw new Error("Claude process must expose stdio pipes")
    }

    // Per-spawn parse state, guarded so late chunks from a replaced process
    // (resume fallback) can never bleed into the new one.
    let lineBuffer = ""
    consumeStream(spawned.stdout as ReadableStream<Uint8Array>, (chunk) => {
      if (proc !== spawned) return
      lineBuffer += chunk
      const lines = lineBuffer.split("\n")
      lineBuffer = lines.pop() || ""
      for (const line of lines) {
        if (proc !== spawned) return
        const trimmed = line.trim()
        if (!trimmed) continue
        let event: unknown
        try {
          event = JSON.parse(trimmed)
        } catch {
          debugLog("claude-session", "Dropped malformed stdout line", {
            preview: trimmed.slice(0, 160),
          })
          continue
        }
        if (isRecord(event)) handleEvent(event)
      }
    })
    consumeStream(spawned.stderr, (chunk) => {
      if (proc !== spawned) return
      stderrTail = appendTail(stderrTail, chunk)
    })
    spawned.exited.then((exitCode) => handleExit(spawned, exitCode, resumeThreadId !== undefined))
  }

  return {
    start: async () => {
      try {
        spawnProcess(options.resumeThreadId)
        active = true
        lastErr = null
      } catch (error) {
        lastErr = error instanceof Error ? error.message : String(error)
        active = false
      }
    },

    sendMessage: async (prompt: string) => {
      if (!active) {
        lastErr = lastErr || "Claude session is not active."
        return
      }
      try {
        writeUserMessage(prompt)
      } catch (error) {
        lastErr = error instanceof Error ? error.message : String(error)
      }
    },

    steer: async (prompt: string) => {
      if (!active || !turnActive) return false
      try {
        writeUserMessage(prompt)
        return true
      } catch {
        return false
      }
    },

    stop: () => {
      tearingDown = true
      active = false
      turnActive = false
      const current = proc
      proc = null
      try {
        closeStdin?.()
      } catch {
        // ignore teardown failures
      }
      writeChunk = null
      closeStdin = null
      if (current) {
        try {
          current.kill("SIGTERM")
        } catch {
          // ignore teardown failures
        }
      }
    },

    isActive: () => active,
    lastError: () => lastErr,
    didFallbackToFreshThread: () => fellBack,
    getActiveModel: () => sessionModel,
  }
}

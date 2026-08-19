// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
/**
 * Per-harness adapters for the headless `--remote` runner: how to check
 * availability, create a session, which native notification methods to
 * forward, and which notification ends the run. Adding a harness means
 * adding an adapter here plus its `Chat.Harness.*` counterpart on the
 * backend (the forwarded-methods sets mirror those whitelists).
 */
import { createRoot } from "solid-js"
import { createCodexSession } from "../codex/session"
import { createClaudeSession } from "../claude/remote-session"
import { getRuntimeCapabilities } from "../../lib/runtime-capabilities"
import type { HarnessAdapter, RemoteSessionOptions } from "./harness-session"

const codexAdapter: HarnessAdapter = {
  label: "Codex",

  unavailableReason: () =>
    getRuntimeCapabilities().hasCodex
      ? null
      : "Codex executable not found on the remote machine. Install Codex and try again.",

  // Mirrors Chat.Harness.Codex.@allowed_methods.
  forwardedMethods: new Set([
    "item/started",
    "item/completed",
    "item/agentMessage/delta",
    "item/reasoning/textDelta",
    "item/reasoning/summaryTextDelta",
    "item/reasoning/summaryPartAdded",
    "item/reasoning/delta",
    "item/commandExecution/outputDelta",
    "item/commandExecution/terminalInteraction",
    "item/mcpToolCall/progress",
    "item/plan/delta",
    "turn/started",
    "turn/completed",
    "turn/plan/updated",
    "thread/tokenUsage/updated",
  ]),

  turnOutcome: (method, params) => {
    if (method !== "turn/completed") return null
    const turn = (params.turn ?? {}) as { status?: string; error?: { message?: string } }
    const failed = typeof turn.status === "string" && turn.status !== "completed"
    return { failed, error: turn.error?.message }
  },

  createSession: (options: RemoteSessionOptions) => {
    // createCodexSession uses createSignal/onCleanup, so it lives inside its
    // own solid-js root. createRoot runs its callback synchronously.
    let dispose: () => void = () => {}
    const codexSession = createRoot((d) => {
      dispose = d
      return createCodexSession({
        instructions: options.instructions,
        onNotification: options.onNotification,
        resumeThreadId: options.resumeThreadId,
      })
    })

    return {
      dispose,
      session: {
        start: async () => {
          await codexSession.start()
          // Codex knows its thread id synchronously after thread/start; on a
          // resume that fell back to a fresh thread this carries the NEW id.
          const threadId = codexSession.getThreadId()
          if (codexSession.isActive() && threadId) options.onThreadStarted(threadId)
        },
        // The username arg only labels the local (unrendered) message record.
        sendMessage: (prompt) => codexSession.sendMessage(prompt, "remote"),
        steer: (prompt) => codexSession.steer(prompt),
        stop: () => codexSession.stop(),
        isActive: () => codexSession.isActive(),
        lastError: () => codexSession.lastError(),
        didFallbackToFreshThread: () => codexSession.didFallbackToFreshThread(),
        getActiveModel: () => codexSession.getActiveModel(),
      },
    }
  },
}

const claudeAdapter: HarnessAdapter = {
  label: "Claude",

  unavailableReason: () =>
    getRuntimeCapabilities().hasClaude
      ? null
      : "Claude Code executable not found on the remote machine. Install Claude Code and try again.",

  // Mirrors Chat.Harness.Claude.@allowed_methods.
  forwardedMethods: new Set([
    "system",
    "assistant",
    "user",
    "stream_event",
    "result",
    "rate_limit_event",
    "tool_progress",
    "tool_use_summary",
  ]),

  turnOutcome: (method, params) => {
    if (method !== "result") return null
    const failed = params.subtype !== "success" || params.is_error === true
    if (!failed) return { failed: false }
    const resultText = typeof params.result === "string" && params.result ? params.result : null
    const subtype = typeof params.subtype === "string" ? params.subtype : "unknown error"
    return { failed: true, error: resultText || `Claude run ended: ${subtype}` }
  },

  createSession: (options: RemoteSessionOptions) => ({
    session: createClaudeSession(options),
    dispose: () => {},
  }),
}

const ADAPTERS: Record<string, HarnessAdapter> = {
  codex: codexAdapter,
  claude: claudeAdapter,
}

/** The adapter for an agent's harness string, or null when unsupported. */
export function getHarnessAdapter(harness: string): HarnessAdapter | null {
  return ADAPTERS[harness] ?? null
}

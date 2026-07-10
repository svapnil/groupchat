// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
/**
 * Headless agent runner for `groupchat --remote`.
 *
 * When the backend pushes `agent:run` on the user channel (one of the user's
 * agents was @-mentioned from another client), this module runs the harness
 * locally — one Codex session per run (killed after its single turn) — and
 * streams every harness event back to the backend as `agent:event` pushes
 * correlated by `run_id`. Multi-turn conversations chain runs: a "continue"
 * run cold-resumes the conversation's thread (`thread/resume` from the
 * on-disk rollout), and `agent:steer` injects a prompt into a RUNNING run's
 * turn (`turn/steer`) — no keep-warm process management needed.
 *
 * No UI is involved: the session's local message signals are simply ignored.
 * createCodexSession uses createSignal/onCleanup, so each session lives
 * inside its own solid-js createRoot.
 */
import { createRoot } from "solid-js"
import { createCodexSession } from "../codex/session"
import { GROUPCHAT_SYSTEM_PROMPT } from "./system-prompt"
import {
  trackRunEvent,
  trackRunFinished,
  trackRunRejected,
  trackRunStarted,
} from "./remote-run-store"
import { getRuntimeCapabilities } from "../../lib/runtime-capabilities"
import { debugLog } from "../../lib/debug"
import type { ChannelManager } from "../../lib/channel-manager"
import type { AgentRunRequest, AgentSteerRequest } from "../../lib/types"

/** Safety net: if the harness never completes a turn, fail the run. */
const RUN_TIMEOUT_MS = 30 * 60 * 1000

/**
 * Native harness notification methods forwarded over `agent:event` — the
 * whitelist mirrors the backend's `Chat.Harness.Codex.@allowed_methods`, so we
 * don't spam the backend with rejections for the many app-server notifications
 * we don't render (thread lifecycle, account/model, fuzzy search, ...).
 */
const FORWARDED_METHODS = new Set<string>([
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
])

/**
 * Concurrent runs per agent (agent id -> set of active run ids). Each run is a
 * fully isolated Codex session — its own app-server process, transport, and
 * per-run event bookkeeping — and its `agent:event`s carry that run's own
 * `run_id`, so streams never cross. We cap the fan-out only because every run
 * for a given `--remote` shares one working directory; unbounded parallel edits
 * to a single tree would race. (Worktree isolation is planned as a per-agent
 * prompt setting; until then this cap is the guard.)
 */
const MAX_CONCURRENT_RUNS_PER_AGENT = 10
const activeRunsByAgentId = new Map<string, Set<string>>()

/**
 * Live sessions by run id — the steer lookup (`agent:steer` targets the run
 * whose turn is currently streaming). Entries live exactly as long as the
 * run's concurrency slot.
 */
const activeSessionsByRunId = new Map<string, ReturnType<typeof createCodexSession>>()

/**
 * The git "{owner}/{repo}" for `cwd` from its `origin` remote (e.g.
 * git@github.com:svapnil/groupchat.git → "svapnil/groupchat"), or null when it
 * isn't a git repo / has no origin. Falls back to the directory name upstream.
 */
function gitRepoSlug(cwd: string): string | null {
  try {
    const proc = Bun.spawnSync(["git", "remote", "get-url", "origin"], {
      cwd,
      stdout: "pipe",
      stderr: "ignore",
    })
    if (proc.exitCode !== 0) return null
    const url = new TextDecoder().decode(proc.stdout).trim().replace(/\.git$/, "")
    const match = url.match(/[:/]([^/:]+)\/([^/]+)$/)
    return match ? `${match[1]}/${match[2]}` : null
  } catch {
    return null
  }
}

/**
 * Handle an inbound `agent:run` push: run Codex headlessly for `run.prompt` and
 * forward its native app-server notifications back through `manager` as
 * `agent:event` (`{run_id, method, params}`), true-to-source. Never throws;
 * failures surface to the backend as the control method `run/failed`.
 */
export function handleAgentMention(run: AgentRunRequest, manager: ChannelManager): void {
  const agentId = run.agent.id

  const runInfo = {
    runId: run.run_id,
    agentName: run.agent.name,
    room: run.room,
    prompt: run.prompt,
  }

  const sendRunFailed = (message: string) => {
    manager.sendAgentRunEvent({
      run_id: run.run_id,
      method: "run/failed",
      params: { message },
    })
  }

  // Harness-agnostic platform status shown on web while the run spins up. The
  // target is the git "{owner}/{repo}" of the working directory, falling back to
  // the directory name when it isn't a git repo.
  const initTarget =
    gitRepoSlug(process.cwd()) || process.cwd().split("/").filter(Boolean).pop() || "workspace"

  // Multi-turn continuation: resume the conversation's existing Codex thread
  // (cold resume from the on-disk rollout) instead of starting fresh.
  const resumeThreadId =
    run.mode === "continue" && typeof run.resume_thread_id === "string" && run.resume_thread_id
      ? run.resume_thread_id
      : undefined

  const sendSystemStatus = (
    text: string,
    status: "in_progress" | "done",
    id: string = "init",
  ) => {
    manager.sendAgentRunEvent({
      run_id: run.run_id,
      method: "system/status",
      params: { id, text, status },
    })
  }

  const rejectRun = (reason: string) => {
    trackRunRejected(runInfo, reason)
    sendRunFailed(reason)
  }

  if ((activeRunsByAgentId.get(agentId)?.size ?? 0) >= MAX_CONCURRENT_RUNS_PER_AGENT) {
    rejectRun(
      `Agent is already handling ${MAX_CONCURRENT_RUNS_PER_AGENT} requests at once. Try again once one finishes.`,
    )
    return
  }

  if (!getRuntimeCapabilities().hasCodex) {
    rejectRun("Codex executable not found on the remote machine. Install Codex and try again.")
    return
  }

  if (!run.prompt || !run.prompt.trim()) {
    rejectRun("Agent run had an empty prompt.")
    return
  }

  // Claim a concurrency slot for this run. Synchronous from the guard above to
  // here (no awaits between), so the size check can't race another mention.
  const runsForAgent = activeRunsByAgentId.get(agentId) ?? new Set<string>()
  runsForAgent.add(run.run_id)
  activeRunsByAgentId.set(agentId, runsForAgent)
  trackRunStarted(runInfo)
  // Tell web the run is spinning up immediately (before Codex even starts).
  sendSystemStatus(
    resumeThreadId
      ? `Resuming local Codex agent in ${initTarget}`
      : `Initializing local Codex agent in ${initTarget}`,
    "in_progress",
  )
  debugLog("remote-agent-runner", "Starting run", {
    runId: run.run_id,
    agentId,
    agentName: run.agent.name,
    room: run.room,
  })

  let session: ReturnType<typeof createCodexSession> | null = null
  let disposeRoot: (() => void) | null = null
  let safetyTimer: ReturnType<typeof setTimeout> | null = null
  let finished = false

  const cleanup = () => {
    if (finished) return
    finished = true
    if (safetyTimer) {
      clearTimeout(safetyTimer)
      safetyTimer = null
    }
    // Release only this run's slot; sibling runs for the same agent keep theirs.
    const runsForAgent = activeRunsByAgentId.get(agentId)
    if (runsForAgent) {
      runsForAgent.delete(run.run_id)
      if (runsForAgent.size === 0) activeRunsByAgentId.delete(agentId)
    }
    activeSessionsByRunId.delete(run.run_id)
    try {
      session?.stop()
    } catch {
      // ignore teardown failures
    }
    try {
      disposeRoot?.()
    } catch {
      // ignore teardown failures
    }
    session = null
    disposeRoot = null
    debugLog("remote-agent-runner", "Run finished", { runId: run.run_id, agentId })
  }

  /** Best-effort run/failed, then teardown. No-op once the run finished. */
  const failRun = (content: string) => {
    if (finished) return
    trackRunFinished(run.run_id, "failed", content)
    try {
      sendRunFailed(content)
    } catch {
      // best-effort
    }
    cleanup()
  }

  // Forward one native app-server notification true-to-source, and drive run
  // lifecycle off it: turn/completed ends the run (status from turn.status).
  const forwardNotification = (method: string, params: Record<string, unknown>) => {
    if (finished) return

    if (FORWARDED_METHODS.has(method)) {
      manager.sendAgentRunEvent({ run_id: run.run_id, method, params })
    }

    if (method === "turn/completed") {
      const turn = (params.turn ?? {}) as { status?: string; error?: { message?: string } }
      const failed = typeof turn.status === "string" && turn.status !== "completed"
      trackRunFinished(run.run_id, failed ? "failed" : "completed", turn.error?.message)
      cleanup()
    } else {
      trackRunEvent(run.run_id, { event: method, content: "" })
    }
  }

  try {
    // createRoot runs its callback synchronously and returns its value.
    const codexSession = createRoot((dispose) => {
      disposeRoot = dispose
      const instructions = run.agent.prompt?.trim()
        ? run.agent.prompt
        : GROUPCHAT_SYSTEM_PROMPT
      return createCodexSession({
        instructions,
        onNotification: forwardNotification,
        resumeThreadId,
      })
    })
    session = codexSession
    activeSessionsByRunId.set(run.run_id, codexSession)

    safetyTimer = setTimeout(() => {
      failRun("Agent run timed out.")
    }, RUN_TIMEOUT_MS)

    void (async () => {
      try {
        await codexSession.start()
        if (finished) return
        if (!codexSession.isActive()) {
          failRun(codexSession.lastError() || "Failed to start Codex.")
          return
        }

        // Report the session's actual thread id — the run row's conversation
        // handle. On a resume that fell back to a fresh thread this carries
        // the NEW id, healing the conversation chain for the next turn.
        const threadId = codexSession.getThreadId()
        if (threadId) {
          manager.sendAgentRunEvent({
            run_id: run.run_id,
            method: "run/thread_started",
            params: { thread_id: threadId },
          })
        }

        // Codex is up — resolve the init status (it drops into web's timeline as
        // dim history; the run's reasoning/tools take over the live status).
        sendSystemStatus(
          `${resumeThreadId && !codexSession.didFallbackToFreshThread()
            ? `Resumed local Codex agent in ${initTarget}`
            : `Started local Codex agent in ${initTarget}`}${
            codexSession.getActiveModel() ? ` using ${codexSession.getActiveModel()}` : ""
          }`,
          "done",
        )

        if (resumeThreadId && codexSession.didFallbackToFreshThread()) {
          sendSystemStatus(
            "Previous conversation context could not be restored — starting fresh.",
            "done",
            "resume",
          )
        }

        // The username arg only labels the local (unrendered) message record.
        await codexSession.sendMessage(run.prompt, "remote")
        if (finished) return

        // sendMessage swallows turn/start failures into lastError; without a
        // started turn no result event will ever arrive, so fail now.
        const sendError = codexSession.lastError()
        if (sendError) {
          failRun(`Failed to send prompt to Codex: ${sendError}`)
        }
      } catch (error) {
        failRun(
          `Agent run failed: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    })()
  } catch (error) {
    failRun(
      `Agent run failed: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Handle an inbound `agent:steer` push: inject the prompt into the targeted
 * run's RUNNING turn (codex turn/steer — the turn keeps streaming into the
 * same run). When the run is gone or the turn just completed (the steer
 * race), answer with `run/steer_rejected` so the backend re-dispatches the
 * prompt as a normal continuation run. Never throws.
 */
export function handleAgentSteer(steer: AgentSteerRequest, manager: ChannelManager): void {
  const sendSteerRejected = () => {
    manager.sendAgentRunEvent({
      run_id: steer.run_id,
      method: "run/steer_rejected",
      params: { prompt: steer.prompt },
    })
  }

  const session = activeSessionsByRunId.get(steer.run_id)
  if (!session) {
    debugLog("remote-agent-runner", "Steer target not active, rejecting", {
      runId: steer.run_id,
    })
    sendSteerRejected()
    return
  }

  void (async () => {
    try {
      const steered = await session.steer(steer.prompt)
      if (steered) {
        debugLog("remote-agent-runner", "Steered run", { runId: steer.run_id })
      } else {
        sendSteerRejected()
      }
    } catch {
      sendSteerRejected()
    }
  })()
}

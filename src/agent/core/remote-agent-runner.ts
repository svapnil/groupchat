// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
/**
 * Headless agent runner for `groupchat --remote`.
 *
 * When the backend pushes `agent:run` on the user channel (one of the user's
 * agents was @-mentioned from another client), this module runs the agent's
 * harness locally, retaining successful sessions briefly between turns, and
 * streams every native harness event back to the backend as `agent:event`
 * pushes correlated by `run_id`. The runner itself is harness-neutral: each
 * harness (codex app-server, claude stream-json) registers a HarnessAdapter
 * (see harness-registry.ts) that owns session creation, the forwarded-method
 * whitelist, and terminal-outcome detection.
 *
 * Multi-turn conversations chain runs: a "continue" run cold-resumes the
 * conversation's harness thread/session on a cache miss. Cached sessions receive
 * another input directly. `agent:steer` injects a prompt into a RUNNING turn.
 */
import { getHarnessAdapter } from "./harness-registry"
import { GROUPCHAT_SYSTEM_PROMPT } from "./system-prompt"
import {
  trackRunEvent,
  trackRunFinished,
  trackRunRejected,
  trackRunStarted,
} from "./remote-run-store"
import { debugLog } from "../../lib/debug"
import type { HarnessAdapter } from "./harness-session"
import { RemoteSessionPool, type PooledSession, type SessionPoolOptions } from "./remote-session-pool"
import type { ChannelManager } from "../../lib/channel-manager"
import type { AgentRunRequest, AgentSteerRequest } from "../../lib/types"

/** Safety net: if the harness never completes a turn, fail the run. */
const RUN_TIMEOUT_MS = 30 * 60 * 1000

/**
 * Concurrent runs per agent (agent id -> set of active run ids). Concurrent
 * conversations have separate harness processes and transports; successive
 * runs in one conversation can reuse a session. Events carry the attached
 * run's own `run_id`. We cap the fan-out because every run for a given
 * `--remote` shares one working directory; unbounded parallel edits to a
 * single tree would race. (Worktree isolation is planned as a per-agent
 * prompt setting; until then this cap is the guard.)
 */
const MAX_CONCURRENT_RUNS_PER_AGENT = 10

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

/** A connection owns its active runs and its bounded cache of idle sessions. */
export function createRemoteAgentRunner(
  manager: ChannelManager,
  options: SessionPoolOptions & {
    getAdapter?: (harness: string) => HarnessAdapter | null
    runTimeoutMs?: number
  } = {},
) {
  const pool = new RemoteSessionPool(options)
  const activeRunsByAgentId = new Map<string, Set<string>>()
  const activeSessionsByRunId = new Map<string, PooledSession>()
  const resolveAdapter = options.getAdapter ?? getHarnessAdapter
  let closed = false
  const schedule = options.schedule ?? ((callback: () => void, ms: number) => {
    const timer = setTimeout(callback, ms)
    return () => clearTimeout(timer)
  })

  /**
   * Handle an inbound `agent:run` push: run the agent's harness headlessly for
   * `run.prompt` and forward its native notifications back through `manager` as
   * `agent:event` (`{run_id, method, params}`), true-to-source. Never throws;
   * failures surface to the backend as the control method `run/failed`.
   */
  function handleAgentMention(run: AgentRunRequest): void {
    if (closed || activeSessionsByRunId.has(run.run_id)) return
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

    // Multi-turn continuation: resume the conversation's existing harness
    // thread/session, reusing the live process when it is still cached.
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

    const adapter = resolveAdapter(run.agent.harness)
    if (!adapter) {
      rejectRun(`This machine's groupchat build doesn't support the "${run.agent.harness}" harness. Update groupchat and try again.`)
      return
    }

    if ((activeRunsByAgentId.get(agentId)?.size ?? 0) >= MAX_CONCURRENT_RUNS_PER_AGENT) {
      rejectRun(
        `Agent is already handling ${MAX_CONCURRENT_RUNS_PER_AGENT} requests at once. Try again once one finishes.`,
      )
      return
    }

    const unavailable = adapter.unavailableReason()
    if (unavailable) {
      rejectRun(unavailable)
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
    debugLog("remote-agent-runner", "Starting run", {
      runId: run.run_id,
      agentId,
      agentName: run.agent.name,
      harness: run.agent.harness,
      room: run.room,
    })

    let owned: PooledSession | null = null
    let reused = false
    let cancelSafetyTimer: (() => void) | null = null
    let finished = false
    let threadReported = false

    const cleanup = (keepAlive = false) => {
      if (finished) return
      finished = true
      cancelSafetyTimer?.()
      cancelSafetyTimer = null
      // Release only this run's slot; sibling runs for the same agent keep theirs.
      const runsForAgent = activeRunsByAgentId.get(agentId)
      if (runsForAgent) {
        runsForAgent.delete(run.run_id)
        if (runsForAgent.size === 0) activeRunsByAgentId.delete(agentId)
      }
      activeSessionsByRunId.delete(run.run_id)
      if (owned) pool.release(owned, keepAlive)
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

    // The session's conversation handle (codex thread id / claude session id) —
    // the run row's conversation pointer for follow-up turns. Codex reports it
    // during start; Claude only after the first prompt triggers system/init. On
    // a resume that fell back to a fresh session this carries the NEW id,
    // healing the conversation chain. Also resolves the init status line.
    const handleThreadStarted = (threadId: string) => {
      if (finished || threadReported) return
      threadReported = true

      manager.sendAgentRunEvent({
        run_id: run.run_id,
        method: "run/thread_started",
        params: { thread_id: threadId },
      })

      // Warm follow-ups still report their thread, but need no startup artifact.
      if (reused) return

      const fellBack = owned?.handle.session.didFallbackToFreshThread() ?? false
      const model = owned?.handle.session.getActiveModel()
      sendSystemStatus(
        `${resumeThreadId && !fellBack
          ? `Resumed local ${adapter.label} agent in ${initTarget}`
          : `Started local ${adapter.label} agent in ${initTarget}`}${
          model ? ` using ${model}` : ""
        }`,
        "done",
      )

      if (resumeThreadId && fellBack) {
        sendSystemStatus(
          "Previous conversation context could not be restored — starting fresh.",
          "done",
          "resume",
        )
      }
    }

    // Forward one native harness notification true-to-source, and drive run
    // lifecycle off it: the adapter says which notification is terminal (codex
    // turn/completed, claude result) and whether it failed.
    const forwardNotification = (method: string, params: Record<string, unknown>) => {
      if (finished) return

      if (adapter.forwardedMethods.has(method)) {
        manager.sendAgentRunEvent({ run_id: run.run_id, method, params })
      }

      const outcome = adapter.turnOutcome(method, params)
      if (outcome) {
        trackRunFinished(run.run_id, outcome.failed ? "failed" : "completed", outcome.error)
        cleanup(!outcome.failed)
      } else {
        trackRunEvent(run.run_id, { event: method, content: "" })
      }
    }

    try {
      const instructions = run.agent.prompt?.trim() ? run.agent.prompt : GROUPCHAT_SYSTEM_PROMPT
      const acquired = pool.acquire(
        JSON.stringify([agentId, run.agent.harness, process.cwd(), run.room, run.root_message_id]),
        adapter,
        {
          instructions,
          resumeThreadId,
          onNotification: forwardNotification,
          onThreadStarted: handleThreadStarted,
          onFatal: (message) => failRun(message),
        },
      )
      owned = acquired.entry
      reused = acquired.reused
      const handle = owned.handle
      activeSessionsByRunId.set(run.run_id, owned)

      // Only a new process needs a visible startup status, before start().
      if (!reused) {
        sendSystemStatus(
          resumeThreadId
            ? `Resuming local ${adapter.label} agent in ${initTarget}`
            : `Initializing local ${adapter.label} agent in ${initTarget}`,
          "in_progress",
        )
      }

      cancelSafetyTimer = schedule(() => {
        failRun("Agent run timed out.")
      }, options.runTimeoutMs ?? RUN_TIMEOUT_MS)

      void (async () => {
        try {
          if (reused) handleThreadStarted(owned!.threadId!)
          else await handle.session.start()
          if (finished) return
          if (!handle.session.isActive()) {
            failRun(handle.session.lastError() || `Failed to start ${adapter.label}.`)
            return
          }

          await handle.session.sendMessage(run.prompt)
          if (finished) return

          // sendMessage swallows failures into lastError; without a started
          // turn no terminal event will ever arrive, so fail now.
          const sendError = handle.session.lastError()
          if (sendError) {
            failRun(`Failed to send prompt to ${adapter.label}: ${sendError}`)
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
   * run's RUNNING turn (codex turn/steer; claude: another stdin user message —
   * the turn keeps streaming into the same run). When the run is gone or the
   * turn just completed (the steer race), answer with `run/steer_rejected` so
   * the backend re-dispatches the prompt as a normal continuation run. Never
   * throws.
   */
  function handleAgentSteer(steer: AgentSteerRequest): void {
    const sendSteerRejected = () => {
      manager.sendAgentRunEvent({
        run_id: steer.run_id,
        method: "run/steer_rejected",
        params: { prompt: steer.prompt },
      })
    }

    const entry = activeSessionsByRunId.get(steer.run_id)
    if (!entry) {
      debugLog("remote-agent-runner", "Steer target not active, rejecting", {
        runId: steer.run_id,
      })
      sendSteerRejected()
      return
    }

    entry.pendingSteers += 1
    void (async () => {
      try {
        const steered = await entry.handle.session.steer(steer.prompt)
        if (steered) {
          debugLog("remote-agent-runner", "Steered run", { runId: steer.run_id })
        } else {
          sendSteerRejected()
        }
      } catch {
        sendSteerRejected()
      } finally {
        entry.pendingSteers -= 1
      }
    })()
  }

  const shutdown = () => {
    if (closed) return
    closed = true
    process.off("exit", shutdown)
    pool.shutdown()
  }
  // Includes the TUI's explicit process.exit() path after Ctrl+C.
  process.once("exit", shutdown)
  return { handleAgentMention, handleAgentSteer, shutdown }
}

const runners = new WeakMap<ChannelManager, ReturnType<typeof createRemoteAgentRunner>>()
function runnerFor(manager: ChannelManager) {
  let runner = runners.get(manager)
  if (!runner) {
    runner = createRemoteAgentRunner(manager)
    runners.set(manager, runner)
  }
  return runner
}

export function handleAgentMention(run: AgentRunRequest, manager: ChannelManager) {
  runnerFor(manager).handleAgentMention(run)
}

export function handleAgentSteer(steer: AgentSteerRequest, manager: ChannelManager) {
  runnerFor(manager).handleAgentSteer(steer)
}

export function shutdownRemoteAgentRunner(manager: ChannelManager) {
  runners.get(manager)?.shutdown()
  runners.delete(manager)
}

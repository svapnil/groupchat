// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
/**
 * Reactive state for the `--remote` control panel.
 *
 * The headless runner (remote-agent-runner.ts) reports run lifecycle and
 * harness events here; RemoteControlView renders them. Module-level signals:
 * the runner lives outside any component tree, and the panel only ever reads.
 */
import { createSignal } from "solid-js"

export type RemoteRunStatus = "running" | "completed" | "failed"

export type RemoteRunEventInfo = {
  /** Native harness notification method (e.g. "item/completed"). */
  event: string
  content: string
  toolName?: string
  at: number
}

export type RemoteRunInfo = {
  runId: string
  agentName: string
  room: string
  prompt: string
  startedAt: number
  finishedAt?: number
  status: RemoteRunStatus
  lastEvent?: RemoteRunEventInfo
  /** Failure summary for the recent-runs list. */
  error?: string
}

const MAX_RECENT_RUNS = 5

const [activeRuns, setActiveRuns] = createSignal<RemoteRunInfo[]>([])
const [recentRuns, setRecentRuns] = createSignal<RemoteRunInfo[]>([])

export { activeRuns as remoteActiveRuns, recentRuns as remoteRecentRuns }

function pushRecent(run: RemoteRunInfo) {
  setRecentRuns((prev) => [run, ...prev].slice(0, MAX_RECENT_RUNS))
}

export function trackRunStarted(info: {
  runId: string
  agentName: string
  room: string
  prompt: string
}): void {
  const run: RemoteRunInfo = {
    ...info,
    startedAt: Date.now(),
    status: "running",
  }
  setActiveRuns((prev) => [...prev.filter((r) => r.runId !== info.runId), run])
}

export function trackRunEvent(
  runId: string,
  event: { event: string; content: string; toolName?: string }
): void {
  const lastEvent: RemoteRunEventInfo = { ...event, at: Date.now() }
  setActiveRuns((prev) =>
    prev.map((run) => (run.runId === runId ? { ...run, lastEvent } : run))
  )
}

export function trackRunFinished(
  runId: string,
  status: "completed" | "failed",
  error?: string
): void {
  setActiveRuns((prev) => {
    const run = prev.find((r) => r.runId === runId)
    if (run) {
      pushRecent({ ...run, status, error, finishedAt: Date.now() })
    }
    return prev.filter((r) => r.runId !== runId)
  })
}

/** A run rejected before it ever started (busy agent, missing codex, ...). */
export function trackRunRejected(
  info: { runId: string; agentName: string; room: string; prompt: string },
  reason: string
): void {
  const now = Date.now()
  pushRecent({
    ...info,
    startedAt: now,
    finishedAt: now,
    status: "failed",
    error: reason,
  })
}

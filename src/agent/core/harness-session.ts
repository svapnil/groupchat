// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
/**
 * The harness-neutral session contract for `groupchat --remote` runs.
 *
 * The headless runner (remote-agent-runner.ts) drives every harness through
 * this interface; each harness (codex app-server, claude stream-json)
 * implements it over its own native transport and registers a
 * `HarnessAdapter` in harness-registry.ts. Native notifications flow out
 * through `onNotification` true-to-source ({method, params}, using each
 * harness's own vocabulary) and are forwarded to the backend as `agent:event`
 * — Chat.Harness on the backend owns the per-harness whitelist/sanitize.
 */

export type RemoteSessionOptions = {
  /** System instructions (agent prompt override or the Groupchat default). */
  instructions: string
  /**
   * The conversation's harness thread/session to cold-resume, or undefined to
   * start fresh. A failed resume falls back to a fresh session
   * (`didFallbackToFreshThread()` reports it) rather than failing the run.
   */
  resumeThreadId?: string
  /** Every native harness notification, before any filtering. */
  onNotification: (method: string, params: Record<string, unknown>) => void
  /**
   * The session's conversation handle (codex thread id / claude session id)
   * once known. Codex knows it during start(); Claude only learns it from the
   * system/init that follows the first prompt — so the runner must treat this
   * as asynchronous. Fired at most once per run.
   */
  onThreadStarted: (threadId: string) => void
  /**
   * The session died without a terminal harness event (process exit, broken
   * stdout). The runner fails the run with `message`.
   */
  onFatal: (message: string) => void
}

export interface RemoteHarnessSession {
  start(): Promise<void>
  sendMessage(prompt: string): Promise<void>
  /**
   * Inject additional user input into the RUNNING turn. Returns false when no
   * turn is active (typically the turn completed first — the steer race);
   * callers then fall back to a continuation run.
   */
  steer(prompt: string): Promise<boolean>
  stop(): void
  isActive(): boolean
  lastError(): string | null
  didFallbackToFreshThread(): boolean
  /** The model the harness resolved for this session, once known. */
  getActiveModel(): string | null
}

export type RemoteSessionHandle = {
  session: RemoteHarnessSession
  /** Tear down any reactive scope the session lives in (no-op when none). */
  dispose: () => void
}

export type HarnessAdapter = {
  /** Human label for status lines ("Codex", "Claude"). */
  label: string
  /**
   * Non-null when the harness can't run on this machine (binary missing);
   * the string is the visible run-failure message.
   */
  unavailableReason(): string | null
  /**
   * Native notification methods forwarded over `agent:event` — mirrors the
   * backend's per-harness `allowed_methods` whitelist so we don't spam it
   * with rejections.
   */
  forwardedMethods: Set<string>
  /**
   * The terminal run outcome a notification implies (codex turn/completed,
   * claude result), or null when the notification isn't terminal.
   */
  turnOutcome(
    method: string,
    params: Record<string, unknown>,
  ): { failed: boolean; error?: string } | null
  createSession(options: RemoteSessionOptions): RemoteSessionHandle
}

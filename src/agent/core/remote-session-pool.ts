// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import type { HarnessAdapter, RemoteSessionHandle, RemoteSessionOptions } from "./harness-session"

type Listeners = Pick<RemoteSessionOptions, "onNotification" | "onThreadStarted" | "onFatal">

export type PooledSession = {
  key: string
  instructions: string
  threadId?: string
  handle: RemoteSessionHandle
  listeners: Listeners | null
  cancelExpiry?: () => void
  pendingSteers: number
  disposed: boolean
}

export type SessionPoolOptions = {
  idleMs?: number
  maxIdle?: number
  /** Returns a cancellation function; injectable for deterministic expiry tests. */
  schedule?: (callback: () => void, ms: number) => () => void
}

/**
 * Owns harness processes independently of run callbacks. One pool belongs to
 * one authenticated connection; keys include agent, harness, cwd and conversation.
 * Codex keeps loaded threads for subsequent turn/start requests:
 * https://learn.chatgpt.com/docs/app-server#start-a-turn
 * Claude accepts successive stream-json inputs while stdin stays open:
 * https://code.claude.com/docs/en/cli-reference (--input-format, --max-turns).
 */
export class RemoteSessionPool {
  private entries = new Map<string, PooledSession>()
  // Insertion order is the order sessions most recently became idle.
  private idle = new Set<PooledSession>()
  private idleMs: number
  private maxIdle: number
  private schedule: NonNullable<SessionPoolOptions["schedule"]>

  constructor(options: SessionPoolOptions = {}) {
    this.idleMs = options.idleMs ?? 5 * 60 * 1000
    this.maxIdle = options.maxIdle ?? 10
    this.schedule = options.schedule ?? ((callback, ms) => {
      const timer = setTimeout(callback, ms)
      timer.unref?.()
      return () => clearTimeout(timer)
    })
  }

  acquire(key: string, adapter: HarnessAdapter, options: RemoteSessionOptions) {
    const entry = this.entries.get(key)
    if (entry) {
      if (entry.listeners) throw new Error("This conversation already has an active run.")
      if (options.resumeThreadId && entry.threadId === options.resumeThreadId &&
          entry.instructions === options.instructions && entry.handle.session.isActive() &&
          !entry.handle.session.lastError()) {
        entry.cancelExpiry?.()
        entry.cancelExpiry = undefined
        this.idle.delete(entry)
        entry.listeners = options
        return { entry, reused: true }
      }
      this.destroy(entry)
    }

    // Construction does not start the harness. Bind ownership before start()
    // can emit any notifications, including synchronous startup failures.
    let owned: PooledSession | undefined
    const handle = adapter.createSession({
      instructions: options.instructions,
      resumeThreadId: options.resumeThreadId,
      onNotification: (method, params) => {
        if (owned && !owned.disposed) owned.listeners?.onNotification(method, params)
      },
      onThreadStarted: (threadId) => {
        if (!owned || owned.disposed) return
        owned.threadId = threadId
        owned.listeners?.onThreadStarted(threadId)
      },
      onFatal: (message) => {
        if (!owned || owned.disposed) return
        const listeners = owned.listeners
        this.destroy(owned)
        listeners?.onFatal(message)
      },
    })
    owned = {
      key, instructions: options.instructions, listeners: options, handle,
      pendingSteers: 0, disposed: false,
    }
    this.entries.set(key, owned)
    return { entry: owned, reused: false }
  }

  release(entry: PooledSession, keepAlive: boolean) {
    if (entry.disposed) return
    entry.listeners = null
    if (!keepAlive || entry.pendingSteers > 0 || !entry.threadId ||
        !entry.handle.session.isActive() || entry.handle.session.lastError() ||
        this.idleMs <= 0 || this.maxIdle <= 0) {
      this.destroy(entry)
      return
    }
    this.idle.add(entry)
    entry.cancelExpiry = this.schedule(() => this.destroy(entry), this.idleMs)
    while (this.idle.size > this.maxIdle) this.destroy(this.idle.values().next().value!)
  }

  private destroy(entry: PooledSession) {
    if (entry.disposed) return
    entry.disposed = true
    entry.listeners = null
    entry.cancelExpiry?.()
    this.idle.delete(entry)
    if (this.entries.get(entry.key) === entry) this.entries.delete(entry.key)
    try { entry.handle.session.stop() } catch { /* best-effort shutdown */ }
    try { entry.handle.dispose() } catch { /* always dispose the reactive root */ }
  }

  shutdown() {
    for (const entry of this.entries.values()) {
      const listeners = entry.listeners
      this.destroy(entry)
      listeners?.onFatal("Remote connection closed.")
    }
  }
}

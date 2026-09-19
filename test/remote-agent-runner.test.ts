// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { afterEach, describe, expect, test } from "bun:test"
import { createRemoteAgentRunner } from "../src/agent/core/remote-agent-runner"
import { getHarnessAdapter } from "../src/agent/core/harness-registry"
import type { RemoteHarnessSession, RemoteSessionOptions } from "../src/agent/core/harness-session"
import type { AgentRunEventPayload, AgentRunRequest } from "../src/lib/types"
import type { ChannelManager } from "../src/lib/channel-manager"

const cleanups: Array<() => void> = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })

async function flush() { for (let i = 0; i < 100; i++) await Promise.resolve() }

function fixture(harness: string, maxIdle = 10, readTitle?: () => Promise<string | null>) {
  const events: AgentRunEventPayload[] = []
  const timers: Array<{ callback: () => void; ms: number; cancelled: boolean }> = []
  const processes: Array<{
    options: RemoteSessionOptions
    session: RemoteHarnessSession
    starts: number
    stops: number
    disposals: number
    prompts: string[]
    threadId: string
  }> = []
  const adapter = getHarnessAdapter(harness)!
  const manager = { sendAgentRunEvent: (event: AgentRunEventPayload) => events.push(event), sendAgentRunEventAcknowledged: async (event: AgentRunEventPayload) => { events.push(event) } } as unknown as ChannelManager
  const runner = createRemoteAgentRunner(manager, {
    maxIdle,
    schedule: (callback, ms) => {
      const timer = { callback, ms, cancelled: false }
      timers.push(timer)
      return () => { timer.cancelled = true }
    },
    getAdapter: () => ({
      ...adapter,
      unavailableReason: () => null,
      createSession: (options) => {
        let active = false
        let reported = false
        const threadId = options.resumeThreadId ?? `thread-${processes.length}`
        const report = () => {
          if (!reported) { reported = true; options.onThreadStarted(threadId) }
        }
        const proc = {
          options, threadId, starts: 0, stops: 0, disposals: 0, prompts: [] as string[],
          session: {
            start: async () => { proc.starts++; active = true; if (harness === "codex") report() },
            sendMessage: async (prompt: string) => { proc.prompts.push(prompt); report() },
            steer: async () => true,
            stop: () => { proc.stops++; active = false },
            isActive: () => active,
            lastError: () => null,
            didFallbackToFreshThread: () => false,
            getActiveModel: () => "test-model",
            ...(readTitle ? { getTitle: readTitle } : {}),
          } satisfies RemoteHarnessSession,
        }
        processes.push(proc)
        return { session: proc.session, dispose: () => { proc.disposals++ } }
      },
    }),
  })
  cleanups.push(runner.shutdown)
  const run = (id: string, extra: Partial<AgentRunRequest> = {}): AgentRunRequest => ({
    run_id: id, agent: { id: "agent", name: "Agent", harness, prompt: null },
    prompt: id, room: "room", root_message_id: "root", run_message_id: id,
    mode: "start", resume_thread_id: null, ...extra,
  })
  const terminal = harness === "codex" ? "turn/completed" : "result"
  const complete = (index = 0, failed = false) => {
    processes[index].options.onNotification(terminal, harness === "codex"
      ? { threadId: processes[index].threadId, turn: { id: `turn-${events.length}`, status: failed ? "failed" : "completed" } }
      : { subtype: failed ? "error_during_execution" : "success", is_error: failed })
  }
  const follow = (id: string, index = 0) => run(id, { mode: "continue", resume_thread_id: processes[index].threadId })
  return { runner, manager, events, timers, processes, run, complete, follow, terminal }
}

for (const harness of ["codex", "claude"]) {
  describe(`${harness} remote runner`, () => {
    test("publishes titles after terminal completion without reopening the run", async () => {
      let title: string | null = null
      const f = fixture(harness, 10, async () => title)
      f.runner.handleAgentMention(f.run("first"))
      await flush()
      f.complete(); await flush()
      title = "Conversation titles"
      const poll = f.timers.find((timer) => timer.ms === 3000 && !timer.cancelled)!
      expect(poll).toBeDefined()
      poll.callback(); await flush()
      expect(f.events.filter((event) => event.method === "system/thread_metadata")).toEqual([
        { run_id: "first", method: "system/thread_metadata", params: { title } },
      ])
      expect(f.processes[0].prompts).toEqual(["first"])
      expect(f.events.filter((event) => event.method === f.terminal)).toHaveLength(1)
    })

    test("waits for final output acknowledgment before completion and session reuse", async () => {
      const f = fixture(harness)
      f.runner.handleAgentMention(f.run("first")); await flush()
      const answerMethod = harness === "codex" ? "item/completed" : "assistant"
      let acknowledge!: () => void
      f.manager.sendAgentRunEventAcknowledged = async event => {
        f.events.push(event)
        if (event.method === answerMethod) await new Promise<void>(resolve => { acknowledge = resolve })
      }
      f.processes[0].options.onNotification(answerMethod, {})
      f.complete(); await flush()
      expect(f.events.some(e => e.method === f.terminal)).toBe(false)
      expect(f.timers.some(t => t.ms === 300_000)).toBe(false)
      acknowledge(); await flush()
      expect(f.events.filter(e => e.method === f.terminal)).toHaveLength(1)
      expect(f.timers.some(t => t.ms === 300_000)).toBe(true)
    })

    test("failed output persistence suppresses completion and fails the run explicitly", async () => {
      const f = fixture(harness)
      f.runner.handleAgentMention(f.run("first")); await flush()
      f.manager.sendAgentRunEventAcknowledged = async () => { throw new Error("answer exceeds 1 MiB") }
      f.processes[0].options.onNotification(harness === "codex" ? "item/completed" : "assistant", {})
      f.complete(); await flush()
      expect(f.events.some(e => e.method === f.terminal)).toBe(false)
      expect(f.events.filter(e => e.method === "run/failed")).toHaveLength(1)
      expect(f.events.find(e => e.method === "run/failed")?.params.message).toContain("not saved")
      expect(f.processes[0].stops).toBe(1)
    })

    test("a steer rejection waits for pending terminal delivery before reopening", async () => {
      const f = fixture(harness)
      f.runner.handleAgentMention(f.run("first")); await flush()
      let acknowledge!: () => void
      f.manager.sendAgentRunEventAcknowledged = async event => {
        f.events.push(event)
        if (event.method === f.terminal) await new Promise<void>(resolve => { acknowledge = resolve })
      }
      f.complete(); await flush()
      f.processes[0].session.steer = async () => false
      f.runner.handleAgentSteer({ run_id: "first", prompt: "follow up" }); await flush()
      expect(f.events.some(e => e.method === "run/steer_rejected")).toBe(false)
      acknowledge(); await flush()
      expect(f.events.filter(e => e.method === "run/steer_rejected")).toHaveLength(1)
      expect(f.processes[0].stops).toBe(1)
    })

    test("a process exit after the terminal notification does not discard pending output", async () => {
      const f = fixture(harness)
      f.runner.handleAgentMention(f.run("first")); await flush()
      let acknowledge!: () => void
      f.manager.sendAgentRunEventAcknowledged = async event => {
        f.events.push(event)
        if (event.method === f.terminal) await new Promise<void>(resolve => { acknowledge = resolve })
      }
      f.complete(); await flush()
      f.processes[0].options.onFatal("process closed")
      expect(f.events.some(e => e.method === "run/failed")).toBe(false)
      acknowledge(); await flush()
      expect(f.events.filter(e => e.method === f.terminal)).toHaveLength(1)
      expect(f.events.some(e => e.method === "run/failed")).toBe(false)
    })

    test("reuses a live session and binds events and thread metadata to each new run", async () => {
      const f = fixture(harness)
      f.runner.handleAgentMention(f.run("first"))
      await flush()
      f.complete(); await flush()
      expect(f.processes[0].stops).toBe(0)
      const eventCount = f.events.length
      f.complete(); await flush() // Late events while idle must not change the completed run.
      expect(f.events).toHaveLength(eventCount)
      f.runner.handleAgentMention(f.follow("second"))
      await flush()
      f.complete(); await flush()
      expect(f.processes).toHaveLength(1)
      expect(f.processes[0].starts).toBe(1)
      expect(f.processes[0].prompts).toEqual(["first", "second"])
      expect(f.events.filter(e => e.method === f.terminal).map(e => e.run_id)).toEqual(["first", "second"])
      expect(f.events.filter(e => e.method === "run/thread_started").map(e => e.run_id)).toEqual(["first", "second"])
      expect(f.events.filter(e => e.run_id === "second" && e.method === "system/status")).toEqual([])
      expect(f.events.filter(e => e.run_id === "first" && e.method === "system/status").map(e => e.params.status)).toEqual(["in_progress", "done"])
      const idleTimers = f.timers.filter(t => t.ms === 300_000)
      expect(idleTimers).toHaveLength(2)
      expect(idleTimers[0].cancelled).toBe(true)
      expect(idleTimers[1].cancelled).toBe(false)
    })

    test("expires idle sessions and cold-resumes the stored conversation", async () => {
      const f = fixture(harness)
      f.runner.handleAgentMention(f.run("first")); await flush(); f.complete(); await flush()
      f.timers.find(t => t.ms === 300_000)!.callback()
      expect(f.processes[0].stops).toBe(1)
      expect(f.processes[0].disposals).toBe(1)
      f.runner.handleAgentMention(f.follow("second")); await flush()
      expect(f.processes).toHaveLength(2)
      expect(f.processes[1].options.resumeThreadId).toBe(f.processes[0].threadId)
      expect(f.events.filter(e => e.run_id === "second" && e.method === "system/status").map(e => e.params.status)).toEqual(["in_progress", "done"])
    })

    test("evicts the least recently used idle process without evicting busy sessions", async () => {
      const f = fixture(harness, 1)
      f.runner.handleAgentMention(f.run("first")); await flush(); f.complete(); await flush()
      f.runner.handleAgentMention(f.run("other", { root_message_id: "other-root" })); await flush()
      expect(f.processes[0].stops).toBe(0)
      f.complete(1); await flush()
      expect(f.processes[0].stops).toBe(1)
      expect(f.processes[1].stops).toBe(0)
    })

    test("rejects simultaneous runs in a conversation but allows separate conversations", async () => {
      const f = fixture(harness)
      f.runner.handleAgentMention(f.run("first")); await flush()
      f.runner.handleAgentMention(f.follow("collision")); await flush()
      expect(f.processes).toHaveLength(1)
      expect(f.events.some(e => e.run_id === "collision" && e.method === "run/failed")).toBe(true)
      f.runner.handleAgentMention(f.run("other", { root_message_id: "other-root" })); await flush()
      expect(f.processes).toHaveLength(2)
      f.complete(); await flush(); f.complete(1); await flush()
      expect(f.events.filter(e => e.method === f.terminal).map(e => e.run_id)).toEqual(["first", "other"])
    })

    test("discards idle sessions when instructions change", async () => {
      const f = fixture(harness)
      const first = f.run("first")
      f.runner.handleAgentMention(first); await flush(); f.complete(); await flush()
      f.runner.handleAgentMention({ ...f.follow("second"), agent: { ...first.agent, prompt: "New instructions" } }); await flush()
      expect(f.processes[0].stops).toBe(1)
      expect(f.processes[1].options.instructions).toBe("New instructions")
    })

    test("does not reuse a dead process or a failed turn", async () => {
      const f = fixture(harness)
      f.runner.handleAgentMention(f.run("first")); await flush(); f.complete(); await flush()
      f.processes[0].session.isActive = () => false
      f.runner.handleAgentMention(f.follow("second")); await flush()
      expect(f.processes).toHaveLength(2)
      f.complete(1, true); await flush()
      expect(f.processes[1].stops).toBe(1)
    })

    test("fatal exits evict idle sessions and fail active runs exactly once", async () => {
      const f = fixture(harness)
      f.runner.handleAgentMention(f.run("first")); await flush(); f.complete(); await flush()
      f.processes[0].options.onFatal("idle exit")
      expect(f.events.filter(e => e.method === "run/failed")).toHaveLength(0)
      f.runner.handleAgentMention(f.follow("second")); await flush()
      f.processes[1].options.onFatal("active exit")
      f.processes[1].options.onFatal("duplicate exit"); await flush()
      expect(f.events.filter(e => e.method === "run/failed").map(e => e.run_id)).toEqual(["second"])
      expect(f.processes[1].stops).toBe(1)
    })

    test("timeouts and shutdown stop processes and cancel timers", async () => {
      const f = fixture(harness)
      f.runner.handleAgentMention(f.run("first")); await flush()
      f.timers.find(t => t.ms === 1_800_000)!.callback()
      expect(f.processes[0].stops).toBe(1)
      f.runner.handleAgentMention(f.follow("second")); await flush(); f.complete(1); await flush()
      f.runner.handleAgentMention(f.run("busy", { root_message_id: "busy" })); await flush()
      f.runner.shutdown()
      expect(f.processes.map(p => p.stops)).toEqual([1, 1, 1])
      expect(f.processes.map(p => p.disposals)).toEqual([1, 1, 1])
      expect(f.timers.every(t => t.cancelled)).toBe(true)
      f.runner.handleAgentMention(f.run("after-shutdown"))
      expect(f.processes).toHaveLength(3)
    })

    test("retires a process if a turn completes while steering is in flight", async () => {
      const f = fixture(harness)
      f.runner.handleAgentMention(f.run("first")); await flush()
      let resolve!: (accepted: boolean) => void
      f.processes[0].session.steer = () => new Promise<boolean>(r => { resolve = r })
      f.runner.handleAgentSteer({ run_id: "first", prompt: "steer" })
      f.complete(); await flush()
      expect(f.processes[0].stops).toBe(1)
      resolve(false); await flush()
      expect(f.events.some(e => e.method === "run/steer_rejected")).toBe(true)
      f.runner.handleAgentMention(f.follow("second")); await flush()
      expect(f.processes).toHaveLength(2)
    })
  })
}

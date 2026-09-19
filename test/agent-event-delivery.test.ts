// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { describe, expect, test } from "bun:test"
import { deliverAgentEvent, validateAgentEvent, type EventChannel } from "../src/lib/agent-event-delivery"
import type { AgentRunEventPayload } from "../src/lib/types"

function transport(outcomes: Array<{ status: string; reason?: string }>) {
  const sent: AgentRunEventPayload[] = []
  const channel: EventChannel = {
    push: (_event, payload) => {
      sent.push(payload as AgentRunEventPayload)
      const outcome = outcomes.shift()!
      const push = { receive: (status: string, cb: (response: unknown) => void) => {
        if (outcome.status === status) queueMicrotask(() => cb({ reason: outcome.reason }))
        return push
      } }
      return push
    },
  }
  return { sent, channel }
}
const payload = (): AgentRunEventPayload => ({ run_id: "run", method: "item/completed", params: { item: { id: "answer", type: "agentMessage", text: "Done" } } })

describe("agent event delivery", () => {
  test("preserves Unicode answers up to exactly 1 MiB without truncation", async () => {
    const f = transport([{ status: "ok" }])
    const event = payload()
    const text = "🙂".repeat(262_144)
    event.params.item = { id: "answer", type: "agentMessage", text }
    await deliverAgentEvent(() => f.channel, event)
    expect((f.sent[0].params.item as { text: string }).text).toBe(text)
    expect(() => validateAgentEvent({ text: text + "a" })).toThrow("1 MiB")
  })
  test("leaves room for JSON escaping and rejects excessive total bytes", () => {
    expect(() => validateAgentEvent({ text: "\u0000".repeat(1_048_576) })).not.toThrow()
    expect(() => validateAgentEvent({ a: "\u0000".repeat(1_048_576), b: "\u0000".repeat(1_048_576) })).toThrow("8 MiB")
  })
  test("retries a lost acknowledgment with the same event ID and unchanged body", async () => {
    const f = transport([{ status: "timeout" }, { status: "ok" }])
    await deliverAgentEvent(() => f.channel, payload(), async () => {})
    expect(f.sent).toHaveLength(2)
    expect(f.sent[0].event_id).toBeTruthy()
    expect(f.sent[1]).toEqual(f.sent[0])
  })
  test("retries temporary failures but stops after three attempts", async () => {
    const f = transport(Array.from({ length: 3 }, () => ({ status: "error", reason: "run_unavailable" })))
    await expect(deliverAgentEvent(() => f.channel, payload(), async () => {})).rejects.toThrow("run_unavailable")
    expect(f.sent).toHaveLength(3)
    expect(new Set(f.sent.map(e => e.event_id)).size).toBe(1)
  })
  test("does not retry permanent rejections or silently truncate oversized output", async () => {
    const f = transport([{ status: "error", reason: "answer too large" }])
    await expect(deliverAgentEvent(() => f.channel, payload())).rejects.toThrow("answer too large")
    expect(f.sent).toHaveLength(1)
    await expect(deliverAgentEvent(() => f.channel, { ...payload(), params: { text: "x".repeat(1_048_577) } })).rejects.toThrow("1 MiB")
    expect(f.sent).toHaveLength(1)
  })
  test("live deltas carry no receipt ID and do not wait for acknowledgments", async () => {
    const f = transport([{ status: "never" }])
    await deliverAgentEvent(() => f.channel, { ...payload(), method: "item/agentMessage/delta" })
    expect(f.sent[0].event_id).toBeUndefined()
  })
})

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import type { AgentRunEventPayload } from "./types"

const MAX_STRING_BYTES = 1_048_576
const MAX_EVENT_BYTES = 8_388_608
const encoder = new TextEncoder()
const DURABLE = new Set([
  "item/started", "item/completed", "assistant", "user", "result",
  "turn/started", "turn/completed", "system/status", "run/thread_started", "run/failed",
])
export function isDurableAgentEvent(method: string): boolean { return DURABLE.has(method) }

export function validateAgentEvent(params: Record<string, unknown>): void {
  const visit = (value: unknown, depth: number): void => {
    if (typeof value === "string" && encoder.encode(value).byteLength > MAX_STRING_BYTES)
      throw new Error("Agent event exceeds 1 MiB UTF-8 string limit; output was not saved.")
    if (value && typeof value === "object") {
      if (depth > 8 || (Array.isArray(value) && value.length > 256))
        throw new Error("Agent event exceeds nesting or array limits; output was not saved.")
      for (const [key, child] of Object.entries(value)) {
        visit(key, depth + 1)
        visit(child, depth + 1)
      }
    }
  }
  visit(params, 1)
  if (encoder.encode(JSON.stringify(params)).byteLength > MAX_EVENT_BYTES)
    throw new Error("Agent event exceeds 8 MiB JSON limit; output was not saved.")
}

type EventPush = {
  receive(status: string, callback: (response: unknown) => void): EventPush
}
export type EventChannel = {
  push(event: string, payload: object, timeout: number): EventPush
}
class RetryableDeliveryError extends Error {}

/** Retry only ambiguous/temporary failures, always using the same event ID. */
export async function deliverAgentEvent(
  channel: () => EventChannel | null,
  payload: AgentRunEventPayload,
  wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
  waitForAcknowledgment = false,
): Promise<void> {
  validateAgentEvent(payload.params)
  const durable = isDurableAgentEvent(payload.method)
  // Snapshot before awaiting so a harness cannot mutate a queued/retried event.
  const wire = JSON.parse(JSON.stringify({ ...payload, ...(durable ? { event_id: payload.event_id ?? crypto.randomUUID() } : {}) }))
  for (let attempt = 0; ; attempt++) {
    try {
      const current = channel()
      if (!current) throw new RetryableDeliveryError("Agent event connection unavailable")
      await new Promise<void>((resolve, reject) => {
        current.push("agent:event", wire, 15_000)
          .receive("ok", () => resolve())
          .receive("error", (response: unknown) => {
            const reason = (response as { reason?: string } | undefined)?.reason ?? "Agent event rejected"
            reject(reason === "run_unavailable" ? new RetryableDeliveryError(reason) : new Error(reason))
          })
          .receive("timeout", () => reject(new RetryableDeliveryError("Agent event acknowledgment timed out")))
        if (!durable && !waitForAcknowledgment) resolve()
      })
      return
    } catch (error) {
      if (!durable || !(error instanceof RetryableDeliveryError) || attempt >= 2) throw error
      await wait(attempt === 0 ? 250 : 1000)
    }
  }
}

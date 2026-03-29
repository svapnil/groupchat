// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import type { CxEventMetadata, Message } from "../../lib/types"

export const AGENT_ID = "codex" as const
export const CX_WIRE_TYPE = "cx" as const

const CX_EVENT_TYPES = new Set([
  "question",
  "thinking",
  "tool_call",
  "tool_progress",
  "tool_result",
  "text_stream",
  "text",
  "result",
])

const LIVE_CX_EVENT_TYPES = new Set(["thinking", "tool_progress", "text_stream"])

function normalizeCxSessionId(sessionId: unknown): string | undefined {
  if (typeof sessionId !== "string") return undefined
  const trimmed = sessionId.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function toCxEvent(meta: CxEventMetadata): CxEventMetadata {
  return {
    turn_id: meta.turn_id,
    session_id: normalizeCxSessionId(meta.session_id),
    event: meta.event,
    tool_name: typeof meta.tool_name === "string" ? meta.tool_name : undefined,
    tool_use_id: typeof meta.tool_use_id === "string" ? meta.tool_use_id : undefined,
    is_error: typeof meta.is_error === "boolean" ? meta.is_error : undefined,
    output_tokens: typeof meta.output_tokens === "number" ? meta.output_tokens : undefined,
    elapsed_seconds: typeof meta.elapsed_seconds === "number" ? meta.elapsed_seconds : undefined,
    stop_reason: typeof meta.stop_reason === "string" ? meta.stop_reason : undefined,
  }
}

function getCxGroupingKey(username: string, cx: CxEventMetadata): string {
  if (cx.session_id) return `${username}:agent:${AGENT_ID}:session:${cx.session_id}`
  return `${username}:agent:${AGENT_ID}:turn:${cx.turn_id}`
}

function getCxMetadata(message: Message): CxEventMetadata | null {
  if (!message.attributes?.cx || typeof message.attributes.cx !== "object") return null

  const cx = message.attributes.cx as CxEventMetadata
  if (typeof cx.turn_id !== "string") return null
  if (!CX_EVENT_TYPES.has(cx.event)) return null
  return cx
}

export function isCodexEventMessage(message: Message): boolean {
  return getCxMetadata(message) !== null
}

function getCxEventsAndContents(cx: CxEventMetadata, fallbackContent: string): {
  events: CxEventMetadata[]
  contents: string[]
} {
  const events = Array.isArray(cx.events) ? cx.events.map(toCxEvent) : [toCxEvent(cx)]
  const contents = Array.isArray(cx.contents)
    ? cx.contents.map((entry) => (typeof entry === "string" ? entry : ""))
    : [fallbackContent]

  while (contents.length < events.length) {
    contents.push("")
  }

  if (contents.length > events.length) {
    contents.splice(events.length)
  }

  return { events, contents }
}

function shouldReplaceLatestEvent(events: CxEventMetadata[], incoming: CxEventMetadata): boolean {
  const last = events[events.length - 1]
  if (!last) return false
  if (last.turn_id !== incoming.turn_id) return false

  if (incoming.event === "text" && last.event === "text_stream") return true
  if (incoming.event === "text_stream" && last.event === "text_stream") return true
  if (incoming.event === "thinking" && last.event === "thinking") return true

  if (incoming.event === "tool_progress" && last.event === "tool_progress") {
    const lastToolKey = last.tool_use_id || last.tool_name || ""
    const incomingToolKey = incoming.tool_use_id || incoming.tool_name || ""
    return lastToolKey === incomingToolKey
  }

  return LIVE_CX_EVENT_TYPES.has(incoming.event) && incoming.event === last.event
}

export function upsertCodexEventMessage(messages: Message[], incoming: Message, myUsername: string | null): Message[] {
  const incomingCx = getCxMetadata(incoming)
  if (!incomingCx) {
    return [...messages, incoming]
  }

  if (myUsername && incoming.username === myUsername) {
    return messages
  }

  const normalizedIncoming = toCxEvent(incomingCx)
  const incomingContent = incoming.content ?? ""
  const incomingGroupingKey = getCxGroupingKey(incoming.username, normalizedIncoming)

  const existingIndex = messages.findIndex((candidate) => {
    if (candidate.username !== incoming.username) return false
    const existingCx = getCxMetadata(candidate)
    if (!existingCx) return false
    return getCxGroupingKey(candidate.username, toCxEvent(existingCx)) === incomingGroupingKey
  })

  if (existingIndex === -1) {
    return [
      ...messages,
      {
        ...incoming,
        type: CX_WIRE_TYPE,
        attributes: {
          ...(incoming.attributes ?? {}),
          cx: {
            ...normalizedIncoming,
            events: [normalizedIncoming],
            contents: [incomingContent],
          },
        },
      },
    ]
  }

  const existing = messages[existingIndex]
  const existingCx = getCxMetadata(existing)
  if (!existingCx) {
    return [...messages, incoming]
  }

  const existingAccumulated = getCxEventsAndContents(existingCx, existing.content ?? "")
  const nextEvents = [...existingAccumulated.events]
  const nextContents = [...existingAccumulated.contents]

  if (shouldReplaceLatestEvent(nextEvents, normalizedIncoming)) {
    nextEvents[nextEvents.length - 1] = normalizedIncoming
    nextContents[nextContents.length - 1] = incomingContent
  } else {
    nextEvents.push(normalizedIncoming)
    nextContents.push(incomingContent)
  }

  return messages.map((candidate, index) => {
    if (index !== existingIndex) return candidate
    return {
      ...candidate,
      content: incomingContent,
      type: CX_WIRE_TYPE,
      attributes: {
        ...(candidate.attributes ?? {}),
        cx: {
          ...normalizedIncoming,
          events: nextEvents,
          contents: nextContents,
        },
      },
    }
  })
}

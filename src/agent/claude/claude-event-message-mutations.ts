// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import type { CcEventMetadata, Message } from "../../lib/types"

/** Agent identity — used for command routing, session IDs, and display-name/color lookup. */
export const AGENT_ID = "claude" as const

/** Wire-format tag for Claude Code event messages (`message.type` and `message.attributes.cc`). */
export const CC_WIRE_TYPE = "cc" as const

const CC_EVENT_TYPES = new Set([
  "question",
  "thinking",
  "tool_call",
  "tool_progress",
  "tool_result",
  "text_stream",
  "text",
  "result",
])

const LIVE_CC_EVENT_TYPES = new Set(["thinking", "tool_progress", "text_stream"])

function normalizeCcSessionId(sessionId: unknown): string | undefined {
  if (typeof sessionId !== "string") return undefined
  const trimmed = sessionId.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function toCcEvent(meta: CcEventMetadata): CcEventMetadata {
  return {
    turn_id: meta.turn_id,
    session_id: normalizeCcSessionId(meta.session_id),
    event: meta.event,
    tool_name: typeof meta.tool_name === "string" ? meta.tool_name : undefined,
    tool_use_id: typeof meta.tool_use_id === "string" ? meta.tool_use_id : undefined,
    is_error: typeof meta.is_error === "boolean" ? meta.is_error : undefined,
    output_tokens: typeof meta.output_tokens === "number" ? meta.output_tokens : undefined,
    elapsed_seconds: typeof meta.elapsed_seconds === "number" ? meta.elapsed_seconds : undefined,
    stop_reason: typeof meta.stop_reason === "string" ? meta.stop_reason : undefined,
  }
}

function getCcGroupingKey(username: string, cc: CcEventMetadata): string {
  if (cc.session_id) return `${username}:agent:${AGENT_ID}:session:${cc.session_id}`
  return `${username}:agent:${AGENT_ID}:turn:${cc.turn_id}`
}

function getCcMetadata(message: Message): CcEventMetadata | null {
  if (!message.attributes?.cc || typeof message.attributes.cc !== "object") return null

  const cc = message.attributes.cc as CcEventMetadata
  if (typeof cc.turn_id !== "string") return null
  if (!CC_EVENT_TYPES.has(cc.event)) return null
  return cc
}

export function isClaudeEventMessage(message: Message): boolean {
  return getCcMetadata(message) !== null
}

function getCcEventsAndContents(cc: CcEventMetadata, fallbackContent: string): {
  events: CcEventMetadata[]
  contents: string[]
} {
  const events = Array.isArray(cc.events) ? cc.events.map(toCcEvent) : [toCcEvent(cc)]
  const contents = Array.isArray(cc.contents)
    ? cc.contents.map((entry) => (typeof entry === "string" ? entry : ""))
    : [fallbackContent]

  while (contents.length < events.length) {
    contents.push("")
  }

  if (contents.length > events.length) {
    contents.splice(events.length)
  }

  return { events, contents }
}

function shouldReplaceLatestEvent(events: CcEventMetadata[], incoming: CcEventMetadata): boolean {
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

  return LIVE_CC_EVENT_TYPES.has(incoming.event) && incoming.event === last.event
}

export function upsertClaudeEventMessage(messages: Message[], incoming: Message, myUsername: string | null): Message[] {
  const incomingCc = getCcMetadata(incoming)
  if (!incomingCc) {
    return [...messages, incoming]
  }

  if (myUsername && incoming.username === myUsername) {
    return messages
  }

  const normalizedIncoming = toCcEvent(incomingCc)
  const incomingContent = incoming.content ?? ""
  const incomingGroupingKey = getCcGroupingKey(incoming.username, normalizedIncoming)

  const existingIndex = messages.findIndex((candidate) => {
    if (candidate.username !== incoming.username) return false
    const existingCc = getCcMetadata(candidate)
    if (!existingCc) return false
    return getCcGroupingKey(candidate.username, toCcEvent(existingCc)) === incomingGroupingKey
  })

  if (existingIndex === -1) {
    return [
      ...messages,
      {
        ...incoming,
        type: CC_WIRE_TYPE,
        attributes: {
          ...(incoming.attributes ?? {}),
          cc: {
            ...normalizedIncoming,
            events: [normalizedIncoming],
            contents: [incomingContent],
          },
        },
      },
    ]
  }

  const existing = messages[existingIndex]
  const existingCc = getCcMetadata(existing)
  if (!existingCc) {
    return [...messages, incoming]
  }

  const existingAccumulated = getCcEventsAndContents(existingCc, existing.content ?? "")
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
      type: "cc",
      attributes: {
        ...(candidate.attributes ?? {}),
        cc: {
          ...normalizedIncoming,
          events: nextEvents,
          contents: nextContents,
        },
      },
    }
  })
}

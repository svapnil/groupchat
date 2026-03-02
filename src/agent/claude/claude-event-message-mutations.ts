// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import type { CcEventMetadata, Message } from "../../lib/types"

/** Agent identity — used for command routing, session IDs, and display-name/color lookup. */
export const AGENT_ID = "claude" as const

/** Wire-format tag for Claude Code event messages (`message.type` and `message.attributes.cc`). */
export const CC_WIRE_TYPE = "cc" as const

const CC_EVENT_TYPES = new Set(["question", "tool_call", "text", "result"])

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
    is_error: typeof meta.is_error === "boolean" ? meta.is_error : undefined,
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
  const nextEvents = [...existingAccumulated.events, normalizedIncoming]
  const nextContents = [...existingAccumulated.contents, incomingContent]

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

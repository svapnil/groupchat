// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import type { BashEventMetadata, Message } from "../lib/types"
import {
  BASH_OUTPUT_WIRE_TYPE,
  BASH_PROMPT_WIRE_TYPE,
  getBashEventTimeline,
  getBashMetadata,
  normalizeBashMetadata,
} from "./shared"

function getBashGroupingKey(username: string, metadata: BashEventMetadata): string {
  return `${username}:bash:${metadata.command_id}`
}

function shouldReplaceLatestEvent(events: BashEventMetadata[], incoming: BashEventMetadata): boolean {
  const last = events[events.length - 1]
  if (!last) return false
  if (last.command_id !== incoming.command_id) return false

  return last.event === "output" && incoming.event === "output"
}

export function isBashEventMessage(message: Message): boolean {
  return getBashMetadata(message) !== null
}

export function upsertBashEventMessage(messages: Message[], incoming: Message): Message[] {
  const incomingBash = getBashMetadata(incoming)
  if (!incomingBash) {
    return [...messages, incoming]
  }

  const normalizedIncoming = normalizeBashMetadata(incomingBash)
  const incomingContent = incoming.content ?? ""
  const incomingGroupingKey = getBashGroupingKey(incoming.username, normalizedIncoming)

  const existingIndex = messages.findIndex((candidate) => {
    if (candidate.username !== incoming.username) return false
    const existingBash = getBashMetadata(candidate)
    if (!existingBash) return false
    return getBashGroupingKey(candidate.username, existingBash) === incomingGroupingKey
  })

  if (existingIndex === -1) {
    return [
      ...messages,
      {
        ...incoming,
        type: incoming.type === BASH_OUTPUT_WIRE_TYPE ? BASH_OUTPUT_WIRE_TYPE : BASH_PROMPT_WIRE_TYPE,
        attributes: {
          ...(incoming.attributes ?? {}),
          bash: {
            ...normalizedIncoming,
            events: [normalizedIncoming],
            contents: [incomingContent],
          },
        },
      },
    ]
  }

  const existing = messages[existingIndex]
  const existingTimeline = getBashEventTimeline(existing)
  const nextEvents = [...existingTimeline.events]
  const nextContents = [...existingTimeline.contents]

  if (shouldReplaceLatestEvent(nextEvents, normalizedIncoming)) {
    nextEvents[nextEvents.length - 1] = normalizedIncoming
    nextContents[nextContents.length - 1] = incomingContent
  } else {
    nextEvents.push(normalizedIncoming)
    nextContents.push(incomingContent)
  }

  const nextType = nextEvents.some((event) => event.event === "output")
    ? BASH_OUTPUT_WIRE_TYPE
    : BASH_PROMPT_WIRE_TYPE

  return messages.map((candidate, index) => {
    if (index !== existingIndex) return candidate

    return {
      ...candidate,
      content: incomingContent,
      type: nextType,
      attributes: {
        ...(candidate.attributes ?? {}),
        bash: {
          ...normalizedIncoming,
          event: nextType === BASH_OUTPUT_WIRE_TYPE ? "output" : "prompt",
          events: nextEvents,
          contents: nextContents,
        },
      },
    }
  })
}

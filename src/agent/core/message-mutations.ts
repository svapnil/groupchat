// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import type { Message } from "../../lib/types"
import { isClaudeEventMessage, upsertClaudeEventMessage } from "../claude/claude-event-message-mutations"

type AgentMessageMutator = (
  messages: Message[],
  incoming: Message,
  myUsername: string | null
) => Message[] | null

const upsertClaudeEventMutator: AgentMessageMutator = (messages, incoming, myUsername) => {
  if (!isClaudeEventMessage(incoming)) return null
  return upsertClaudeEventMessage(messages, incoming, myUsername)
}

/**
 * Add mutators in priority order as new agent message formats are introduced.
 */
const AGENT_MESSAGE_MUTATORS: AgentMessageMutator[] = [
  upsertClaudeEventMutator,
]

export function upsertAgentMessage(
  messages: Message[],
  incoming: Message,
  myUsername: string | null
): Message[] {
  for (const mutate of AGENT_MESSAGE_MUTATORS) {
    const updated = mutate(messages, incoming, myUsername)
    if (updated) return updated
  }

  return [...messages, incoming]
}

export function condenseAgentMessages(messages: Message[], myUsername: string | null): Message[] {
  return messages.reduce(
    (acc, message) => upsertAgentMessage(acc, message, myUsername),
    [] as Message[]
  )
}

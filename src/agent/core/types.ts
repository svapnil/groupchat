// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import type { Accessor } from "solid-js"
import type { Message } from "../../lib/types"

export type AgentDecision = "allow" | "deny"

export type AgentPendingAction = {
  requestId: string
  title?: string
  description?: string
  input?: Record<string, unknown>
  agentId?: string
}

export type AgentEvent = {
  agentId: string
  turnId: string
  sessionId?: string
  event: "question" | "tool_call" | "text" | "result"
  content: string
  toolName?: string
  isError?: boolean
}

export type LocalAgentSession = {
  isActive: Accessor<boolean>
  isConnecting: Accessor<boolean>
  messages: Accessor<Message[]>
  start: () => Promise<void>
  stop: (reason?: string) => void
  sendMessage: (content: string, username: string) => Promise<void>
  appendError: (message: string) => void
  interrupt?: () => void
  pendingAction?: () => AgentPendingAction | null
  pendingActions?: () => AgentPendingAction[]
  respondToPendingAction?: (behavior: AgentDecision) => Promise<void>
  onEvent?: (callback: (event: AgentEvent) => void) => void
  findPendingActionMessageId?: (requestId: string) => string | null
  isThinkingMessage?: (message: Message) => boolean
}

export type LocalAgentSessionEntry = {
  id: string
  session: LocalAgentSession
  isAvailable: () => boolean
}

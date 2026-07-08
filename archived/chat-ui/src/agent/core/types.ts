// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import type { Accessor } from "solid-js"
import type { AgentEventType, Message } from "../../lib/types"

export type AgentPendingActionChoice = {
  label: string
  description?: string
}

export type AgentPendingActionTextInput = {
  placeholder?: string
  helperText?: string
}

export type AgentPendingAction = {
  requestId: string
  title?: string
  description?: string
  input?: Record<string, unknown>
  agentId?: string
  choices?: AgentPendingActionChoice[]
  helperText?: string
  textInput?: AgentPendingActionTextInput
}

export type AgentEvent = {
  agentId: string
  wireType: "cc" | "cx"
  turnId: string
  sessionId?: string
  event: AgentEventType
  content: string
  toolName?: string
  toolUseId?: string
  isError?: boolean
  outputTokens?: number
  elapsedSeconds?: number
  stopReason?: string | null
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
  respondToPendingAction?: (selectedIndex: number) => Promise<void>
  submitPendingActionInput?: (value: string) => Promise<void>
  cancelPendingActionInput?: () => void
  onEvent?: (callback: (event: AgentEvent) => void) => void
  findPendingActionMessageId?: (requestId: string) => string | null
  isThinkingMessage?: (message: Message) => boolean
}

export type LocalAgentSessionEntry = {
  id: string
  session: LocalAgentSession
  isAvailable: () => boolean
}

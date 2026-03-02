// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import type { JSX } from "solid-js"
import type { Message } from "../../lib/types"
import { buildClaudeDepthMap } from "../claude/helpers"
import { ClaudeMessageItem } from "../claude/components/ClaudeMessageItem"
import { ClaudeEventMessageItem } from "../claude/components/ClaudeEventMessageItem"

export type AgentMessageRenderContext = {
  message: Message
  messagePaneWidth?: number
  isOwnMessage?: boolean
  agentDepth?: number
  pendingActionSelectedIndex?: number
}

export type AgentMessageRenderer = (context: AgentMessageRenderContext) => JSX.Element | null

export type AgentMessageDepthResolver = (messages: Message[]) => Map<string, number>

const renderClaudeMessage: AgentMessageRenderer = (context) => {
  if (context.message.type !== "claude-response") return null
  return (
    <ClaudeMessageItem
      message={context.message}
      claudeDepth={context.agentDepth}
      permissionSelectedIndex={context.pendingActionSelectedIndex}
    />
  )
}

const renderClaudeEventMessage: AgentMessageRenderer = (context) => {
  if (context.message.type !== "cc") return null
  return <ClaudeEventMessageItem message={context.message} isOwnMessage={context.isOwnMessage} messagePaneWidth={context.messagePaneWidth} />
}

/**
 * Add renderers here as new local/remote agent message formats are introduced.
 */
const AGENT_MESSAGE_RENDERERS: AgentMessageRenderer[] = [
  renderClaudeMessage,
  renderClaudeEventMessage,
]

const AGENT_MESSAGE_DEPTH_RESOLVERS: AgentMessageDepthResolver[] = [
  buildClaudeDepthMap,
]

export function renderAgentMessage(context: AgentMessageRenderContext): JSX.Element | null {
  for (const renderer of AGENT_MESSAGE_RENDERERS) {
    const rendered = renderer(context)
    if (rendered) return rendered
  }
  return null
}

export function buildAgentDepthMap(messages: Message[]): Map<string, number> {
  const depthByMessageId = new Map<string, number>()

  for (const resolveDepth of AGENT_MESSAGE_DEPTH_RESOLVERS) {
    const resolved = resolveDepth(messages)
    for (const [messageId, depth] of resolved) {
      const existingDepth = depthByMessageId.get(messageId)
      if (existingDepth === undefined || depth > existingDepth) {
        depthByMessageId.set(messageId, depth)
      }
    }
  }

  return depthByMessageId
}


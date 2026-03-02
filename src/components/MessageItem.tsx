// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import type { Message } from "../lib/types"
import { renderAgentMessage } from "../agent/core/message-renderers"
import { sanitizePlainMessageText } from "../lib/content-sanitizer"

export type MessageItemProps = {
  message: Message
  isOwnMessage: boolean
  messagePaneWidth?: number
  showHeader?: boolean
  agentDepth?: number
  pendingActionSelectedIndex?: number
}

const COLORS = ["cyan", "magenta", "brightGreen", "brightBlue", "brightYellow", "brightMagenta"] as const

type UsernameColor = (typeof COLORS)[number]

function getUsernameColor(username: string): UsernameColor {
  let hash = 0
  for (let i = 0; i < username.length; i += 1) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash)
  }

  return COLORS[Math.abs(hash) % COLORS.length]
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
}

export function MessageItem(props: MessageItemProps) {
  const showHeader = () => props.showHeader ?? true
  const time = () => formatTime(props.message.timestamp)
  const safeUsername = () => sanitizePlainMessageText(props.message.username)
  const safeContent = () => sanitizePlainMessageText(props.message.content)

  if (props.message.type === "system") {
    return (
      <box justifyContent="center">
        <text fg="#888888">
          <em>{safeContent()}</em>
        </text>
      </box>
    )
  }

  const renderedAgentMessage = renderAgentMessage({
    message: props.message,
    messagePaneWidth: props.messagePaneWidth,
    isOwnMessage: props.isOwnMessage,
    agentDepth: props.agentDepth,
    pendingActionSelectedIndex: props.pendingActionSelectedIndex,
  })
  if (renderedAgentMessage) {
    return renderedAgentMessage
  }

  const usernameColor = () => getUsernameColor(props.message.username)

  if (props.isOwnMessage) {
    return (
      <box justifyContent="flex-start">
        <box flexDirection="column">
          {showHeader() && (
            <box flexDirection="row">
              <text fg="#888888">→ </text>
              <text fg={usernameColor()}>
                <strong>{safeUsername()}</strong>
              </text>
              <text fg="#888888"> {time()}</text>
            </box>
          )}
          <box paddingLeft={2}>
            <text>{safeContent()}</text>
          </box>
        </box>
      </box>
    )
  }

  return (
    <box justifyContent="flex-end">
      <box flexDirection="column" alignItems="flex-end">
        {showHeader() && (
          <box flexDirection="row">
            <text fg="#888888">{time()} </text>
            <text fg={usernameColor()}>
              <strong>{safeUsername()}</strong>
            </text>
            <text fg="#888888"> ←</text>
          </box>
        )}
        <box paddingLeft={2}>
          <text>{safeContent()}</text>
        </box>
      </box>
    </box>
  )
}

import type { Message } from "../lib/types"
import { ClaudeMessageItem } from "./ClaudeMessageItem"

export type MessageItemProps = {
  message: Message
  isOwnMessage: boolean
  showHeader?: boolean
  claudeDepth?: number
  /** Index of the currently highlighted permission option (0=Allow, 1=Deny) */
  permissionSelectedIndex?: number
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

  if (props.message.type === "system") {
    return (
      <box justifyContent="center">
        <text fg="#888888">
          <em>{props.message.content}</em>
        </text>
      </box>
    )
  }

  if (props.message.type === "claude-response") {
    return (
      <ClaudeMessageItem
        message={props.message}
        claudeDepth={props.claudeDepth}
        permissionSelectedIndex={props.permissionSelectedIndex}
      />
    )
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
                <strong>{props.message.username}</strong>
              </text>
              <text fg="#888888"> {time()}</text>
            </box>
          )}
          <box paddingLeft={2}>
            <text>{props.message.content}</text>
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
              <strong>{props.message.username}</strong>
            </text>
            <text fg="#888888"> ←</text>
          </box>
        )}
        <box paddingLeft={2}>
          <text>{props.message.content}</text>
        </box>
      </box>
    </box>
  )
}

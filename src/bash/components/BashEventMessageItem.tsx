// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { For, createMemo } from "solid-js"
import type { BashCommandStatus, Message } from "../../lib/types"
import { sanitizePlainMessageText } from "../../lib/content-sanitizer"
import { BASH_MODE_COLOR, BASH_RUNNING_LABEL, getBashEventTimeline } from "../shared"

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

function getStatusColor(status?: BashCommandStatus): string {
  if (status === "failed") return "#FF8A8A"
  if (status === "running") return "#888888"
  return "#BBBBBB"
}

export type BashEventMessageItemProps = {
  message: Message
  isOwnMessage?: boolean
  showHeader?: boolean
}

export function BashEventMessageItem(props: BashEventMessageItemProps) {
  const timeline = createMemo(() => getBashEventTimeline(props.message))
  const username = () => sanitizePlainMessageText(props.message.username)
  const usernameColor = () => getUsernameColor(username())
  const time = () => formatTime(props.message.timestamp)

  const promptText = createMemo(() => {
    const { events, contents } = timeline()
    const promptIndex = events.findIndex((event) => event.event === "prompt")
    const fallback = sanitizePlainMessageText(props.message.content)
    if (promptIndex < 0) return fallback
    return sanitizePlainMessageText(contents[promptIndex] || "")
  })

  const outputState = createMemo(() => {
    const { events, contents } = timeline()
    let outputIndex = -1

    for (let i = events.length - 1; i >= 0; i -= 1) {
      if (events[i].event === "output") {
        outputIndex = i
        break
      }
    }

    if (outputIndex < 0) {
      return {
        status: undefined,
        lines: [] as string[],
      }
    }

    const status = events[outputIndex].status
    const content = sanitizePlainMessageText(contents[outputIndex] || "")

    if (status === "running") {
      return {
        status,
        lines: [BASH_RUNNING_LABEL],
      }
    }

    const normalized = content.length > 0 ? content : "(no output)"

    return {
      status,
      lines: normalized.split("\n"),
    }
  })

  const header = () => {
    if (!props.showHeader) return null

    if (props.isOwnMessage) {
      return (
        <box flexDirection="row">
          <text fg="#888888">→ </text>
          <text fg={usernameColor()}>
            <strong>{username()}</strong>
          </text>
          <text fg="#888888"> {time()}</text>
        </box>
      )
    }

    return (
      <box flexDirection="row">
        <text fg="#888888">{time()} </text>
        <text fg={usernameColor()}>
          <strong>{username()}</strong>
        </text>
        <text fg="#888888"> ←</text>
      </box>
    )
  }

  const body = () => (
    <box flexDirection="column" paddingLeft={2}>
      <box flexDirection="row">
        <text fg={BASH_MODE_COLOR}>{"! "}</text>
        <text>{promptText()}</text>
      </box>
      <For each={outputState().lines}>
        {(line, index) => (
          <box flexDirection="row">
            <text fg="#888888">{index() === 0 ? "⎿ " : "  "}</text>
            <text fg={getStatusColor(outputState().status)}>{line.length > 0 ? line : " "}</text>
          </box>
        )}
      </For>
    </box>
  )

  if (props.isOwnMessage) {
    return (
      <box justifyContent="flex-start">
        <box flexDirection="column">
          {header()}
          {body()}
        </box>
      </box>
    )
  }

  return (
    <box justifyContent="flex-end">
      <box flexDirection="column" alignItems="flex-end">
        {header()}
        {body()}
      </box>
    </box>
  )
}

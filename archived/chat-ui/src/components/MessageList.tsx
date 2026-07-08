// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { For, Show, createMemo, type Ref } from "solid-js"
import type { ScrollBoxRenderable } from "@opentui/core"
import { MessageItem } from "./MessageItem"
import type { Message } from "../lib/types"
import { buildAgentDepthMap } from "../agent/core/message-renderers"
import { sanitizePlainMessageText } from "../lib/content-sanitizer"
import { formatFullDate, localDayKey } from "../lib/utils"

export type MessageListProps = {
  messages: Message[]
  currentUsername: string | null
  typingUsers: string[]
  messagePaneWidth: number
  height: number
  isDetached: boolean
  detachedLines?: number
  scrollRef?: Ref<ScrollBoxRenderable>
  /** ID of the message that has an active (unresolved) pending action request. */
  pendingActionMessageId?: string | null
  /** Currently highlighted option index for the pending action selector. */
  pendingActionSelectedIndex?: number
}

export function MessageList(props: MessageListProps) {
  // Thread replies never show in the top-level list (the TUI has no thread
  // view); the parent message carries a "{N} replies" indicator instead.
  const messages = createMemo(() => props.messages.filter((m) => !m.parent_thread_id))
  const othersTyping = createMemo(() =>
    props.typingUsers.filter((user) => user !== props.currentUsername)
  )
  const safeTypingUsers = createMemo(() => othersTyping().map((user) => sanitizePlainMessageText(user)))
  const agentDepthByMessageId = createMemo(() => buildAgentDepthMap(messages()))
  const hiddenClaudeToolUseIds = createMemo(() => {
    const ids = new Set<string>()
    for (const message of messages()) {
      const toolUseId = message.attributes?.claude?.permissionRequest?.toolUseId
      if (toolUseId) ids.add(toolUseId)
    }
    return ids
  })

  // Precompute which messages need headers in a single pass to avoid
  // repeated Date parsing inside each <For> iteration's reactive callback.
  const showHeaderSet = createMemo(() => buildShowHeaderSet(messages()))
  // Indices that begin a new local calendar day (and the first message), which
  // get a date divider rendered above them.
  const dayDividerSet = createMemo(() => buildDayDividerSet(messages()))

  const footerLines = createMemo(() => {
    if (props.isDetached) return 1
    if (safeTypingUsers().length > 0) return 1
    return 0
  })

  const scrollHeight = createMemo(() => Math.max(1, props.height - footerLines()))

  return (
    <box flexDirection="column" height={props.height} paddingLeft={1} paddingRight={1}>
      <scrollbox
        height={scrollHeight()}
        stickyScroll
        stickyStart="bottom"
        contentOptions={{ flexDirection: "column", justifyContent: "flex-end" }}
        scrollbarOptions={{ visible: false }}
        ref={props.scrollRef}
      >
        <Show
          when={messages().length > 0}
          fallback={
            <box justifyContent="center" alignItems="center" height={scrollHeight()}>
              <text fg="#888888">No messages yet. Say hello!</text>
            </box>
          }
        >
          <For each={messages()}>
            {(message, index) => {
              return (
                <>
                  <Show when={dayDividerSet().has(index())}>
                    <DateDivider timestamp={message.timestamp} />
                  </Show>
                  <MessageItem
                    message={message}
                    isOwnMessage={message.username === props.currentUsername}
                    messagePaneWidth={props.messagePaneWidth}
                    showHeader={showHeaderSet().has(index())}
                    agentDepth={agentDepthByMessageId().get(message.id) ?? 0}
                    hiddenClaudeToolUseIds={hiddenClaudeToolUseIds()}
                    pendingActionSelectedIndex={
                      props.pendingActionMessageId === message.id ? props.pendingActionSelectedIndex : undefined
                    }
                  />
                </>
              )
            }}
          </For>
        </Show>
      </scrollbox>

      <Show when={props.isDetached}>
        <box justifyContent="center">
          <text fg="yellow">
            <strong>-- {props.detachedLines ?? 0} lines below (Down to scroll) --</strong>
          </text>
        </box>
      </Show>

      <Show when={safeTypingUsers().length > 0 && !props.isDetached}>
        <box>
          <text fg="#888888">
            <em>
              {safeTypingUsers().length === 1
                ? `${safeTypingUsers()[0]} is typing...`
                : `${safeTypingUsers().join(", ")} are typing...`}
            </em>
          </text>
        </box>
      </Show>
    </box>
  )
}

// A centered full date shown above the first message of each local calendar
// day, e.g. "June 8th, 2026".
function DateDivider(props: { timestamp: string }) {
  return (
    <box width="100%" alignItems="center" height={1}>
      <text fg="#888888" height={1}>{formatFullDate(props.timestamp)}</text>
    </box>
  )
}

const TWO_HOURS_MS = 2 * 60 * 60 * 1000

export function buildShowHeaderSet(messages: Pick<Message, "username" | "timestamp">[]): Set<number> {
  const set = new Set<number>()
  for (let i = 0; i < messages.length; i++) {
    if (i === 0 || messages[i].username !== messages[i - 1].username) {
      set.add(i)
    } else if (localDayKey(messages[i].timestamp) !== localDayKey(messages[i - 1].timestamp)) {
      // A date break always starts a fresh header so the first message of a day
      // never visually merges with the previous day's author.
      set.add(i)
    } else if (
      new Date(messages[i].timestamp).getTime() - new Date(messages[i - 1].timestamp).getTime() > TWO_HOURS_MS
    ) {
      set.add(i)
    }
  }
  return set
}

export function buildDayDividerSet(messages: Pick<Message, "timestamp">[]): Set<number> {
  const set = new Set<number>()
  for (let i = 0; i < messages.length; i++) {
    if (i === 0 || localDayKey(messages[i].timestamp) !== localDayKey(messages[i - 1].timestamp)) {
      set.add(i)
    }
  }
  return set
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { For, Show, createMemo, type Ref } from "solid-js"
import type { ScrollBoxRenderable } from "@opentui/core"
import { MessageItem } from "./MessageItem"
import type { Message } from "../lib/types"
import { buildAgentDepthMap } from "../agent/core/message-renderers"
import { sanitizePlainMessageText } from "../lib/content-sanitizer"

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
  const othersTyping = createMemo(() =>
    props.typingUsers.filter((user) => user !== props.currentUsername)
  )
  const safeTypingUsers = createMemo(() => othersTyping().map((user) => sanitizePlainMessageText(user)))
  const agentDepthByMessageId = createMemo(() => buildAgentDepthMap(props.messages))

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
          when={props.messages.length > 0}
          fallback={
            <box justifyContent="center" alignItems="center" height={scrollHeight()}>
              <text fg="#888888">No messages yet. Say hello!</text>
            </box>
          }
        >
          <For each={props.messages}>
            {(message, index) => {
              const prev = () => (index() === 0 ? null : props.messages[index() - 1])
              const showHeader = () => !prev() || prev()!.username !== message.username

              return (
                <MessageItem
                  message={message}
                  isOwnMessage={message.username === props.currentUsername}
                  messagePaneWidth={props.messagePaneWidth}
                  showHeader={showHeader()}
                  agentDepth={agentDepthByMessageId().get(message.id) ?? 0}
                  pendingActionSelectedIndex={
                    props.pendingActionMessageId === message.id ? props.pendingActionSelectedIndex : undefined
                  }
                />
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

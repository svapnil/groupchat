import { For, Show, createMemo, type Ref } from "solid-js"
import type { ScrollBoxRenderable } from "@opentui/core"
import { MessageItem } from "./MessageItem"
import type { Message } from "../lib/types"
import { buildClaudeDepthMap } from "../lib/claude-helpers"

export type MessageListProps = {
  messages: Message[]
  currentUsername: string | null
  typingUsers: string[]
  messagePaneWidth: number
  height: number
  isDetached: boolean
  detachedLines?: number
  scrollRef?: Ref<ScrollBoxRenderable>
  /** ID of the message that has an active (unresolved) permission request */
  permissionMessageId?: string | null
  /** Currently highlighted option index for the permission selector (0=Allow, 1=Deny) */
  permissionSelectedIndex?: number
}

export function MessageList(props: MessageListProps) {
  const othersTyping = createMemo(() =>
    props.typingUsers.filter((user) => user !== props.currentUsername)
  )
  const claudeDepthByMessageId = createMemo(() => buildClaudeDepthMap(props.messages))

  const footerLines = createMemo(() => {
    if (props.isDetached) return 1
    if (othersTyping().length > 0) return 1
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
                  claudeDepth={claudeDepthByMessageId().get(message.id) ?? 0}
                  permissionSelectedIndex={
                    props.permissionMessageId === message.id ? props.permissionSelectedIndex : undefined
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

      <Show when={othersTyping().length > 0 && !props.isDetached}>
        <box>
          <text fg="#888888">
            <em>
              {othersTyping().length === 1
                ? `${othersTyping()[0]} is typing...`
                : `${othersTyping().join(", ")} are typing...`}
            </em>
          </text>
        </box>
      </Show>
    </box>
  )
}

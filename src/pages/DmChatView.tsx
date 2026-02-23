// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { useKeyboard, useRenderer } from "@opentui/solid"
import { Layout } from "../components/Layout"
import { StatusBar } from "../components/StatusBar"
import { CommandInputPanel } from "../components/CommandInputPanel"
import { MessageList } from "../components/MessageList"
import { useDmStore } from "../stores/dm-store"
import { useChatStore } from "../stores/chat-store"
import { useAuth } from "../stores/auth-store"
import { PRESENCE } from "../lib/colors"
import { useChannelsStore } from "../stores/channel-store"
import { isClaudeCommand } from "../lib/commands"
import { useNavigation } from "../components/Router"
import { fetchDmMessages } from "../lib/chat-client"
import { condenseCcMessages, upsertCcMessage } from "../lib/cc-message-utils"
import { getConfig } from "../lib/config"
import { calculateMiddleSectionHeight } from "../lib/layout"
import { getRuntimeCapabilities } from "../lib/runtime-capabilities"
import type { DmMessage, Message } from "../lib/types"
import { createChatViewBase } from "../primitives/create-chat-view-base"

export type DmChatViewProps = {
  width: number
  height: number
  topPadding?: number
}

const runtimeCapabilities = getRuntimeCapabilities()
const MESSAGE_LIST_HORIZONTAL_PADDING = 2

function extractTimestampFromUUIDv7(uuid: string): string {
  const hex = uuid.replace(/-/g, "").slice(0, 12)
  const ms = parseInt(hex, 16)
  return new Date(ms).toISOString()
}

export function DmChatView(props: DmChatViewProps) {
  const navigation = useNavigation()
  const dms = useDmStore()
  const chat = useChatStore()
  const auth = useAuth()
  const channels = useChannelsStore()
  const renderer = useRenderer()

  const [messages, setMessages] = createSignal<Message[]>([])
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string | null>(null)
  const [typingUsers, setTypingUsers] = createSignal<string[]>([])

  const conversation = () => dms.currentDm()
  const title = () => conversation()?.other_username || "DM"
  const topPadding = () => props.topPadding ?? 0
  const rawListHeight = createMemo(() => calculateMiddleSectionHeight(props.height, topPadding()))
  const messagePaneWidth = createMemo(() => Math.max(20, props.width - MESSAGE_LIST_HORIZONTAL_PADDING))

  const base = createChatViewBase({
    baseMessages: messages,
    listHeight: rawListHeight,
    connectionStatus: chat.connectionStatus,
    username: chat.username,
    channelManager: chat.channelManager,
    currentChannel: () => conversation()?.slug || null,
  })

  const isOtherUserOnline = createMemo(() => {
    const convo = conversation()
    if (!convo) return false
    return Boolean(chat.globalPresence()[convo.other_username])
  })

  createEffect(() => {
    if (!conversation()) {
      navigation.navigate("dm-inbox")
    }
  })

  createEffect(() => {
    const prefix = chat.connectionStatus() === "connected" ? "• " : ""
    const unreadSuffix = channels.totalUnreadCount() + dms.totalUnreadCount()
    const suffix = unreadSuffix > 0 ? ` (${unreadSuffix})` : ""
    renderer.setTerminalTitle(`${prefix}@${title()}${suffix}`)
  })

  createEffect(() => {
    const dm = conversation()
    const token = auth.token()

    if (!dm || !token) {
      setMessages([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const fetchHistory = async () => {
      try {
        const config = getConfig()
        const data = await fetchDmMessages(config.wsUrl, token, dm.slug)
        setMessages(condenseCcMessages(data.messages || [], chat.username()))
      } catch (err) {
        setError("Failed to load messages")
      } finally {
        setLoading(false)
      }
    }

    void fetchHistory()
  })

  createEffect(() => {
    conversation()
    setTypingUsers([])
    base.resetScroll()
  })

  createEffect(() => {
    const manager = chat.channelManager()
    const dm = conversation()

    if (!manager || !dm) return

    manager.markDmAsRead(dm.slug).catch(() => {})
    dms.clearUnreadCount(dm.slug)
  })

  createEffect(() => {
    const manager = chat.channelManager()
    const dm = conversation()
    const currentUsername = chat.username()

    if (!manager || !dm) return

    const managerWithCallbacks = manager as unknown as {
      callbacks: {
        onDmMessage?: (msg: DmMessage) => void
        onDmTypingStart?: (dmSlug: string, username: string) => void
        onDmTypingStop?: (dmSlug: string, username: string) => void
      }
    }

    const originalOnDmMessage = managerWithCallbacks.callbacks.onDmMessage
    const originalOnDmTypingStart = managerWithCallbacks.callbacks.onDmTypingStart
    const originalOnDmTypingStop = managerWithCallbacks.callbacks.onDmTypingStop

    managerWithCallbacks.callbacks.onDmMessage = (msg: DmMessage) => {
      if (msg.dm_slug === dm.slug) {
        const message: Message = {
          id: msg.id,
          username: msg.username,
          content: msg.content,
          timestamp: extractTimestampFromUUIDv7(msg.id),
          attributes: msg.attributes,
        }

        let changed = false
        setMessages((prev) => {
          const next = upsertCcMessage(prev, message, currentUsername)
          changed = next !== prev
          return next
        })

        if (changed && !base.isDetached()) {
          queueMicrotask(() => {
            base.scrollToBottom()
            base.updateScrollMetrics()
          })
        }
      }
      originalOnDmMessage?.(msg)
    }

    managerWithCallbacks.callbacks.onDmTypingStart = (dmSlug: string, username: string) => {
      if (dmSlug === dm.slug && username !== currentUsername) {
        setTypingUsers((prev) => (prev.includes(username) ? prev : [...prev, username]))
      }
      originalOnDmTypingStart?.(dmSlug, username)
    }

    managerWithCallbacks.callbacks.onDmTypingStop = (dmSlug: string, username: string) => {
      if (dmSlug === dm.slug) {
        setTypingUsers((prev) => prev.filter((existingUser) => existingUser !== username))
      }
      originalOnDmTypingStop?.(dmSlug, username)
    }

    return () => {
      managerWithCallbacks.callbacks.onDmMessage = originalOnDmMessage
      managerWithCallbacks.callbacks.onDmTypingStart = originalOnDmTypingStart
      managerWithCallbacks.callbacks.onDmTypingStop = originalOnDmTypingStop
    }
  })

  useKeyboard((key) => {
    if (base.handleClaudeKeys(key)) return
  })

  const handleCommand = async (eventType: string, data: any) => {
    try {
      await base.handleClaudeCommand(eventType, data)
    } catch (error) {
      base.claude.appendError(`Command failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const handleSendMessage = base.wrapSendMessage(async (content: string) => {
    const manager = chat.channelManager()
    const dm = conversation()
    if (!manager || !dm) return

    manager.sendDmMessage(dm.slug, content).catch(() => {
      setError("Failed to send message")
    })
  })

  const handleTypingStart = base.wrapTypingStart(() => {
    const manager = chat.channelManager()
    const dm = conversation()
    if (!manager || !dm) return
    manager.startDmTyping(dm.slug)
  })

  const handleTypingStop = base.wrapTypingStop(() => {
    const manager = chat.channelManager()
    const dm = conversation()
    if (!manager || !dm) return
    manager.stopDmTyping(dm.slug)
  })

  onCleanup(() => {
    const manager = chat.channelManager()
    const dm = conversation()
    if (manager && dm) {
      manager.markDmAsRead(dm.slug).catch(() => {})
    }
  })

  return (
    <Layout width={props.width} height={props.height} topPadding={topPadding()}>
      <Layout.Content>
        <box flexDirection="column" height={base.listHeight()}>
          <Show
            when={!loading() && !error()}
            fallback={
              <box paddingLeft={1}>
                <text fg={error() ? "red" : "#888888"}>
                  {error() ? error() : "Loading messages..."}
                </text>
              </box>
            }
          >
            <MessageList
              messages={base.combinedMessages()}
              currentUsername={chat.username()}
              typingUsers={typingUsers()}
              messagePaneWidth={messagePaneWidth()}
              height={base.listHeight()}
              isDetached={base.isDetached()}
              detachedLines={base.detachedLines()}
              scrollRef={(ref) => {
                base.setScrollRef(ref)
              }}
              permissionMessageId={base.permissionMessageId()}
              permissionSelectedIndex={base.permissionSelectedIndex()}
            />
          </Show>
        </box>
      </Layout.Content>
      <Layout.Footer>
        <CommandInputPanel
          token={auth.token()}
          currentChannel={conversation()?.slug || "dm"}
          isPrivateChannel
          connectionStatus={chat.connectionStatus()}
          username={chat.username()}
          users={[]}
          subscribers={[]}
          onSend={handleSendMessage}
          onTypingStart={handleTypingStart}
          onTypingStop={handleTypingStop}
          onCommandSend={handleCommand}
          placeholder={conversation() ? `Message @${conversation()!.other_username}...` : "Type a message..."}
          commandFilter={(command) => runtimeCapabilities.hasClaude && isClaudeCommand(command)}
          onTooltipHeightChange={base.handleTooltipHeightChange}
          claudeMode={base.isClaudeMode()}
          claudePendingPermission={base.claude.pendingPermission()}
        />
        <StatusBar
          connectionStatus={chat.connectionStatus()}
          error={error()}
          backLabel="Menu"
          backShortcut="ESC"
          title={
            <box flexDirection="row" flexShrink={1} minWidth={0} alignItems="center">
              <text fg={isOtherUserOnline() ? PRESENCE.online : PRESENCE.offline} flexShrink={0}>● </text>
              <text fg="cyan" truncate flexShrink={1} minWidth={0}>
                <strong>{title()}</strong>
              </text>
            </box>
          }
          showUserToggle={false}
        />
      </Layout.Footer>
    </Layout>
  )
}

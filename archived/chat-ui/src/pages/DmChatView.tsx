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
import { getCommandAgentId, isAgentCommand } from "../lib/commands"
import { useNavigation } from "../components/Router"
import { createOrGetDm, fetchDmMessages } from "../lib/chat-client"
import { truncatePreview } from "../lib/dm-utils"
import { condenseAgentMessages, upsertAgentMessage } from "../agent/core/message-mutations"
import { getConfig } from "../lib/config"
import { calculateMiddleSectionHeight, LAYOUT_HEIGHTS } from "../lib/layout"
import type { DmConversation, DmMessage, Message } from "../lib/types"
import { createChatViewBase } from "../primitives/create-chat-view-base"

export type DmChatViewProps = {
  width: number
  height: number
  topPadding?: number
}

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
  const [isBashMode, setIsBashMode] = createSignal(false)
  const [materializing, setMaterializing] = createSignal(false)
  // Slug of a DM that was just materialized from a draft. Its history GET would
  // race the first message's realtime echo and could clobber it, so we skip the
  // fetch once and let the echo populate the (otherwise empty) conversation.
  let pendingMaterializedSlug: string | null = null

  const conversation = () => dms.currentDm()
  const isDraft = () => Boolean(conversation()?.isDraft)
  const title = () => conversation()?.other_username || "DM"
  const topPadding = () => props.topPadding ?? 0
  const [listHeight, setListHeight] = createSignal(
    calculateMiddleSectionHeight(props.height, topPadding(), LAYOUT_HEIGHTS.inputBox)
  )
  const messagePaneWidth = createMemo(() => Math.max(20, props.width - MESSAGE_LIST_HORIZONTAL_PADDING))

  const base = createChatViewBase({
    baseMessages: messages,
    listHeight,
    connectionStatus: chat.connectionStatus,
    username: chat.username,
    channelManager: chat.channelManager,
    currentChannel: () => conversation()?.slug || null,
  })

  createEffect(() => {
    const mode = base.activeInputMode()
    const bgMode = base.backgroundAgentMode()
    const inputBoxHeight = isBashMode()
      ? LAYOUT_HEIGHTS.inputBoxWithMode
      : (mode || bgMode)
      ? (mode?.pendingAction ? LAYOUT_HEIGHTS.inputBoxWithModeAndHelper : LAYOUT_HEIGHTS.inputBoxWithMode)
      : LAYOUT_HEIGHTS.inputBox
    setListHeight(calculateMiddleSectionHeight(props.height, topPadding(), inputBoxHeight))
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

    // A draft has no backend channel yet — nothing to fetch.
    if (dm.isDraft) {
      setMessages([])
      setLoading(false)
      setError(null)
      return
    }

    // Just materialized from a draft: skip the history GET (which would race the
    // first message's echo) and let the realtime callback populate it instead.
    if (pendingMaterializedSlug === dm.slug) {
      pendingMaterializedSlug = null
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    const fetchHistory = async () => {
      try {
        const config = getConfig()
        const data = await fetchDmMessages(config.wsUrl, token, dm.slug)
        setMessages(condenseAgentMessages(data.messages || [], chat.username()))
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

    if (!manager || !dm || dm.isDraft) return

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
          type: msg.type,
          parent_thread_id: msg.parent_thread_id,
          attributes: msg.attributes,
        }

        let changed = false
        setMessages((prev) => {
          const next = upsertAgentMessage(prev, message, currentUsername)
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
    // Agents/bash need a real DM channel; a draft must be materialized by sending
    // a plain first message before any agent session can start.
    if (isDraft()) return
    if (base.handleAgentKeys(key)) return
  })

  const handleCommand = async (eventType: string, data: any) => {
    if (isDraft()) {
      base.appendAgentError("Send a message first to start this conversation.")
      return
    }
    try {
      await base.handleAgentCommand(eventType, data)
    } catch (error) {
      base.appendAgentError(`Command failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // Turn a draft conversation into a real backend DM. Idempotent on the server
  // (create_or_get_dm), but guarded here so a rapid second send awaits the first
  // creation instead of racing a duplicate. Returns the materialized DM, or null
  // on failure (leaving the draft open so the typed content isn't lost).
  const ensureRealConversation = async (
    dm: DmConversation,
    preview: string,
  ): Promise<DmConversation | null> => {
    if (!dm.isDraft) return dm
    if (materializing()) return null

    const token = auth.token()
    if (!token) return null

    setMaterializing(true)
    try {
      const config = getConfig()
      const created = await createOrGetDm(config.wsUrl, token, { user_id: dm.other_user_id })
      const real: DmConversation = {
        channel_id: created.channel_id,
        slug: created.slug,
        other_user_id: created.other_user_id,
        other_username: created.other_username,
        last_activity_at: new Date().toISOString(),
        last_message_preview: truncatePreview(preview),
        unread_count: 0,
      }
      // Mark before setCurrentDm so the history-fetch effect (which fires on the
      // conversation change) skips the GET for this freshly created DM.
      pendingMaterializedSlug = created.slug
      dms.upsertConversation(real)
      dms.setCurrentDm(real)
      return real
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create DM")
      return null
    } finally {
      setMaterializing(false)
    }
  }

  const handleSendMessage = base.wrapSendMessage(async (content: string) => {
    const manager = chat.channelManager()
    const dm = conversation()
    if (!manager || !dm) return

    const target = await ensureRealConversation(dm, content)
    if (!target) return

    manager.sendDmMessage(target.slug, content).catch(() => {
      setError("Failed to send message")
    })
    void dms.refetch()
  })

  const handleTypingStart = base.wrapTypingStart(() => {
    const manager = chat.channelManager()
    const dm = conversation()
    if (!manager || !dm || dm.isDraft) return
    manager.startDmTyping(dm.slug)
  })

  const handleTypingStop = base.wrapTypingStop(() => {
    const manager = chat.channelManager()
    const dm = conversation()
    if (!manager || !dm || dm.isDraft) return
    manager.stopDmTyping(dm.slug)
  })

  onCleanup(() => {
    const manager = chat.channelManager()
    const dm = conversation()
    if (manager && dm && !dm.isDraft) {
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
              pendingActionMessageId={base.pendingActionMessageId()}
              pendingActionSelectedIndex={base.pendingActionSelectedIndex()}
            />
          </Show>
        </box>
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
          commandFilter={(command) => {
            if (command.channelOnly) return false
            if (!isAgentCommand(command)) return true
            const agentId = getCommandAgentId(command)
            if (!agentId) return true
            return base.isAgentAvailable(agentId)
          }}
          onTooltipHeightChange={base.handleTooltipHeightChange}
          agentMode={base.activeInputMode()}
          backgroundAgentMode={base.backgroundAgentMode()}
          onBashModeChange={setIsBashMode}
        />
      </Layout.Content>
      <Layout.Footer>
        <StatusBar
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

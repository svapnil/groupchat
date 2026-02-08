import { createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import type { ScrollBoxRenderable } from "@opentui/core"
import { Layout } from "../components/Layout"
import { MessageList } from "../components/MessageList"
import { StatusBar } from "../components/StatusBar"
import { CommandInputPanel } from "../components/CommandInputPanel"
import { UserList } from "../components/UserList"
import { useChatStore } from "../stores/chat-store"
import { useChannelsStore } from "../stores/channel-store"
import { useDmStore } from "../stores/dm-store"
import { useAuth } from "../stores/auth-store"
import { calculateMiddleSectionHeight } from "../lib/layout"
import { createPresenceUsers } from "../primitives/presence"

export type ChatViewProps = {
  width: number
  height: number
  topPadding?: number
}

export function ChatView(props: ChatViewProps) {
  const chat = useChatStore()
  const channels = useChannelsStore()
  const dms = useDmStore()
  const auth = useAuth()

  const [isDetached, setIsDetached] = createSignal(false)
  const [detachedLines, setDetachedLines] = createSignal(0)
  const [showUserList, setShowUserList] = createSignal(true)
  const [tooltipHeight, setTooltipHeight] = createSignal(0)

  const topPadding = () => props.topPadding ?? 0
  const middleHeight = createMemo(() => calculateMiddleSectionHeight(props.height, topPadding()))
  const listHeight = createMemo(() => Math.max(1, middleHeight() - tooltipHeight()))

  const channelDetails = createMemo(() => {
    const slug = channels.currentChannel()
    const allChannels = [...channels.publicChannels(), ...channels.privateChannels()]
    return allChannels.find((channel) => channel.slug === slug) || null
  })

  const displayName = createMemo(() => channelDetails()?.name || channels.currentChannel())
  const isPrivateChannel = createMemo(() => channels.currentChannel().startsWith("private_room:"))

  const users = createPresenceUsers({
    presenceState: chat.presenceState,
    subscribers: chat.subscribers,
    currentChannel: channels.currentChannel,
    globalPresence: chat.globalPresence,
  })

  let messageScrollRef: ScrollBoxRenderable | undefined

  const updateScrollMetrics = () => {
    if (!messageScrollRef) return
    const maxScroll = Math.max(0, messageScrollRef.scrollHeight - messageScrollRef.viewport.height)
    const remaining = Math.max(0, Math.round(maxScroll - messageScrollRef.scrollTop))
    setDetachedLines(remaining)
    setIsDetached(remaining > 0)
  }

  const scrollToBottom = () => {
    if (!messageScrollRef) return
    const maxScroll = Math.max(0, messageScrollRef.scrollHeight - messageScrollRef.viewport.height)
    messageScrollRef.scrollTo({ y: maxScroll, x: 0 })
  }

  const sendCommand = async (eventType: string, data: any) => {
    const manager = chat.channelManager()
    if (!manager) {
      throw new Error("Not connected")
    }
    await manager.sendCommand(channels.currentChannel(), eventType, data)
  }

  const handleTooltipHeightChange = (height: number) => {
    setTooltipHeight((prev) => (prev === height ? prev : height))
  }

  createEffect(() => {
    if (!process.stdout) return
    const prefix = chat.connectionStatus() === "connected" ? "* " : ""
    const unreadSuffix = channels.totalUnreadCount() + dms.totalUnreadCount()
    const suffix = unreadSuffix > 0 ? ` (${unreadSuffix})` : ""
    process.stdout.write(`\x1b]0;${prefix}#${displayName()}${suffix}\x07`)
  })

  createEffect(() => {
    channels.currentChannel()
    setIsDetached(false)
    setDetachedLines(0)
    queueMicrotask(() => {
      scrollToBottom()
      updateScrollMetrics()
    })
  })

  createEffect(() => {
    chat.messages().length
    queueMicrotask(() => {
      if (!isDetached()) {
        scrollToBottom()
      }
      updateScrollMetrics()
    })
  })

  useKeyboard((key) => {
    if (key.ctrl && key.name === "e") {
      setShowUserList((prev) => !prev)
      return
    }

    if (chat.connectionStatus() !== "connected") return

    if (!messageScrollRef) return

    if (["up", "down", "pageup", "pagedown", "home", "end"].includes(key.name)) {
      if (messageScrollRef.handleKeyPress(key)) {
        updateScrollMetrics()
      }
    }
  })

  let prevChannel: string | null = null
  const markedAsReadOnEntry = new Set<string>()

  createEffect(() => {
    const manager = chat.channelManager()
    const currentChannel = channels.currentChannel()

    if (!manager) return

    const markChannelAsRead = async (channelSlug: string, isEntry: boolean) => {
      try {
        if (isEntry) {
          if (!markedAsReadOnEntry.has(channelSlug)) {
            await manager.markAllMessagesAsRead(channelSlug)
            markedAsReadOnEntry.add(channelSlug)
          } else {
            await manager.markChannelAsRead(channelSlug)
          }
        } else {
          await manager.markChannelAsRead(channelSlug)
        }

        await channels.refetchUnreadCounts()
      } catch (err) {
        console.error(`Failed to mark ${channelSlug} as read:`, err)
      }
    }

    if (currentChannel !== prevChannel) {
      if (prevChannel) {
        void markChannelAsRead(prevChannel, false)
      }

      if (currentChannel) {
        void markChannelAsRead(currentChannel, true)
        channels.clearUnreadCount(currentChannel)
      }

      prevChannel = currentChannel
    }
  })

  onCleanup(() => {
    const manager = chat.channelManager()
    const currentChannel = channels.currentChannel()
    if (manager && currentChannel) {
      manager.markChannelAsReadBestEffort(currentChannel)
    }
  })

  return (
    <Layout width={props.width} height={props.height} topPadding={topPadding()}>
      <Layout.Content>
        <box flexDirection="row" height={listHeight()} overflow="hidden">
          <box flexGrow={1} flexDirection="column" overflow="hidden">
            <MessageList
              messages={chat.messages()}
              currentUsername={chat.username()}
              typingUsers={chat.typingUsers()}
              height={listHeight()}
              isDetached={isDetached()}
              detachedLines={detachedLines()}
              scrollRef={(ref) => {
                messageScrollRef = ref
              }}
            />
          </box>
          {showUserList() ? (
            <UserList
              users={users()}
              currentUsername={chat.username()}
              height={Math.max(1, listHeight() - 1)}
              isPrivateChannel={isPrivateChannel()}
            />
          ) : null}
        </box>

        <CommandInputPanel
          token={auth.token()}
          currentChannel={channels.currentChannel()}
          isPrivateChannel={isPrivateChannel()}
          connectionStatus={chat.connectionStatus()}
          username={chat.username()}
          users={users()}
          subscribers={chat.subscribers()}
          onSend={chat.sendMessage}
          onTypingStart={chat.startTyping}
          onTypingStop={chat.stopTyping}
          onCommandSend={sendCommand}
          onTooltipHeightChange={handleTooltipHeightChange}
        />
      </Layout.Content>

      <Layout.Footer>
        <StatusBar
          connectionStatus={chat.connectionStatus()}
          error={chat.error()}
          backLabel="Menu"
          backShortcut="ESC"
          title={
            <text fg={isPrivateChannel() ? "cyan" : "#00FF00"} truncate flexShrink={1} minWidth={0}>
              <strong>#{displayName()}</strong>
            </text>
          }
        />
      </Layout.Footer>
    </Layout>
  )
}

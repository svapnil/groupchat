import { createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { useKeyboard, useRenderer } from "@opentui/solid"
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
import { isClaudeCommand } from "../lib/commands"
import { getRuntimeCapabilities } from "../lib/runtime-capabilities"
import { createPresenceUsers } from "../primitives/presence"
import { createChatViewBase } from "../primitives/create-chat-view-base"

export type ChatViewProps = {
  width: number
  height: number
  topPadding?: number
}

const runtimeCapabilities = getRuntimeCapabilities()

export function ChatView(props: ChatViewProps) {
  const chat = useChatStore()
  const channels = useChannelsStore()
  const dms = useDmStore()
  const auth = useAuth()
  const renderer = useRenderer()

  const [showUserList, setShowUserList] = createSignal(true)

  const topPadding = () => props.topPadding ?? 0
  const middleHeight = createMemo(() => calculateMiddleSectionHeight(props.height, topPadding()))

  const base = createChatViewBase({
    baseMessages: chat.messages,
    listHeight: middleHeight,
    connectionStatus: chat.connectionStatus,
    username: chat.username,
  })

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

  const sendCommand = async (eventType: string, data: any) => {
    if (await base.handleClaudeCommand(eventType, data)) return
    if (base.isClaudeMode()) return
    const manager = chat.channelManager()
    if (!manager) {
      throw new Error("Not connected")
    }
    await manager.sendCommand(channels.currentChannel(), eventType, data)
  }

  const handleSendMessage = base.wrapSendMessage(async (message: string) => {
    await chat.sendMessage(message)
  })

  const handleSendCommand = async (eventType: string, data: any) => {
    try {
      await sendCommand(eventType, data)
    } catch (error) {
      base.claude.appendError(`Command failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const handleTypingStart = base.wrapTypingStart(() => chat.startTyping())
  const handleTypingStop = base.wrapTypingStop(() => chat.stopTyping())

  createEffect(() => {
    const prefix = chat.connectionStatus() === "connected" ? "• " : ""
    const unreadSuffix = channels.totalUnreadCount() + dms.totalUnreadCount()
    const suffix = unreadSuffix > 0 ? ` (${unreadSuffix})` : ""
    renderer.setTerminalTitle(`${prefix}#${displayName()}${suffix}`)
  })

  createEffect(() => {
    channels.currentChannel()
    base.resetScroll()
  })

  useKeyboard((key) => {
    if (key.ctrl && key.name === "e") {
      setShowUserList((prev) => !prev)
      return
    }
    if (base.handleClaudeKeys(key)) return
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
        <box flexDirection="row" height={base.listHeight()} overflow="hidden">
          <box flexGrow={1} flexDirection="column" overflow="hidden">
            <MessageList
              messages={base.combinedMessages()}
              currentUsername={chat.username()}
              typingUsers={chat.typingUsers()}
              height={base.listHeight()}
              isDetached={base.isDetached()}
              detachedLines={base.detachedLines()}
              scrollRef={(ref) => {
                base.setScrollRef(ref)
              }}
              permissionMessageId={base.permissionMessageId()}
              permissionSelectedIndex={base.permissionSelectedIndex()}
            />
          </box>
          {showUserList() ? (
            <UserList
              users={users()}
              currentUsername={chat.username()}
              height={Math.max(1, base.listHeight() - 1)}
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
          onSend={handleSendMessage}
          onTypingStart={handleTypingStart}
          onTypingStop={handleTypingStop}
          onCommandSend={handleSendCommand}
          commandFilter={(command) => runtimeCapabilities.hasClaude || !isClaudeCommand(command)}
          onTooltipHeightChange={base.handleTooltipHeightChange}
          claudeMode={base.isClaudeMode()}
          claudePendingPermission={base.claude.pendingPermission()}
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

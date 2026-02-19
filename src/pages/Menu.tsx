import { For, Show, createEffect, createMemo, createSignal } from "solid-js"
import { useKeyboard, useRenderer } from "@opentui/solid"
import { Layout } from "../components/Layout"
import { StatusBar } from "../components/StatusBar"
import { AtAGlance } from "../components/AtAGlance"
import { useNavigation } from "../components/Router"
import { useChannelsStore } from "../stores/channel-store"
import { useChatStore } from "../stores/chat-store"
import { useDmStore } from "../stores/dm-store"
import type { Channel, DmConversation } from "../lib/types"
import { PRESENCE } from "../lib/colors"
import { LAYOUT_HEIGHTS } from "../lib/layout"

export type MenuProps = {
  width: number
  height: number
  topPadding?: number
}

type MenuItem =
  | { type: "channel"; channel: Channel }
  | { type: "dm"; conversation: DmConversation }
  | { type: "action"; action: "create-channel" | "new-dm" | "dm-see-more"; label: string }

export function Menu(props: MenuProps) {
  const navigation = useNavigation()
  const channels = useChannelsStore()
  const chat = useChatStore()
  const dms = useDmStore()
  const renderer = useRenderer()

  const sortedPublicChannels = createMemo(() => {
    return [...channels.publicChannels()].sort((a, b) => a.id.localeCompare(b.id))
  })

  const allChannels = createMemo(() => [
    ...sortedPublicChannels(),
    ...channels.privateChannels(),
  ])

  const menuItems = createMemo<MenuItem[]>(() => {
    const items: MenuItem[] = []

    sortedPublicChannels().forEach((channel) => {
      items.push({ type: "channel", channel })
    })

    channels.privateChannels().forEach((channel) => {
      items.push({ type: "channel", channel })
    })

    items.push({
      type: "action",
      action: "create-channel",
      label: "+ Create a new private channel",
    })

    items.push({
      type: "action",
      action: "new-dm",
      label: "+ Start a new conversation",
    })

    const recentDms = dms.conversations().slice(0, 5)
    recentDms.forEach((conversation) => {
      items.push({ type: "dm", conversation })
    })

    if (dms.conversations().length > 5) {
      items.push({
        type: "action",
        action: "dm-see-more",
        label: "See More...",
      })
    }

    return items
  })

  const [selectedIndex, setSelectedIndex] = createSignal(0)

  createEffect(() => {
    const items = menuItems()
    if (items.length === 0) return

    const currentIndex = items.findIndex(
      (item) => item.type === "channel" && item.channel.slug === channels.currentChannel()
    )

    setSelectedIndex(currentIndex >= 0 ? currentIndex : 0)
  })

  createEffect(() => {
    const unreadTotal = channels.totalUnreadCount() + dms.totalUnreadCount()
    const suffix = unreadTotal > 0 ? ` (${unreadTotal})` : ""
    renderer.setTerminalTitle(`groupchat${suffix}`)
  })

  useKeyboard((key) => {
    const items = menuItems()
    if (items.length === 0) return

    if (key.name === "up" || key.name === "k") {
      setSelectedIndex((prev) => Math.max(0, prev - 1))
      return
    }

    if (key.name === "down" || key.name === "j") {
      setSelectedIndex((prev) => Math.min(items.length - 1, prev + 1))
      return
    }

    if (key.name === "return") {
      const selected = items[selectedIndex()]
      if (!selected) return

      if (selected.type === "channel") {
        channels.setCurrentChannel(selected.channel.slug)
        channels.clearUnreadCount(selected.channel.slug)
        navigation.navigate("chat")
        return
      }

      if (selected.type === "dm") {
        dms.setCurrentDm(selected.conversation)
        dms.clearUnreadCount(selected.conversation.slug)
        if (chat.channelManager()) {
          chat.channelManager()!.markDmAsRead(selected.conversation.slug).catch(() => {})
        }
        navigation.navigate("dm-chat")
        return
      }

      if (selected.type === "action") {
        if (selected.action === "create-channel") {
          navigation.navigate("create-channel")
        } else if (selected.action === "new-dm") {
          dms.setShouldStartDmSearch(true)
          navigation.navigate("dm-inbox")
        } else if (selected.action === "dm-see-more") {
          navigation.navigate("dm-inbox")
        }
      }
    }
  })

  const contentHeight = createMemo(() => props.height - (props.topPadding ?? 0) - LAYOUT_HEIGHTS.statusBar)

  const publicStartIndex = () => 0
  const privateStartIndex = () => publicStartIndex() + sortedPublicChannels().length
  const createChannelIndex = () => privateStartIndex() + channels.privateChannels().length
  const newDmIndex = () => createChannelIndex() + 1
  const dmStartIndex = () => newDmIndex() + 1
  const dmCount = () => Math.min(5, dms.conversations().length)
  const dmSeeMoreIndex = () => (dms.conversations().length > 5 ? dmStartIndex() + dmCount() : -1)
  const helpLines = [
    "↑/↓ Navigate channels",
    "Ctrl+O Logout",
    "Ctrl+C Exit the app",
  ]
  const helpContentWidth = () => Math.max(...helpLines.map((line) => line.length))
  const helpBoxWidth = () => helpContentWidth() + 4

  return (
    <Layout width={props.width} height={props.height} topPadding={props.topPadding ?? 0}>
      <Layout.Content>
        <box flexDirection="column" height={contentHeight()}>
          <box flexDirection="row" flexGrow={1}>
            <box flexDirection="column" flexGrow={1} padding={2} overflow="hidden">
              <Show when={sortedPublicChannels().length > 0}>
                <box flexDirection="column" marginBottom={1}>
                  <box marginBottom={1}>
                    <text>
                      <strong>Public Channels</strong>
                    </text>
                  </box>
                  <For each={sortedPublicChannels()}>
                    {(channel, idx) => {
                      const absoluteIndex = () => publicStartIndex() + idx()
                      const unreadCount = () => channels.unreadCounts()[channel.slug] || 0
                      return (
                        <ChannelItem
                          channel={channel}
                          isSelected={selectedIndex() === absoluteIndex()}
                          unreadCount={unreadCount()}
                        />
                      )
                    }}
                  </For>
                </box>
              </Show>

              <box flexDirection="column" marginBottom={1}>
                <box marginBottom={1}>
                  <text>
                    <strong>Private Channels</strong>
                  </text>
                </box>
                {/* Append null sentinel so the "Create" action is part of the same <For> list.
                   This guarantees render order — a sibling after <For> can shift above
                   dynamically-inserted items when the reactive list updates. */}
                <For each={[...channels.privateChannels(), null]}>
                  {(channel, idx) => {
                    if (channel === null) {
                      return (
                        <ActionItem
                          label="+ Create a new private channel"
                          isSelected={selectedIndex() === createChannelIndex()}
                        />
                      )
                    }
                    const absoluteIndex = () => privateStartIndex() + idx()
                    const unreadCount = () => channels.unreadCounts()[channel.slug] || 0
                    return (
                      <ChannelItem
                        channel={channel}
                        isSelected={selectedIndex() === absoluteIndex()}
                        unreadCount={unreadCount()}
                        isPrivate
                      />
                    )
                  }}
                </For>
              </box>

              <box flexDirection="column" marginBottom={1}>
                <box marginBottom={1}>
                  <text>
                    <strong>Direct Messages</strong>
                  </text>
                </box>

                <ActionItem
                  label="+ Start a new conversation"
                  isSelected={selectedIndex() === newDmIndex()}
                />

                <Show
                  when={!dms.loading() || dms.conversations().length > 0}
                  fallback={
                    <box marginLeft={2}>
                      <text fg="cyan">Loading conversations...</text>
                    </box>
                  }
                >
                  <Show
                    when={dms.conversations().length > 0}
                    fallback={
                      <box marginLeft={2}>
                        <text fg="#888888">No Direct Messages Yet.</text>
                      </box>
                    }
                  >
                    <For each={dms.conversations().slice(0, 5)}>
                      {(conversation, idx) => {
                        const absoluteIndex = () => dmStartIndex() + idx()
                        const isOnline = () => Boolean(chat.globalPresence()[conversation.other_username])
                        return (
                          <DmItem
                            conversation={conversation}
                            isSelected={selectedIndex() === absoluteIndex()}
                            isOnline={isOnline()}
                          />
                        )
                      }}
                    </For>
                    <Show when={dms.conversations().length > 5}>
                      <ActionItem
                        label="See More..."
                        isSelected={selectedIndex() === dmSeeMoreIndex()}
                      />
                    </Show>
                  </Show>
                </Show>
              </box>

              <Show when={allChannels().length === 0}>
                <box>
                  {channels.loading() ? (
                    <text fg="cyan">Loading channels...</text>
                  ) : (
                    <text fg="#888888">No channels available</text>
                  )}
                </box>
              </Show>
            </box>

            <box paddingRight={2} paddingTop={2}>
              <AtAGlance presenceState={chat.globalPresence()} height={contentHeight() - 4} />
            </box>
          </box>

          <box paddingLeft={2} paddingRight={2} paddingBottom={2}>
            <box
              border
              borderStyle="single"
              borderColor="gray"
              paddingLeft={1}
              paddingRight={1}
              flexDirection="column"
              overflow="hidden"
              width={helpBoxWidth()}
              alignSelf="flex-start"
            >
              <text fg="cyan" truncate width={helpContentWidth()} height={1}>
                {helpLines[0]}
              </text>
              <text fg="cyan" truncate width={helpContentWidth()} height={1}>
                {helpLines[1]}
              </text>
              <text fg="cyan" truncate width={helpContentWidth()} height={1}>
                {helpLines[2]}
              </text>
              <text fg="cyan" truncate width={helpContentWidth()} height={1}>
                {helpLines[3]}
              </text>
            </box>
          </box>
        </box>
      </Layout.Content>

      <Layout.Footer>
        <StatusBar connectionStatus={chat.connectionStatus()} error={null} showUserToggle={false} />
      </Layout.Footer>
    </Layout>
  )
}

export type ChannelItemProps = {
  channel: Channel
  isSelected: boolean
  isPrivate?: boolean
  unreadCount?: number
}

function ChannelItem(props: ChannelItemProps) {
  return (
    <box marginLeft={2} flexDirection="row" height={1} alignItems="center">
      <text fg={props.isSelected ? "#00FF00" : "white"}>
        {props.isSelected ? "> " : "  "}#{props.channel.name || props.channel.slug}
      </text>
      {props.unreadCount && props.unreadCount > 0 ? (
        <text fg="green"> ({props.unreadCount})</text>
      ) : null}
      {props.isSelected && props.channel.description ? (
        <text fg="#888888"> - {props.channel.description}</text>
      ) : null}
    </box>
  )
}

export type ActionItemProps = {
  label: string
  isSelected: boolean
}

function ActionItem(props: ActionItemProps) {
  return (
    <box marginLeft={2} flexDirection="row" height={1} alignItems="center">
      <text fg={props.isSelected ? "#00FF00" : "cyan"} truncate width="100%" height={1}>
        {props.isSelected ? "> " : "  "}{props.label}
      </text>
    </box>
  )
}

export type DmItemProps = {
  conversation: DmConversation
  isSelected: boolean
  isOnline: boolean
}

function DmItem(props: DmItemProps) {
  const formatTime = (isoString: string) => {
    const date = new Date(isoString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    }
    if (diffDays === 1) {
      return "Yesterday"
    }
    if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: "short" })
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" })
  }

  return (
    <box flexDirection="column" marginLeft={2}>
      <box flexDirection="row" height={1} alignItems="center">
        <text fg={props.isSelected ? "#00FF00" : "white"}>{props.isSelected ? "> " : "  "}</text>
        <text fg={props.isOnline ? PRESENCE.online : PRESENCE.offline}>● </text>
        <text fg={props.isSelected ? "#00FF00" : "white"}>{props.conversation.other_username}</text>
        {props.conversation.unread_count > 0 ? (
          <text fg="green"> ({props.conversation.unread_count})</text>
        ) : null}
      </box>
      <box marginLeft={4} height={1} alignItems="center">
        <text fg="#888888" truncate width="100%" height={1}>
          {props.conversation.last_message_preview || "No messages yet"} - {formatTime(props.conversation.last_activity_at)}
        </text>
      </box>
    </box>
  )
}

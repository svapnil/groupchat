import { For, Show, createEffect, createMemo, createSignal } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { Layout } from "../components/Layout"
import { StatusBar } from "../components/StatusBar"
import { useNavigation } from "../components/Router"
import { useDmStore } from "../stores/dm-store"
import { useChatStore } from "../stores/chat-store"
import { useAuth } from "../stores/auth-store"
import { createOrGetDm } from "../lib/chat-client"
import { getConfig } from "../lib/config"
import { PRESENCE } from "../lib/colors"
import { LAYOUT_HEIGHTS } from "../lib/layout"
import type { DmConversation, UserSearchResult } from "../lib/types"
import { useUserSearch } from "../primitives/use-user-search"

export type DmInboxProps = {
  width: number
  height: number
  topPadding?: number
}

export function DmInbox(props: DmInboxProps) {
  const navigation = useNavigation()
  const dms = useDmStore()
  const chat = useChatStore()
  const auth = useAuth()
  const [selectedIndex, setSelectedIndex] = createSignal(0)
  const [searchQuery, setSearchQuery] = createSignal("")
  const [searchSelectedIndex, setSearchSelectedIndex] = createSignal(0)
  const [searchError, setSearchError] = createSignal<string | null>(null)
  const [isCreating, setIsCreating] = createSignal(false)

  const userSearch = useUserSearch({
    token: auth.token,
    query: () => (dms.shouldStartDmSearch() ? searchQuery() : null),
    minQueryLength: 2,
  })

  const searchResults = createMemo(() => userSearch.results().slice(0, 10))

  createEffect(() => {
    const count = dms.conversations().length
    if (count === 0) {
      setSelectedIndex(0)
      return
    }

    setSelectedIndex((prev) => Math.min(prev, count - 1))
  })

  createEffect(() => {
    if (!dms.shouldStartDmSearch()) {
      setSearchQuery("")
      setSearchSelectedIndex(0)
      setSearchError(null)
    }
  })

  createEffect(() => {
    searchQuery()
    setSearchSelectedIndex(0)
  })

  createEffect(() => {
    const count = userSearch.results().length
    if (count === 0) {
      setSearchSelectedIndex(0)
      return
    }

    setSearchSelectedIndex((prev) => Math.min(prev, count - 1))
  })

  const startDmWithUser = async (user: UserSearchResult) => {
    const token = auth.token()
    if (!token || isCreating()) return

    setIsCreating(true)
    setSearchError(null)

    try {
      const config = getConfig()
      const dm = await createOrGetDm(config.wsUrl, token, { user_id: user.user_id })
      const existing = dms.conversations().find((convo) => convo.slug === dm.slug)
      const conversation: DmConversation = existing ?? {
        channel_id: dm.channel_id,
        slug: dm.slug,
        other_user_id: dm.other_user_id,
        other_username: dm.other_username,
        last_activity_at: new Date().toISOString(),
        last_message_preview: null,
        unread_count: 0,
      }

      dms.upsertConversation(conversation)
      dms.setCurrentDm(conversation)
      dms.clearUnreadCount(conversation.slug)

      if (chat.channelManager()) {
        chat.channelManager()!.markDmAsRead(conversation.slug).catch(() => {})
      }

      dms.setShouldStartDmSearch(false)
      setSearchQuery("")
      void dms.refetch()
      navigation.navigate("dm-chat")
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Failed to create DM")
    } finally {
      setIsCreating(false)
    }
  }

  useKeyboard((key) => {
    if (key.name === "escape") {
      if (dms.shouldStartDmSearch()) {
        dms.setShouldStartDmSearch(false)
        return
      }
      navigation.navigate("menu")
      return
    }

    if (dms.shouldStartDmSearch()) {
      if (key.name === "up") {
        if (searchResults().length === 0) return
        setSearchSelectedIndex((prev) => Math.max(0, prev - 1))
        return
      }

      if (key.name === "down") {
        if (searchResults().length === 0) return
        setSearchSelectedIndex((prev) => Math.min(searchResults().length - 1, prev + 1))
        return
      }

      if (key.name === "return" || key.name === "enter") {
        const selected = searchResults()[searchSelectedIndex()]
        if (selected) {
          void startDmWithUser(selected)
        }
      }

      return
    }

    if (key.name === "n" || key.name === "N") {
      dms.setShouldStartDmSearch(true)
      return
    }

    if (key.name === "up" || key.name === "k") {
      if (dms.conversations().length === 0) return
      setSelectedIndex((prev) => Math.max(0, prev - 1))
      return
    }

    if (key.name === "down" || key.name === "j") {
      if (dms.conversations().length === 0) return
      setSelectedIndex((prev) => Math.min(dms.conversations().length - 1, prev + 1))
      return
    }

    if (key.name === "return" || key.name === "enter") {
      const selected = dms.conversations()[selectedIndex()]
      if (!selected) return

      dms.setCurrentDm(selected)
      dms.clearUnreadCount(selected.slug)
      if (chat.channelManager()) {
        chat.channelManager()!.markDmAsRead(selected.slug).catch(() => {})
      }
      navigation.navigate("dm-chat")
    }
  })

  const contentHeight = () => props.height - (props.topPadding ?? 0) - LAYOUT_HEIGHTS.statusBar

  return (
    <Layout width={props.width} height={props.height} topPadding={props.topPadding ?? 0}>
      <Layout.Content>
        <box flexDirection="column" height={contentHeight()} paddingLeft={1} paddingRight={1}>
          <Show
            when={!dms.shouldStartDmSearch()}
            fallback={
              <box flexDirection="column">
                <box flexDirection="row" marginBottom={1}>
                  <text fg="cyan">Search user: </text>
                  <box flexGrow={1}>
                    <input
                      value={searchQuery()}
                      onInput={setSearchQuery}
                      placeholder="Type a username..."
                      focused
                    />
                  </box>
                </box>

                <Show
                  when={searchQuery().length >= 2}
                  fallback={
                    <text fg="#888888">Type at least 2 characters to search...</text>
                  }
                >
                  <Show
                    when={!userSearch.isLoading()}
                    fallback={<text fg="#888888">Searching...</text>}
                  >
                    <Show
                      when={searchResults().length > 0}
                      fallback={<text fg="#888888">No users found.</text>}
                    >
                      <For each={searchResults()}>
                        {(user, idx) => {
                          const isSelected = () => idx() === searchSelectedIndex()
                          const isOnline = () => Boolean(chat.globalPresence()[user.username])

                          return (
                            <box flexDirection="row">
                              <text fg={isSelected() ? "cyan" : "white"}>
                                {isSelected() ? "> " : "  "}
                              </text>
                              <text fg={isOnline() ? PRESENCE.online : PRESENCE.offline}>● </text>
                              <text fg={isSelected() ? "cyan" : "white"}>{user.username}</text>
                            </box>
                          )
                        }}
                      </For>
                    </Show>
                  </Show>
                </Show>

                <Show when={searchError()}>
                  <box marginTop={1}>
                    <text fg="red">{searchError()}</text>
                  </box>
                </Show>

                <box marginTop={1}>
                  <text fg="#888888">
                    {isCreating() ? "Starting DM..." : "[Enter] Start DM  [Esc] Cancel"}
                  </text>
                </box>
              </box>
            }
          >
            <box flexDirection="column">
              <box marginBottom={1} justifyContent="space-between">
                <text fg="cyan">
                  <strong>Conversations</strong>
                </text>
                <text fg="#888888">[N] New DM  [Esc] Back</text>
              </box>

              <Show
                when={!dms.loading()}
                fallback={<text fg="#888888">Loading conversations...</text>}
              >
                <Show
                  when={!dms.error()}
                  fallback={<text fg="red">{dms.error()}</text>}
                >
                  <Show
                    when={dms.conversations().length > 0}
                    fallback={
                      <box flexDirection="column">
                        <text fg="#888888">No Direct Messages Yet.</text>
                        <text fg="#888888">Press [N] to start a new DM.</text>
                      </box>
                    }
                  >
                    <For each={dms.conversations()}>
                      {(conversation, idx) => (
                        <DmRow
                          conversation={conversation}
                          isSelected={idx() === selectedIndex()}
                          isOnline={Boolean(chat.globalPresence()[conversation.other_username])}
                        />
                      )}
                    </For>
                  </Show>
                </Show>
              </Show>
            </box>
          </Show>
        </box>
      </Layout.Content>
      <Layout.Footer>
        <StatusBar
          connectionStatus={chat.connectionStatus()}
          error={dms.error() ?? searchError()}
          backLabel="Menu"
          backShortcut="ESC"
          title={
            <text fg="cyan" truncate flexShrink={1} minWidth={0}>
              <strong>DM Inbox</strong>
            </text>
          }
          showUserToggle={false}
        />
      </Layout.Footer>
    </Layout>
  )
}

function DmRow(props: { conversation: DmConversation; isSelected: boolean; isOnline: boolean }) {
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
      <box flexDirection="row">
        <text fg={props.isSelected ? "#00FF00" : "white"}>{props.isSelected ? "> " : "  "}</text>
        <text fg={props.isOnline ? PRESENCE.online : PRESENCE.offline}>● </text>
        <text fg={props.isSelected ? "#00FF00" : "white"}>{props.conversation.other_username}</text>
        {props.conversation.unread_count > 0 ? (
          <text fg="green"> ({props.conversation.unread_count})</text>
        ) : null}
      </box>
      <box marginLeft={4}>
        <text fg="#888888">
          {props.conversation.last_message_preview || "No messages yet"} - {formatTime(props.conversation.last_activity_at)}
        </text>
      </box>
    </box>
  )
}

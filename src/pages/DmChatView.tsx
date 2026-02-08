import { Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import type { ScrollBoxRenderable } from "@opentui/core"
import { Layout } from "../components/Layout"
import { StatusBar } from "../components/StatusBar"
import { InputBox } from "../components/InputBox"
import { MessageList } from "../components/MessageList"
import { useDmStore } from "../stores/dm-store"
import { useChatStore } from "../stores/chat-store"
import { useAuth } from "../stores/auth-store"
import { PRESENCE } from "../lib/colors"
import { useChannelsStore } from "../stores/channel-store"
import { useNavigation } from "../components/Router"
import { fetchDmMessages } from "../lib/chat-client"
import { getConfig } from "../lib/config"
import { calculateMiddleSectionHeight } from "../lib/layout"
import type { DmMessage, Message } from "../lib/types"

export type DmChatViewProps = {
  width: number
  height: number
  topPadding?: number
}

export function DmChatView(props: DmChatViewProps) {
  const navigation = useNavigation()
  const dms = useDmStore()
  const chat = useChatStore()
  const auth = useAuth()
  const channels = useChannelsStore()

  const [messages, setMessages] = createSignal<Message[]>([])
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string | null>(null)
  const [typingUsers, setTypingUsers] = createSignal<string[]>([])
  const [isDetached, setIsDetached] = createSignal(false)
  const [detachedLines, setDetachedLines] = createSignal(0)

  const conversation = () => dms.currentDm()
  const title = () => conversation()?.other_username || "DM"
  const topPadding = () => props.topPadding ?? 0
  const listHeight = createMemo(() => calculateMiddleSectionHeight(props.height, topPadding()))

  const isOtherUserOnline = createMemo(() => {
    const convo = conversation()
    if (!convo) return false
    return Boolean(chat.globalPresence()[convo.other_username])
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

  createEffect(() => {
    if (!conversation()) {
      navigation.navigate("dm-inbox")
    }
  })

  createEffect(() => {
    if (!process.stdout) return
    const prefix = chat.connectionStatus() === "connected" ? "* " : ""
    const unreadSuffix = channels.totalUnreadCount() + dms.totalUnreadCount()
    const suffix = unreadSuffix > 0 ? ` (${unreadSuffix})` : ""
    process.stdout.write(`\x1b]0;${prefix}@${title()}${suffix}\x07`)
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
        setMessages(data.messages || [])
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
    setIsDetached(false)
    setDetachedLines(0)
    setTypingUsers([])
    queueMicrotask(() => {
      scrollToBottom()
      updateScrollMetrics()
    })
  })

  createEffect(() => {
    messages().length
    listHeight()
    queueMicrotask(() => {
      if (!isDetached()) {
        scrollToBottom()
      }
      updateScrollMetrics()
    })
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
          timestamp: new Date().toISOString(),
          attributes: msg.attributes,
        }
        setMessages((prev) => [...prev, message])

        if (!isDetached()) {
          queueMicrotask(() => {
            scrollToBottom()
            updateScrollMetrics()
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
    if (chat.connectionStatus() !== "connected") return
    if (!messageScrollRef) return

    if (["up", "down", "pageup", "pagedown", "home", "end"].includes(key.name)) {
      if (messageScrollRef.handleKeyPress(key)) {
        updateScrollMetrics()
      }
    }
  })

  const handleSendMessage = async (content: string) => {
    const manager = chat.channelManager()
    const dm = conversation()
    if (!manager || !dm) return

    manager.sendDmMessage(dm.slug, content).catch(() => {
      setError("Failed to send message")
    })
  }

  const handleTypingStart = () => {
    const manager = chat.channelManager()
    const dm = conversation()
    if (!manager || !dm) return
    manager.startDmTyping(dm.slug)
  }

  const handleTypingStop = () => {
    const manager = chat.channelManager()
    const dm = conversation()
    if (!manager || !dm) return
    manager.stopDmTyping(dm.slug)
  }

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
        <box flexDirection="column" height={listHeight()}>
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
              messages={messages()}
              currentUsername={chat.username()}
              typingUsers={typingUsers()}
              height={listHeight()}
              isDetached={isDetached()}
              detachedLines={detachedLines()}
              scrollRef={(ref) => {
                messageScrollRef = ref
              }}
            />
          </Show>
        </box>
      </Layout.Content>
      <Layout.Footer>
        <InputBox
          onSend={handleSendMessage}
          onTypingStart={handleTypingStart}
          onTypingStop={handleTypingStop}
          disabled={chat.connectionStatus() !== "connected"}
          placeholder={conversation() ? `Message @${conversation()!.other_username}...` : "Type a message..."}
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

import { createContext, createEffect, createMemo, createSignal, useContext, type ParentComponent } from "solid-js"
import { fetchDmConversations } from "../lib/chat-client"
import { getConfig } from "../lib/config"
import { getNotificationManager } from "../lib/notification-manager"
import { sortConversationsByActivity, truncatePreview } from "../lib/dm-utils"
import type { DmConversation, DmMessage } from "../lib/types"
import { useAuth } from "./auth-store"
import { useChatStore } from "./chat-store"

export type DmContextValue = {
  conversations: () => DmConversation[]
  setConversations: (list: DmConversation[]) => void
  upsertConversation: (conversation: DmConversation) => void
  loading: () => boolean
  error: () => string | null
  refetch: () => Promise<void>
  totalUnreadCount: () => number
  clearUnreadCount: (dmSlug: string) => void
  currentDm: () => DmConversation | null
  setCurrentDm: (dm: DmConversation | null) => void
  shouldStartDmSearch: () => boolean
  setShouldStartDmSearch: (value: boolean) => void
}

const DmContext = createContext<DmContextValue>()

export const DmProvider: ParentComponent = (props) => {
  const auth = useAuth()
  const chat = useChatStore()
  const [conversations, setConversations] = createSignal<DmConversation[]>([])
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [currentDm, setCurrentDm] = createSignal<DmConversation | null>(null)
  const [shouldStartDmSearch, setShouldStartDmSearch] = createSignal(false)

  const totalUnreadCount = createMemo(() => {
    return conversations().reduce((sum, convo) => sum + convo.unread_count, 0)
  })

  const clearUnreadCount = (dmSlug: string) => {
    setConversations((prev) =>
      prev.map((convo) =>
        convo.slug === dmSlug ? { ...convo, unread_count: 0 } : convo
      )
    )
  }

  const upsertConversation = (conversation: DmConversation) => {
    setConversations((prev) => {
      const existingIndex = prev.findIndex((convo) => convo.slug === conversation.slug)
      if (existingIndex < 0) {
        return [conversation, ...prev]
      }

      const existing = prev[existingIndex]
      const existingTime = Date.parse(existing.last_activity_at)
      const newTime = Date.parse(conversation.last_activity_at)
      const lastActivity =
        Number.isNaN(newTime) || newTime < existingTime ? existing.last_activity_at : conversation.last_activity_at

      const updated: DmConversation = {
        ...existing,
        ...conversation,
        last_activity_at: lastActivity,
        last_message_preview: conversation.last_message_preview ?? existing.last_message_preview,
        unread_count: Math.max(existing.unread_count, conversation.unread_count),
      }

      const withoutExisting = prev.filter((_, index) => index !== existingIndex)
      return [updated, ...withoutExisting]
    })
  }

  const fetchData = async () => {
    const token = auth.token()
    if (!token) return

    setLoading(true)
    setError(null)

    try {
      const config = getConfig()
      const data = await fetchDmConversations(config.wsUrl, token)
      setConversations(sortConversationsByActivity(data.conversations))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch DM conversations")
    } finally {
      setLoading(false)
    }
  }

  const handleDmMessage = (msg: DmMessage) => {
    const now = new Date().toISOString()
    const preview = truncatePreview(msg.content)

    const activeDmSlug = currentDm()?.slug ?? null
    const isActiveConversation = activeDmSlug === msg.dm_slug
    const isOwnMessage = msg.username === chat.username()

    setConversations((prev) => {
      const existingIndex = prev.findIndex((conv) => conv.slug === msg.dm_slug)

      if (existingIndex >= 0) {
        const updated = prev.filter((_, idx) => idx !== existingIndex)
        const conversation: DmConversation = {
          ...prev[existingIndex],
          last_activity_at: now,
          last_message_preview: preview,
          unread_count: isActiveConversation || isOwnMessage
            ? prev[existingIndex].unread_count
            : prev[existingIndex].unread_count + 1,
        }
        return [conversation, ...updated]
      }

      const newConversation: DmConversation = {
        channel_id: msg.dm_slug,
        slug: msg.dm_slug,
        other_user_id: msg.sender_id,
        other_username: msg.username,
        last_activity_at: now,
        last_message_preview: preview,
        unread_count: isOwnMessage ? 0 : 1,
      }
      return [newConversation, ...prev]
    })

    if (!isOwnMessage && !isActiveConversation) {
      getNotificationManager().notify("alert", `New DM from ${msg.username}`)
    }
  }

  createEffect(() => {
    const manager = chat.channelManager()
    if (!manager) {
      return
    }

    const managerWithCallbacks = manager as unknown as {
      callbacks: {
        onDmMessage?: (msg: DmMessage) => void
      }
    }

    const originalCallback = managerWithCallbacks.callbacks.onDmMessage
    managerWithCallbacks.callbacks.onDmMessage = handleDmMessage

    return () => {
      managerWithCallbacks.callbacks.onDmMessage = originalCallback
    }
  })

  createEffect(() => {
    const token = auth.token()
    if (!token) {
      setConversations([])
      setLoading(false)
      setError(null)
      return
    }

    void fetchData()
  })

  return (
    <DmContext.Provider
      value={{
        conversations,
        setConversations,
        upsertConversation,
        loading,
        error,
        refetch: fetchData,
        totalUnreadCount,
        clearUnreadCount,
        currentDm,
        setCurrentDm,
        shouldStartDmSearch,
        setShouldStartDmSearch,
      }}
    >
      {props.children}
    </DmContext.Provider>
  )
}

export const useDmStore = () => {
  const context = useContext(DmContext)
  if (!context) {
    throw new Error("useDmStore must be used within a DmProvider")
  }
  return context
}

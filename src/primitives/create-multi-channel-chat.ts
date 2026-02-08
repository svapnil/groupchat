import { createEffect, createMemo, createSignal, onCleanup, type Accessor } from "solid-js"
import { createStore } from "solid-js/store"
import { ChannelManager } from "../lib/channel-manager"
import { fetchChannels } from "../lib/chat-client"
import { getConfig } from "../lib/config"
import { getNotificationManager } from "../lib/notification-manager"
import { applyPresenceDiff } from "../lib/presence-utils"
import type {
  ConnectionStatus,
  Message,
  PresenceState,
  Subscriber,
} from "../lib/types"

export type MultiChannelChatOptions = {
  token: Accessor<string | null>
  currentChannel: Accessor<string>
  onChannelListChanged?: () => void
  incrementUnreadCount?: (channelSlug: string) => void
}

export type MultiChannelChat = {
  messages: () => Message[]
  connectionStatus: () => ConnectionStatus
  username: () => string | null
  error: () => string | null
  sendMessage: (message: string) => Promise<void>
  startTyping: () => void
  stopTyping: () => void
  typingUsers: () => string[]
  presenceState: () => PresenceState
  globalPresence: () => PresenceState
  subscribers: () => Subscriber[]
  connect: () => void
  disconnect: () => void
  channelManager: () => ChannelManager | null
}

export const createMultiChannelChat = (options: MultiChannelChatOptions): MultiChannelChat => {
  const [messageCache, setMessageCache] = createStore<Record<string, Message[]>>({})
  const [subscriberCache, setSubscriberCache] = createStore<Record<string, Subscriber[]>>({})
  const [connectionStatus, setConnectionStatus] = createSignal<ConnectionStatus>("disconnected")
  const [username, setUsername] = createSignal<string | null>(null)
  const [error, setError] = createSignal<string | null>(null)
  const [typingUsers, setTypingUsers] = createSignal<string[]>([])
  const [presenceState, setPresenceState] = createSignal<PresenceState>({})
  const [globalPresence, setGlobalPresence] = createSignal<PresenceState>({})
  const [channelsReady, setChannelsReady] = createSignal(false)
  const [managerSignal, setManagerSignal] = createSignal<ChannelManager | null>(null)

  let prevChannel: string | null = null
  let isLoadingHistory = false
  let userChannelJoinAttempted = false
  let myUsername: string | null = null

  const messages = createMemo(() => messageCache[options.currentChannel()] ?? [])
  const subscribers = createMemo(() => subscriberCache[options.currentChannel()] ?? [])

  createEffect(() => {
    const token = options.token()
    if (!token) {
      if (managerSignal()) {
        managerSignal()!.disconnect()
      }
      setManagerSignal(null)
      setChannelsReady(false)
      setConnectionStatus("disconnected")
      setUsername(null)
      setTypingUsers([])
      setPresenceState({})
      setGlobalPresence({})
      return
    }

    const config = getConfig()

    const manager = new ChannelManager(config.wsUrl, token, {
      onMessage: (channelSlug, message) => {
        setMessageCache(channelSlug, (prev) => (prev ? [...prev, message] : [message]))

        if (myUsername && message.username !== myUsername) {
          getNotificationManager().notify("bell")
        }
      },
      onNonActiveChannelMessage: (channelSlug, message) => {
        if (message.type === "system") return
        if (options.incrementUnreadCount) {
          options.incrementUnreadCount(channelSlug)
        }
      },
      onPresenceState: (channelSlug, state) => {
        setPresenceState(state)

        if (userChannelJoinAttempted) {
          return
        }

        const currentUsername = manager.getUsername()
        if (!currentUsername) return

        const meta = state[currentUsername]?.metas?.[0]
        const userId = meta?.user_id
        if (!userId) return

        userChannelJoinAttempted = true
        manager.joinUserChannel(userId).catch((err) => {
          console.error("Failed to join user channel:", err)
          userChannelJoinAttempted = false
        })
      },
      onPresenceDiff: (channelSlug, diff) => {
        setPresenceState((prev) => applyPresenceDiff(prev, diff))
      },
      onUserTyping: (channelSlug, typingUsername, typing) => {
        setTypingUsers((prev) => {
          if (typing) {
            return prev.includes(typingUsername) ? prev : [...prev, typingUsername]
          }
          return prev.filter((user) => user !== typingUsername)
        })
      },
      onConnectionChange: (status) => {
        setConnectionStatus(status)
        if (status === "disconnected" || status === "error") {
          setError(null)
        }
      },
      onError: (err) => {
        setError(err)
      },
      onChannelJoined: (channelSlug, joinedUsername) => {
        if (!username()) {
          setUsername(joinedUsername)
        }
        myUsername = joinedUsername
      },
      onInvitedToChannel: (channelSlug, invitedBy) => {
        if (!managerSignal()) return

        const authToken = token
        async function joinNewChannel() {
          try {
            const channelsResponse = await fetchChannels(config.wsUrl, authToken)
            const allChannels = [
              ...channelsResponse.channels.public,
              ...channelsResponse.channels.private,
            ]
            const newChannel = allChannels.find((channel) => channel.slug === channelSlug)
            if (newChannel) {
              await manager.subscribeToChannels([newChannel])
              if (options.onChannelListChanged) {
                options.onChannelListChanged()
              }
            }
          } catch (err) {
            console.error("Failed to join new channel:", err)
          }
        }

        void joinNewChannel()
      },
      onUserInvitedToChannel: (channelSlug, invitedUsername, invitedUserId) => {
        setSubscriberCache((prev) => {
          const currentSubs = prev[channelSlug] || []
          const exists = currentSubs.some((subscriber) => subscriber.user_id === invitedUserId)
          if (!exists) {
            return {
              ...prev,
              [channelSlug]: [
                ...currentSubs,
                { username: invitedUsername, user_id: invitedUserId, role: "member" },
              ],
            }
          }
          return prev
        })
      },
      onRemovedFromChannel: (channelSlug, removedBy) => {
        setError(`You were removed from ${channelSlug} by ${removedBy}`)
      },
      onUserRemovedFromChannel: (channelSlug, removedUsername) => {
        setSubscriberCache((prev) => {
          const currentSubs = prev[channelSlug] || []
          return {
            ...prev,
            [channelSlug]: currentSubs.filter((sub) => sub.username !== removedUsername),
          }
        })
      },
      onGlobalPresenceState: (state) => {
        setGlobalPresence(state)
      },
      onGlobalPresenceDiff: (diff) => {
        setGlobalPresence((prev) => applyPresenceDiff(prev, diff))
      },
      onChannelListChanged: () => {
        if (options.onChannelListChanged) {
          options.onChannelListChanged()
        }
      },
    })

    setManagerSignal(manager)
    userChannelJoinAttempted = false
    myUsername = null

    const init = async () => {
      try {
        await manager.connect()
        await manager.joinStatusChannel()

        const channelsResponse = await fetchChannels(config.wsUrl, token)
        const allChannels = [
          ...channelsResponse.channels.public,
          ...channelsResponse.channels.private,
        ]

        await manager.subscribeToChannels(allChannels)
        setChannelsReady(true)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Connection failed")
        console.error("Failed to initialize multi-channel chat:", err)
      }
    }

    void init()

    onCleanup(() => {
      manager.disconnect()
      setChannelsReady(false)
      setManagerSignal(null)
    })
  })

  createEffect(() => {
    const manager = managerSignal()
    const currentChannel = options.currentChannel()
    const status = connectionStatus()

    if (!manager || status !== "connected" || !currentChannel) {
      return
    }

    if (prevChannel && prevChannel !== currentChannel) {
      manager.stopTyping(prevChannel)
    }

    prevChannel = currentChannel

    const loadHistory = async () => {
      await manager.setActiveChannel(currentChannel)
      if (isLoadingHistory) return

      isLoadingHistory = true

      try {
        const history = await manager.fetchHistory(currentChannel)

        if (currentChannel.startsWith("private_room:")) {
          const subs = await manager.fetchSubscribers(currentChannel)
          setSubscriberCache((prev) => ({
            ...prev,
            [currentChannel]: subs,
          }))
        } else {
          setSubscriberCache((prev) => ({
            ...prev,
            [currentChannel]: [],
          }))
        }

        const realtimeMessages = manager.getRealtimeMessages(currentChannel)
        const merged = [...history, ...realtimeMessages]
        const seen = new Set<string>()
        const deduplicated = merged.filter((msg) => {
          if (seen.has(msg.id)) return false
          seen.add(msg.id)
          return true
        })

        deduplicated.sort((a, b) => a.timestamp.localeCompare(b.timestamp))

        setMessageCache((prev) => ({
          ...prev,
          [currentChannel]: deduplicated,
        }))

        manager.clearRealtimeMessages(currentChannel)

        const presence = manager.getPresence(currentChannel)
        setPresenceState(presence)

        const typing = manager.getTypingUsers(currentChannel)
        setTypingUsers(typing)

        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load history")
        console.error("Failed to load message history:", err)
      } finally {
        isLoadingHistory = false
      }
    }

    void loadHistory()
  })

  const sendMessage = async (content: string) => {
    const manager = managerSignal()
    if (!manager) {
      throw new Error("Not connected")
    }
    await manager.sendMessage(options.currentChannel(), content)
  }

  const startTyping = () => {
    managerSignal()?.startTyping(options.currentChannel())
  }

  const stopTyping = () => {
    managerSignal()?.stopTyping(options.currentChannel())
  }

  const connect = () => {
    // no-op
  }

  const disconnect = () => {
    // no-op
  }

  return {
    messages,
    connectionStatus,
    username,
    error,
    sendMessage,
    startTyping,
    stopTyping,
    typingUsers,
    presenceState,
    globalPresence,
    subscribers,
    connect,
    disconnect,
    channelManager: () => (channelsReady() ? managerSignal() : null),
  }
}

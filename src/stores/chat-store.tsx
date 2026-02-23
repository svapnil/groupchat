// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { createContext, useContext, type ParentComponent } from "solid-js"
import type { ChannelManager } from "../lib/channel-manager"
import type { ConnectionStatus, Message, PresenceState, Subscriber } from "../lib/types"
import { createAgentDetection } from "../primitives/create-agent-detection"
import { createMultiChannelChat } from "../primitives/create-multi-channel-chat"
import { useAuth } from "./auth-store"
import { useChannelsStore } from "./channel-store"

export type ChatStoreValue = {
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

const ChatContext = createContext<ChatStoreValue>()

export const ChatProvider: ParentComponent = (props) => {
  const auth = useAuth()
  const channels = useChannelsStore()

  const chat = createMultiChannelChat({
    token: auth.token,
    currentChannel: channels.currentChannel,
    incrementUnreadCount: channels.incrementUnreadCount,
  })

  createAgentDetection(
    () => chat.channelManager(),
    () => chat.connectionStatus() === "connected"
  )

  return (
    <ChatContext.Provider value={chat}>
      {props.children}
    </ChatContext.Provider>
  )
}

export const useChatStore = () => {
  const context = useContext(ChatContext)
  if (!context) {
    throw new Error("useChatStore must be used within a ChatProvider")
  }
  return context
}

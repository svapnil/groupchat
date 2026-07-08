// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { createMemo, type Accessor } from "solid-js"
import type { AgentType, PresenceState, Subscriber, User } from "../lib/types"

export type UserWithStatus = User & {
  isOnline: boolean
  role?: "member" | "admin"
  currentAgent?: AgentType
}

function getCurrentAgent(globalPresence: PresenceState, username: string): AgentType {
  return globalPresence[username]?.metas[0]?.current_agent ?? null
}

function presenceToUsers(
  presence: PresenceState,
  globalPresence: PresenceState
): (User & { currentAgent?: AgentType })[] {
  return Object.entries(presence).map(([username, data]) => ({
    username,
    user_id: data.metas[0]?.user_id ?? 0,
    online_at: data.metas[0]?.online_at || "",
    currentAgent: getCurrentAgent(globalPresence, username),
  }))
}

function mergeSubscribersWithPresence(
  subscribers: Subscriber[],
  presence: PresenceState,
  globalPresence: PresenceState,
  isPrivateChannel: boolean
): UserWithStatus[] {
  if (!isPrivateChannel) {
    const onlineUsers = presenceToUsers(presence, globalPresence)
    return onlineUsers.map((user) => ({
      ...user,
      isOnline: true,
      currentAgent: user.currentAgent,
    }))
  }

  const onlineUsernames = new Set(Object.keys(presence))

  return subscribers.map((subscriber) => {
    const isOnline = onlineUsernames.has(subscriber.username)

    return {
      username: subscriber.username,
      user_id: subscriber.user_id,
      online_at: isOnline ? presence[subscriber.username].metas[0]?.online_at || "" : "",
      isOnline,
      role: subscriber.role,
      currentAgent: isOnline ? getCurrentAgent(globalPresence, subscriber.username) : null,
    }
  })
}

export const createPresenceUsers = (options: {
  presenceState: Accessor<PresenceState>
  subscribers: Accessor<Subscriber[]>
  currentChannel: Accessor<string>
  globalPresence: Accessor<PresenceState>
}): Accessor<UserWithStatus[]> => {
  return createMemo(() => {
    const isPrivateChannel = options.currentChannel().startsWith("private_room:")
    return mergeSubscribersWithPresence(
      options.subscribers(),
      options.presenceState(),
      options.globalPresence(),
      isPrivateChannel
    )
  })
}

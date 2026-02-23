// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { createContext, createEffect, createMemo, createSignal, useContext, type ParentComponent } from "solid-js"
import { createStore } from "solid-js/store"
import { fetchChannels, fetchUnreadCounts } from "../lib/chat-client"
import { getConfig } from "../lib/config"
import type { Channel, UnreadCounts } from "../lib/types"
import { useAuth } from "./auth-store"

export type ChannelContextValue = {
  currentChannel: () => string
  setCurrentChannel: (slug: string) => void
  publicChannels: () => Channel[]
  privateChannels: () => Channel[]
  setChannels: (publicChannels: Channel[], privateChannels: Channel[]) => void
  unreadCounts: () => UnreadCounts
  setUnreadCount: (slug: string, count: number) => void
  incrementUnreadCount: (slug: string) => void
  clearUnreadCount: (slug: string) => void
  totalUnreadCount: () => number
  loading: () => boolean
  error: () => string | null
  refetch: () => Promise<void>
  refetchUnreadCounts: () => Promise<void>
}

const ChannelContext = createContext<ChannelContextValue>()

export const ChannelProvider: ParentComponent = (props) => {
  const auth = useAuth()
  const [currentChannel, setCurrentChannel] = createSignal("chat_room:global")
  const [publicChannels, setPublicChannels] = createSignal<Channel[]>([])
  const [privateChannels, setPrivateChannels] = createSignal<Channel[]>([])
  const [unreadCounts, setUnreadCounts] = createStore<UnreadCounts>({})
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const setChannels = (publicList: Channel[], privateList: Channel[]) => {
    setPublicChannels(publicList)
    setPrivateChannels(privateList)
  }

  const setUnreadCount = (slug: string, count: number) => {
    setUnreadCounts(slug, count)
  }

  const incrementUnreadCount = (slug: string) => {
    setUnreadCounts(slug, (prev) => (prev ?? 0) + 1)
  }

  const clearUnreadCount = (slug: string) => {
    setUnreadCounts(slug, 0)
  }

  const totalUnreadCount = createMemo(() => {
    const counts = Object.values(unreadCounts)
    return counts.reduce((sum, value) => sum + value, 0)
  })

  const fetchData = async () => {
    const token = auth.token()
    if (!token) return

    setLoading(true)
    setError(null)

    try {
      const config = getConfig()
      const [channelsData, unreadData] = await Promise.all([
        fetchChannels(config.wsUrl, token),
        fetchUnreadCounts(config.wsUrl, token),
      ])

      setPublicChannels(channelsData.channels.public)
      setPrivateChannels(channelsData.channels.private)
      setUnreadCounts(unreadData)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data")
    } finally {
      setLoading(false)
    }
  }

  const refetchUnreadCounts = async () => {
    const token = auth.token()
    if (!token) return

    try {
      const config = getConfig()
      const unreadData = await fetchUnreadCounts(config.wsUrl, token)
      setUnreadCounts(unreadData)
    } catch (err) {
      console.error("Failed to refetch unread counts:", err)
    }
  }

  createEffect(() => {
    const token = auth.token()
    if (!token) {
      setPublicChannels([])
      setPrivateChannels([])
      setUnreadCounts({})
      setLoading(false)
      setError(null)
      return
    }

    void fetchData()
  })

  return (
    <ChannelContext.Provider
      value={{
        currentChannel,
        setCurrentChannel,
        publicChannels,
        privateChannels,
        setChannels,
        unreadCounts: () => unreadCounts,
        setUnreadCount,
        incrementUnreadCount,
        clearUnreadCount,
        totalUnreadCount,
        loading,
        error,
        refetch: fetchData,
        refetchUnreadCounts,
      }}
    >
      {props.children}
    </ChannelContext.Provider>
  )
}

export const useChannelsStore = () => {
  const context = useContext(ChannelContext)
  if (!context) {
    throw new Error("useChannelsStore must be used within a ChannelProvider")
  }
  return context
}

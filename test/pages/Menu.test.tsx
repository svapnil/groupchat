// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { afterEach, describe, expect, test } from "bun:test"
import { onMount, type JSX } from "solid-js"
import { testRender } from "@opentui/solid"
import { AuthProvider } from "../../src/stores/auth-store"
import { ChannelProvider, useChannelsStore } from "../../src/stores/channel-store"
import { ChatProvider } from "../../src/stores/chat-store"
import { DmProvider, useDmStore } from "../../src/stores/dm-store"
import { Router } from "../../src/components/Router"
import { Menu } from "../../src/pages/Menu"
import type { Channel, DmConversation } from "../../src/lib/types"

let testSetup: Awaited<ReturnType<typeof testRender>> | null = null

afterEach(() => {
  if (testSetup) {
    testSetup.renderer.destroy()
    testSetup = null
  }
})

const publicChannels: Channel[] = [
  {
    id: "1",
    slug: "chat_room:global",
    type: "public",
    name: "global",
    description: null,
  },
  {
    id: "2",
    slug: "chat_room:engineering",
    type: "public",
    name: "engineering",
    description: null,
  },
]

const privateChannels: Channel[] = [
  {
    id: "3",
    slug: "private_room:maintainers",
    type: "private",
    name: "maintainers",
    description: null,
  },
]

const conversations: DmConversation[] = [
  {
    channel_id: "dm-1",
    slug: "dm:alice-bob",
    other_user_id: 2,
    other_username: "bob",
    last_activity_at: "2024-01-02T00:00:00.000Z",
    last_message_preview: "Ship it",
    unread_count: 1,
  },
  {
    channel_id: "dm-2",
    slug: "dm:alice-charlie",
    other_user_id: 3,
    other_username: "charlie",
    last_activity_at: "2024-01-01T00:00:00.000Z",
    last_message_preview: "LGTM",
    unread_count: 0,
  },
]

function SeededMenu() {
  const channels = useChannelsStore()
  const dms = useDmStore()

  onMount(() => {
    channels.setChannels(publicChannels, privateChannels)
    channels.setCurrentChannel("chat_room:global")
    channels.setUnreadCount("chat_room:engineering", 2)
    channels.setUnreadCount("private_room:maintainers", 1)

    dms.setConversations(conversations)
  })

  return <Menu width={110} height={30} />
}

function EmptySeededMenu() {
  const channels = useChannelsStore()
  const dms = useDmStore()

  onMount(() => {
    channels.setChannels([], [])
    dms.setConversations([])
  })

  return <Menu width={90} height={24} />
}

function withProviders(children: () => JSX.Element) {
  return (
    <AuthProvider>
      <ChannelProvider>
        <ChatProvider>
          <DmProvider>
            <Router initialRoute="menu">{children()}</Router>
          </DmProvider>
        </ChatProvider>
      </ChannelProvider>
    </AuthProvider>
  )
}

describe("Menu", () => {
  test("renders channel and dm sections with seeded data", async () => {
    testSetup = await testRender(
      () => withProviders(() => <SeededMenu />),
      { width: 120, height: 34 },
    )

    await testSetup.renderOnce()
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()

    expect(frame).toContain("Public Channels")
    expect(frame).toContain("Private Channels")
    expect(frame).toContain("Direct Messages")
    expect(frame).toContain("#engineering")
    expect(frame).toContain("bob")
    expect(frame).toMatchSnapshot()
  })

  test("renders empty-state menu", async () => {
    testSetup = await testRender(
      () => withProviders(() => <EmptySeededMenu />),
      { width: 100, height: 28 },
    )

    await testSetup.renderOnce()
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()

    expect(frame).toContain("No channels available")
    expect(frame).toContain("No Direct Messages Yet.")
    expect(frame).toContain("No users online")
    expect(frame).toMatchSnapshot()
  })
})

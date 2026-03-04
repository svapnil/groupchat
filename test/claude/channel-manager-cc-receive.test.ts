// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { describe, expect, test } from "bun:test"
import type { Message } from "../../src/lib/types"
import { ChannelManager } from "../../src/lib/channel-manager"
import { upsertAgentMessage } from "../../src/agent/core/message-mutations"

type ChannelHandler = (payload: unknown) => void

function makeChannelStub() {
  const handlers = new Map<string, ChannelHandler>()
  const pushCalls: Array<{ event: string; payload: unknown }> = []
  const chain = {
    receive(_kind: string, _cb: (...args: unknown[]) => void) {
      return chain
    },
  }

  const channel = {
    on(event: string, handler: ChannelHandler) {
      handlers.set(event, handler)
    },
    push(event: string, payload: unknown) {
      pushCalls.push({ event, payload })
      return chain
    },
    leave() {},
  }

  return { channel, handlers, pushCalls }
}

function setConnected(manager: ChannelManager) {
  ;(manager as any).socket = {}
  ;(manager as any).connectionStatus = "connected"
}

function attachSubscribedChannel(manager: ChannelManager, slug: string, channel: unknown) {
  ;(manager as any).channelStates.set(slug, {
    slug,
    channel,
    presence: {},
    typingUsers: new Set<string>(),
    realtimeMessages: [],
    subscribers: [],
  })
}

describe("ChannelManager cc receive path", () => {
  test("preserves cc type/attributes on incoming channel:new_message", () => {
    const received: Array<{ slug: string; message: Message }> = []
    const manager = new ChannelManager("ws://example.test/socket", "token", {
      onMessage: (slug, message) => {
        received.push({ slug, message })
      },
    })
    setConnected(manager)

    const { channel, handlers } = makeChannelStub()
    const slug = "public:general"
    attachSubscribedChannel(manager, slug, channel)
    ;(manager as any).currentActiveChannel = slug
    ;(manager as any).setupChannelHandlers(channel, slug)

    const payload = {
      id: "018f8f36-3d00-7abc-8def-0123456789ab",
      username: "alice",
      content: "Read(src/app.ts)",
      type: "cc",
      attributes: {
        cc: {
          turn_id: "turn-1",
          session_id: "session-1",
          event: "tool_call",
          tool_name: "Read",
        },
      },
    }

    const onNewMessage = handlers.get("new_message")
    expect(onNewMessage).toBeDefined()
    onNewMessage?.(payload)

    expect(received).toHaveLength(1)
    expect(received[0].slug).toBe(slug)
    expect(received[0].message.type).toBe("cc")
    expect(received[0].message.attributes?.cc).toEqual(payload.attributes.cc)
  })

  test("feeds received cc messages into upsertAgentMessage as one aggregated timeline", () => {
    let aggregated: Message[] = []
    const manager = new ChannelManager("ws://example.test/socket", "token", {
      onMessage: (_slug, message) => {
        aggregated = upsertAgentMessage(aggregated, message, "charlie")
      },
    })
    setConnected(manager)

    const { channel, handlers } = makeChannelStub()
    const slug = "public:general"
    attachSubscribedChannel(manager, slug, channel)
    ;(manager as any).currentActiveChannel = slug
    ;(manager as any).setupChannelHandlers(channel, slug)

    const onNewMessage = handlers.get("new_message")
    expect(onNewMessage).toBeDefined()

    onNewMessage?.({
      id: "018f8f36-3d00-7abc-8def-0123456789ab",
      username: "alice",
      content: "What changed?",
      type: "cc",
      attributes: {
        cc: {
          turn_id: "turn-1",
          session_id: "session-1",
          event: "question",
        },
      },
    })
    onNewMessage?.({
      id: "018f8f36-3d01-7abc-8def-0123456789ab",
      username: "alice",
      content: "Read(src/app.ts)",
      type: "cc",
      attributes: {
        cc: {
          turn_id: "turn-2",
          session_id: "session-1",
          event: "tool_call",
          tool_name: "Read",
        },
      },
    })

    expect(aggregated).toHaveLength(1)
    expect(aggregated[0].type).toBe("cc")
    expect(aggregated[0].content).toBe("Read(src/app.ts)")
    expect(aggregated[0].attributes?.cc?.events?.map((event) => event.event)).toEqual([
      "question",
      "tool_call",
    ])
    expect(aggregated[0].attributes?.cc?.contents).toEqual([
      "What changed?",
      "Read(src/app.ts)",
    ])
  })
})

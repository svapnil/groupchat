// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { describe, expect, test } from "bun:test"
import type { CcEventMetadata } from "../../src/lib/types"
import { ChannelManager } from "../../src/lib/channel-manager"

type PushCall = {
  event: string
  payload: unknown
}

function createPushRecorder() {
  const pushCalls: PushCall[] = []
  const chain = {
    receive(_kind: string, _cb: (...args: unknown[]) => void) {
      return chain
    },
  }

  const channel = {
    push(event: string, payload: unknown) {
      pushCalls.push({ event, payload })
      return chain
    },
  }

  return { channel, pushCalls }
}

function setConnected(manager: ChannelManager) {
  ;(manager as any).socket = {}
  ;(manager as any).connectionStatus = "connected"
}

describe("ChannelManager.sendAgentEvent", () => {
  test("sends cc payload via subscribed channel", async () => {
    const manager = new ChannelManager("ws://example.test/socket", "token")
    setConnected(manager)

    const { channel, pushCalls } = createPushRecorder()
    ;(manager as any).channelStates.set("public:general", {
      slug: "public:general",
      channel,
      presence: {},
      typingUsers: new Set<string>(),
      realtimeMessages: [],
      subscribers: [],
    })

    const ccMeta: CcEventMetadata = {
      turn_id: "turn-1",
      session_id: "session-1",
      event: "tool_call",
      tool_name: "Read",
    }

    await manager.sendAgentEvent("public:general", "Read(src/app.ts)", ccMeta)

    expect(pushCalls).toHaveLength(1)
    expect(pushCalls[0]).toEqual({
      event: "new_message",
      payload: {
        content: "Read(src/app.ts)",
        type: "cc",
        attributes: {
          cc: ccMeta,
        },
      },
    })
  })

  test("routes cc payload to DM transport for dm:* channels without active subscription", async () => {
    const manager = new ChannelManager("ws://example.test/socket", "token")
    setConnected(manager)

    const dmCalls: unknown[][] = []
    ;(manager as any).sendDmMessage = (...args: unknown[]) => {
      dmCalls.push(args)
      return Promise.resolve({ message_id: "m1" })
    }

    const ccMeta: CcEventMetadata = {
      turn_id: "turn-2",
      event: "text",
    }

    await manager.sendAgentEvent("dm:alice", "hello from claude", ccMeta)

    expect(dmCalls).toHaveLength(1)
    expect(dmCalls[0]).toEqual([
      "dm:alice",
      "hello from claude",
      { cc: ccMeta },
      "cc",
    ])
  })

  test("is a no-op when disconnected", async () => {
    const manager = new ChannelManager("ws://example.test/socket", "token")
    ;(manager as any).connectionStatus = "disconnected"
    ;(manager as any).socket = null

    const dmCalls: unknown[][] = []
    ;(manager as any).sendDmMessage = (...args: unknown[]) => {
      dmCalls.push(args)
      return Promise.resolve({ message_id: "m1" })
    }

    await manager.sendAgentEvent("dm:alice", "ignored", {
      turn_id: "turn-3",
      event: "question",
    })

    expect(dmCalls).toHaveLength(0)
  })
})

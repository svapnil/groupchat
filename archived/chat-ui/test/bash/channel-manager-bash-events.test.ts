// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { describe, expect, test } from "bun:test"
import type { BashEventMetadata } from "../../src/lib/types"
import { ChannelManager } from "../../src/lib/channel-manager"

type PushCall = {
  event: string
  payload: unknown
}

function createPushRecorder() {
  const pushCalls: PushCall[] = []
  const chain = {
    receive(kind: string, cb: (...args: unknown[]) => void) {
      if (kind === "ok") {
        cb({ message_id: "m1" })
      }
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

describe("ChannelManager.sendBashEvent", () => {
  test("sends bash prompt payload via subscribed channel", async () => {
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

    const bashMeta: BashEventMetadata = {
      command_id: "cmd-1",
      event: "prompt",
      cwd: "/tmp/project",
    }

    const response = await manager.sendBashEvent("public:general", "bash_prompt", "echo hello", bashMeta)

    expect(response).toEqual({ message_id: "m1" })
    expect(pushCalls).toHaveLength(1)
    expect(pushCalls[0]).toEqual({
      event: "new_message",
      payload: {
        content: "echo hello",
        type: "bash_prompt",
        attributes: {
          bash: bashMeta,
        },
      },
    })
  })

  test("routes bash output payload to DM transport without an active subscription", async () => {
    const manager = new ChannelManager("ws://example.test/socket", "token")
    setConnected(manager)

    const dmCalls: unknown[][] = []
    ;(manager as any).sendDmMessage = (...args: unknown[]) => {
      dmCalls.push(args)
      return Promise.resolve({ message_id: "m2" })
    }

    const bashMeta: BashEventMetadata = {
      command_id: "cmd-2",
      event: "output",
      status: "completed",
      exit_code: 0,
    }

    const response = await manager.sendBashEvent("dm:alice", "bash_output", "hello", bashMeta)

    expect(response).toEqual({ message_id: "m2" })
    expect(dmCalls).toHaveLength(1)
    expect(dmCalls[0]).toEqual([
      "dm:alice",
      "hello",
      { bash: bashMeta },
      "bash_output",
    ])
  })
})

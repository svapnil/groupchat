// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { afterEach, describe, expect, mock, test } from "bun:test"
import { createRoot, createSignal } from "solid-js"
import type { LocalAgentSessionEntry, AgentEvent } from "../../src/agent/core/types"
import type { ConnectionStatus, Message } from "../../src/lib/types"

let emitAgentEvent: ((event: AgentEvent) => void) | null = null

mock.module("../../src/agent/core/local-agent-sessions", () => {
  return {
    createLocalAgentSessions: (): LocalAgentSessionEntry[] => {
      const [isActive] = createSignal(false)
      const [isConnecting] = createSignal(false)
      const [messages] = createSignal<Message[]>([])

      return [
        {
          id: "claude",
          isAvailable: () => true,
          session: {
            isActive,
            isConnecting,
            messages,
            start: async () => {},
            stop: () => {},
            sendMessage: async () => {},
            appendError: () => {},
            onEvent: (callback) => {
              emitAgentEvent = callback
            },
          },
        },
      ]
    },
  }
})

afterEach(() => {
  emitAgentEvent = null
})

describe("createChatViewBase agent event bridge", () => {
  test("binds each turn to its question channel until result, then clears mapping", async () => {
    const { createChatViewBase } = await import("../../src/primitives/create-chat-view-base")

    const [baseMessages] = createSignal<Message[]>([])
    const [listHeight] = createSignal(20)
    const [connectionStatus] = createSignal<ConnectionStatus>("connected")
    const [username] = createSignal<string | null>("alice")
    const [currentChannel, setCurrentChannel] = createSignal("public:alpha")

    const sent: Array<{ channel: string; type: string; content: string; meta: Record<string, unknown> }> = []
    const manager = {
      sendAgentEvent: (channel: string, type: string, content: string, meta: Record<string, unknown>) => {
        sent.push({ channel, type, content, meta })
        return Promise.resolve()
      },
    }
    const [channelManager] = createSignal(manager as any)

    let dispose = () => {}
    createRoot((rootDispose) => {
      dispose = rootDispose
      createChatViewBase({
        baseMessages,
        listHeight,
        connectionStatus,
        username,
        channelManager,
        currentChannel,
      })
    })

    expect(emitAgentEvent).not.toBeNull()

    emitAgentEvent!({
      agentId: "claude",
      wireType: "cc",
      turnId: "turn-1",
      sessionId: "session-1",
      event: "question",
      content: "Q1",
    })

    setCurrentChannel("public:beta")

    emitAgentEvent!({
      agentId: "claude",
      wireType: "cc",
      turnId: "turn-1",
      sessionId: "session-1",
      event: "tool_call",
      content: "Read(file-1)",
      toolName: "Read",
    })

    emitAgentEvent!({
      agentId: "claude",
      wireType: "cc",
      turnId: "turn-1",
      sessionId: "session-1",
      event: "result",
      content: "",
      isError: false,
    })

    // Mapping should be gone after result, so non-question fallback uses current active channel.
    emitAgentEvent!({
      agentId: "claude",
      wireType: "cc",
      turnId: "turn-1",
      sessionId: "session-1",
      event: "text",
      content: "Late text",
    })

    // New turn binds to current channel (beta) and remains there after channel switch.
    emitAgentEvent!({
      agentId: "claude",
      wireType: "cc",
      turnId: "turn-2",
      sessionId: "session-1",
      event: "question",
      content: "Q2",
    })

    setCurrentChannel("public:gamma")

    emitAgentEvent!({
      agentId: "claude",
      wireType: "cc",
      turnId: "turn-2",
      sessionId: "session-1",
      event: "tool_call",
      content: "Edit(file-2)",
      toolName: "Edit",
    })

    expect(sent.map((entry) => entry.channel)).toEqual([
      "public:alpha", // turn-1 question binds alpha
      "public:alpha", // turn-1 tool_call stays alpha
      "public:alpha", // turn-1 result stays alpha
      "public:beta", // turn-1 post-result falls back to current
      "public:beta", // turn-2 question binds beta
      "public:beta", // turn-2 tool_call stays beta despite active channel now gamma
    ])

    expect(sent.map((entry) => entry.type)).toEqual([
      "cc",
      "cc",
      "cc",
      "cc",
      "cc",
      "cc",
    ])

    expect(sent[0].meta).toMatchObject({
      turn_id: "turn-1",
      session_id: "session-1",
      event: "question",
      tool_name: undefined,
      is_error: undefined,
    })

    expect(sent[2].meta).toMatchObject({
      turn_id: "turn-1",
      session_id: "session-1",
      event: "result",
      tool_name: undefined,
      is_error: false,
    })

    dispose()
  })
})

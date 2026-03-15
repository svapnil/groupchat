// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { afterEach, describe, expect, mock, test } from "bun:test"
import { createRoot, createSignal } from "solid-js"
import type { LocalAgentSessionEntry } from "../../src/agent/core/types"
import type { ConnectionStatus, Message } from "../../src/lib/types"

const respondCalls: string[] = []

mock.module("../../src/lib/runtime-capabilities", () => ({
  getRuntimeCapabilities: () => ({
    hasClaude: true,
    claudePath: "claude",
  }),
}))

mock.module("../../src/agent/core/local-agent-sessions", () => ({
  createLocalAgentSessions: (): LocalAgentSessionEntry[] => {
    const [isActive] = createSignal(true)
    const [isConnecting] = createSignal(false)
    const [messages] = createSignal<Message[]>([])
    const [pendingAction] = createSignal({
      requestId: "perm-1",
      title: "Bash",
      description: "Run Bash command",
      agentId: "claude",
      input: { command: "pwd" },
    })
    const [pendingActions] = createSignal([pendingAction()])

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
          pendingAction,
          pendingActions,
          respondToPendingAction: async (behavior) => {
            respondCalls.push(behavior)
          },
          findPendingActionMessageId: () => "claude-permission-1",
        },
      },
    ]
  },
}))

afterEach(() => {
  respondCalls.length = 0
  mock.restore()
})

describe("createChatViewBase pending permission keys", () => {
  test("stops propagation for allow/deny navigation and confirm", async () => {
    const { createChatViewBase } = await import("../../src/primitives/create-chat-view-base")

    const [baseMessages] = createSignal<Message[]>([])
    const [listHeight] = createSignal(20)
    const [connectionStatus] = createSignal<ConnectionStatus>("connected")
    const [username] = createSignal<string | null>("alice")
    const [channelManager] = createSignal(null as any)
    const [currentChannel] = createSignal<string | null>("public:alpha")

    let dispose = () => {}
    let base!: ReturnType<typeof createChatViewBase>
    createRoot((rootDispose) => {
      dispose = rootDispose
      base = createChatViewBase({
        baseMessages,
        listHeight,
        connectionStatus,
        username,
        channelManager,
        currentChannel,
      })
    })

    const downEvent = {
      name: "down",
      preventDefault: mock(() => {}),
      stopPropagation: mock(() => {}),
    }

    expect(base.pendingActionSelectedIndex()).toBe(0)
    expect(base.handleAgentKeys(downEvent)).toBe(true)
    expect(base.pendingActionSelectedIndex()).toBe(1)
    expect(downEvent.preventDefault).toHaveBeenCalledTimes(1)
    expect(downEvent.stopPropagation).toHaveBeenCalledTimes(1)

    const confirmEvent = {
      name: "return",
      preventDefault: mock(() => {}),
      stopPropagation: mock(() => {}),
    }

    expect(base.handleAgentKeys(confirmEvent)).toBe(true)
    await Promise.resolve()

    expect(respondCalls).toEqual(["deny"])
    expect(confirmEvent.preventDefault).toHaveBeenCalledTimes(1)
    expect(confirmEvent.stopPropagation).toHaveBeenCalledTimes(1)

    dispose()
  })
})

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { afterEach, describe, expect, mock, test } from "bun:test"
import { createRoot, createSignal } from "solid-js"
import type { AgentPendingAction, LocalAgentSessionEntry } from "../../src/agent/core/types"
import type { ConnectionStatus, Message } from "../../src/lib/types"

const respondCalls: number[] = []
const submitCalls: string[] = []
const cancelCalls: string[] = []
let pendingActionValue: AgentPendingAction = {
  requestId: "perm-1",
  title: "Bash",
  description: "Run Bash command",
  agentId: "claude",
  input: { command: "pwd" },
  choices: [
    { label: "Allow" },
    { label: "Deny" },
  ],
  helperText: "↑/↓ select action • Enter to confirm",
}

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
    const [pendingAction] = createSignal(pendingActionValue)
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
          respondToPendingAction: async (selectedIndex) => {
            respondCalls.push(selectedIndex)
          },
          submitPendingActionInput: async (value) => {
            submitCalls.push(value)
          },
          cancelPendingActionInput: () => {
            cancelCalls.push("cancelled")
          },
          findPendingActionMessageId: () => "claude-permission-1",
        },
      },
    ]
  },
}))

afterEach(() => {
  respondCalls.length = 0
  submitCalls.length = 0
  cancelCalls.length = 0
  pendingActionValue = {
    requestId: "perm-1",
    title: "Bash",
    description: "Run Bash command",
    agentId: "claude",
    input: { command: "pwd" },
    choices: [
      { label: "Allow" },
      { label: "Deny" },
    ],
    helperText: "↑/↓ select action • Enter to confirm",
  }
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

    expect(respondCalls).toEqual([1])
    expect(confirmEvent.preventDefault).toHaveBeenCalledTimes(1)
    expect(confirmEvent.stopPropagation).toHaveBeenCalledTimes(1)

    dispose()
  })

  test("routes typed input and escape to pending text-input actions", async () => {
    pendingActionValue = {
      requestId: "perm-ask",
      title: "Question",
      description: "Add context",
      agentId: "claude",
      input: {},
      helperText: "Type your answer and press Enter • Esc to go back",
      textInput: {
        placeholder: "Type your answer...",
        helperText: "Type your answer and press Enter • Esc to go back",
      },
    }

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

    expect(base.handleAgentKeys({ name: "a" } as any)).toBe(false)

    const send = base.wrapSendMessage(async () => {
      throw new Error("normal send should not run")
    })
    await send("custom response")
    expect(submitCalls).toEqual(["custom response"])

    const escapeEvent = {
      name: "escape",
      preventDefault: mock(() => {}),
      stopPropagation: mock(() => {}),
    }
    expect(base.handleAgentKeys(escapeEvent)).toBe(true)
    expect(cancelCalls).toEqual(["cancelled"])

    dispose()
  })
})

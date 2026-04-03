// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { afterEach, describe, expect, mock, test } from "bun:test"
import { createRoot, createSignal } from "solid-js"
import type { BashEventMetadata, ConnectionStatus, Message } from "../../src/lib/types"

const bashMessagesStarted: string[] = []

async function emitMockBashTimeline(
  message: string,
  sendEvent: (
    type: "bash_prompt" | "bash_output",
    content: string,
    metadata: BashEventMetadata,
  ) => Promise<unknown>,
) {
  const command = message.slice(1).trim()
  const commandId = `cmd:${command}`
  const cwd = `/tmp/${command.replace(/\s+/g, "-")}`

  await sendEvent("bash_prompt", command, {
    command_id: commandId,
    event: "prompt",
    cwd,
  })

  await sendEvent("bash_output", "", {
    command_id: commandId,
    event: "output",
    status: "running",
    cwd,
  })

  await sendEvent("bash_output", `${command}:done`, {
    command_id: commandId,
    event: "output",
    status: "completed",
    exit_code: 0,
    cwd,
  })
}

mock.module("../../src/bash/run-bash-command", () => ({
  startBashCommand: async (options: {
    message: string
    sendEvent: (
      type: "bash_prompt" | "bash_output",
      content: string,
      metadata: BashEventMetadata,
    ) => Promise<unknown>
  }) => {
    bashMessagesStarted.push(options.message)
    await emitMockBashTimeline(options.message, options.sendEvent)
    return true
  },
}))

mock.module("../../src/agent/core/local-agent-sessions", () => ({
  createLocalAgentSessions: () => [],
}))

afterEach(() => {
  bashMessagesStarted.length = 0
  mock.restore()
})

describe("createChatViewBase local bash handling", () => {
  test("keeps bash messages local instead of sending them to the backend", async () => {
    const { createChatViewBase } = await import("../../src/primitives/create-chat-view-base")

    const [baseMessages] = createSignal<Message[]>([])
    const [listHeight] = createSignal(20)
    const [connectionStatus] = createSignal<ConnectionStatus>("connected")
    const [username] = createSignal<string | null>("alice")
    const [currentChannel] = createSignal<string | null>("public:alpha")
    const manager = {
      sendBashEvent: mock(async () => ({ message_id: "should-not-send" })),
    }
    const [channelManager] = createSignal(manager as any)

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

    const normalSend = mock(async () => {})
    await base.wrapSendMessage(normalSend)("!echo hello")

    expect(bashMessagesStarted).toEqual(["!echo hello"])
    expect(normalSend).not.toHaveBeenCalled()
    expect(manager.sendBashEvent).not.toHaveBeenCalled()

    const messages = base.combinedMessages()
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      username: "alice",
      content: "echo hello:done",
      type: "bash_output",
      attributes: {
        bash: {
          command_id: "cmd:echo hello",
          event: "output",
          status: "completed",
          exit_code: 0,
          cwd: "/tmp/echo-hello",
          contents: ["echo hello", "echo hello:done"],
        },
      },
    })

    dispose()
  })

  test("stores local bash messages per channel", async () => {
    const { createChatViewBase } = await import("../../src/primitives/create-chat-view-base")

    const [baseMessages] = createSignal<Message[]>([])
    const [listHeight] = createSignal(20)
    const [connectionStatus] = createSignal<ConnectionStatus>("connected")
    const [username] = createSignal<string | null>("alice")
    const [currentChannel, setCurrentChannel] = createSignal<string | null>("public:alpha")
    const [channelManager] = createSignal(null as any)

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

    await base.wrapSendMessage(async () => {})("!pwd")
    expect(base.combinedMessages()).toHaveLength(1)

    setCurrentChannel("public:beta")
    expect(base.combinedMessages()).toHaveLength(0)

    setCurrentChannel("public:alpha")
    expect(base.combinedMessages()).toHaveLength(1)
    expect(base.combinedMessages()[0]?.content).toBe("pwd:done")

    dispose()
  })
})

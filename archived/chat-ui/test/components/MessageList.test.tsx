// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { afterEach, describe, expect, test } from "bun:test"
import { createSignal } from "solid-js"
import { testRender } from "@opentui/solid"
import type { Message } from "../../src/lib/types"
import { MessageList } from "../../src/components/MessageList"
import { condenseAgentMessages } from "../../src/agent/core/message-mutations"

let testSetup: Awaited<ReturnType<typeof testRender>> | null = null

afterEach(() => {
  if (testSetup) {
    testSetup.renderer.destroy()
    testSetup = null
  }
})

describe("MessageList", () => {
  test("renders empty state", async () => {
    testSetup = await testRender(
      () =>
        <MessageList
          messages={[]}
          currentUsername="alice"
          typingUsers={[]}
          height={10}
          isDetached={false}
        />,
      { width: 70, height: 12 },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()

    expect(frame).toContain("No messages yet. Say hello!")
    expect(frame).toMatchSnapshot()
  })

  test("renders messages and typing indicator", async () => {
    const messages: Message[] = [
      {
        id: "m1",
        type: "system",
        username: "system",
        content: "alice joined #general",
        timestamp: "2024-01-01T00:00:00.000Z",
      },
      {
        id: "m2",
        type: "system",
        username: "system",
        content: "bob joined #general",
        timestamp: "2024-01-01T00:01:00.000Z",
      },
    ]

    testSetup = await testRender(
      () =>
        <MessageList
          messages={messages}
          currentUsername="alice"
          typingUsers={["alice", "bob"]}
          height={10}
          isDetached={false}
        />,
      { width: 70, height: 12 },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()

    expect(frame).toContain("alice joined #general")
    expect(frame).toContain("bob is typing...")
    expect(frame).toMatchSnapshot()
  })

  test("renders detached indicator", async () => {
    const messages: Message[] = [
      {
        id: "m1",
        type: "system",
        username: "system",
        content: "detached sample",
        timestamp: "2024-01-01T00:00:00.000Z",
      },
    ]

    testSetup = await testRender(
      () =>
        <MessageList
          messages={messages}
          currentUsername="alice"
          typingUsers={["bob"]}
          height={10}
          isDetached
          detachedLines={5}
        />,
      { width: 70, height: 12 },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()

    expect(frame).toContain("5 lines below")
    expect(frame).toContain("Down to scroll")
    expect(frame).toMatchSnapshot()
  })

  test("updates the visible active permission option when selection changes", async () => {
    const message: Message = {
      id: "m-perm",
      username: "claude",
      content: "",
      timestamp: "2024-01-01T00:00:00.000Z",
      type: "claude-response",
      attributes: {
        claude: {
          parentToolUseId: null,
          contentBlocks: [],
          permissionRequest: {
            requestId: "req-1",
            toolName: "Read",
            toolUseId: "tool-1",
            input: { file_path: "/repo/file.ts" },
          },
        },
      },
    }

    const [selectedIndex, setSelectedIndex] = createSignal(0)

    testSetup = await testRender(
      () =>
        <MessageList
          messages={[message]}
          currentUsername="alice"
          typingUsers={[]}
          messagePaneWidth={80}
          height={10}
          isDetached={false}
          pendingActionMessageId="m-perm"
          pendingActionSelectedIndex={selectedIndex()}
        />,
      { width: 100, height: 14 },
    )

    await testSetup.renderOnce()
    let frame = testSetup.captureCharFrame()
    expect(frame).toContain("> Allow")

    setSelectedIndex(1)
    await Promise.resolve()
    await testSetup.renderOnce()

    frame = testSetup.captureCharFrame()
    expect(frame).toContain("> Deny")
    expect(frame).not.toContain("> Allow")
  })

  test("renders tool details only once when a permission message matches a tool block", async () => {
    const messages: Message[] = [
      {
        id: "m-tool",
        username: "claude",
        content: "",
        timestamp: "2024-01-01T00:00:00.000Z",
        type: "claude-response",
        attributes: {
          claude: {
            parentToolUseId: null,
            contentBlocks: [
              {
                type: "tool_use",
                id: "tool-bash-1",
                name: "Bash",
                input: { command: "echo hello", description: "Print hello" },
              },
            ],
          },
        },
      },
      {
        id: "m-perm",
        username: "claude",
        content: "",
        timestamp: "2024-01-01T00:00:01.000Z",
        type: "claude-response",
        attributes: {
          claude: {
            parentToolUseId: null,
            contentBlocks: [],
            permissionRequest: {
              requestId: "req-bash-1",
              toolName: "Bash",
              toolUseId: "tool-bash-1",
              description: "Print hello",
              input: { command: "echo hello", description: "Print hello" },
            },
          },
        },
      },
    ]

    testSetup = await testRender(
      () =>
        <MessageList
          messages={messages}
          currentUsername="alice"
          typingUsers={[]}
          messagePaneWidth={90}
          height={16}
          isDetached={false}
          pendingActionMessageId="m-perm"
          pendingActionSelectedIndex={0}
        />,
      { width: 110, height: 20 },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()

    expect(frame).toContain("Terminal")
    expect(frame).toContain("$ echo hello")
    expect(frame.match(/\$ echo hello/g)?.length ?? 0).toBe(1)
  })

  test("renders grouped bash prompt and running output", async () => {
    const messages = condenseAgentMessages([
      {
        id: "bash-prompt-1",
        username: "alice",
        content: "echo \"hello\"",
        timestamp: "2024-01-01T00:00:00.000Z",
        type: "bash_prompt",
        attributes: {
          bash: {
            command_id: "cmd-1",
            event: "prompt",
          },
        },
      },
      {
        id: "bash-output-1",
        username: "alice",
        content: "",
        timestamp: "2024-01-01T00:00:01.000Z",
        type: "bash_output",
        attributes: {
          bash: {
            command_id: "cmd-1",
            event: "output",
            status: "running",
          },
        },
      },
    ], "alice")

    testSetup = await testRender(
      () =>
        <MessageList
          messages={messages}
          currentUsername="alice"
          typingUsers={[]}
          messagePaneWidth={80}
          height={10}
          isDetached={false}
        />,
      { width: 100, height: 14 },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()

    expect(messages).toHaveLength(1)
    expect(frame).toContain("! echo \"hello\"")
    expect(frame).toContain("Running..")
  })

  test("replaces running bash output with the final output", async () => {
    const messages = condenseAgentMessages([
      {
        id: "bash-prompt-2",
        username: "alice",
        content: "echo \"hello\"",
        timestamp: "2024-01-01T00:00:00.000Z",
        type: "bash_prompt",
        attributes: {
          bash: {
            command_id: "cmd-2",
            event: "prompt",
          },
        },
      },
      {
        id: "bash-output-running-2",
        username: "alice",
        content: "",
        timestamp: "2024-01-01T00:00:01.000Z",
        type: "bash_output",
        attributes: {
          bash: {
            command_id: "cmd-2",
            event: "output",
            status: "running",
          },
        },
      },
      {
        id: "bash-output-final-2",
        username: "alice",
        content: "hello",
        timestamp: "2024-01-01T00:00:02.000Z",
        type: "bash_output",
        attributes: {
          bash: {
            command_id: "cmd-2",
            event: "output",
            status: "completed",
            exit_code: 0,
          },
        },
      },
    ], "alice")

    testSetup = await testRender(
      () =>
        <MessageList
          messages={messages}
          currentUsername="alice"
          typingUsers={[]}
          messagePaneWidth={80}
          height={10}
          isDetached={false}
        />,
      { width: 100, height: 14 },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()

    expect(messages).toHaveLength(1)
    expect(frame).toContain("! echo \"hello\"")
    expect(frame).toContain("⎿ hello")
    expect(frame).not.toContain("Running..")
  })
})

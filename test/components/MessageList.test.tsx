// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { afterEach, describe, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import type { Message } from "../../src/lib/types"
import { MessageList } from "../../src/components/MessageList"

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
})

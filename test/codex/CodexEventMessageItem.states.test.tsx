// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { afterEach, describe, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import type { Message } from "../../src/lib/types"
import { CodexEventMessageItem } from "../../src/agent/codex/components/CodexEventMessageItem"

let testSetup: Awaited<ReturnType<typeof testRender>> | null = null
const originalDateNow = Date.now

async function renderCodexEvent(
  message: Message,
  props?: { isOwnMessage?: boolean; messagePaneWidth?: number; width?: number; height?: number },
): Promise<string> {
  if (testSetup) {
    testSetup.renderer.destroy()
    testSetup = null
  }

  testSetup = await testRender(
    () => (
      <CodexEventMessageItem
        message={message}
        isOwnMessage={props?.isOwnMessage}
        messagePaneWidth={props?.messagePaneWidth}
      />
    ),
    { width: props?.width ?? 130, height: props?.height ?? 26 },
  )
  await testSetup.renderOnce()
  return testSetup.captureCharFrame()
}

function makeCxMessage(id: string, cx: Record<string, unknown>, content = ""): Message {
  return {
    id,
    username: "alice",
    content,
    timestamp: "2024-01-01T00:00:00.000Z",
    type: "cx",
    attributes: {
      cx: cx as any,
    },
  }
}

afterEach(() => {
  Date.now = originalDateNow
  if (testSetup) {
    testSetup.renderer.destroy()
    testSetup = null
  }
})

describe("CodexEventMessageItem edge states", () => {
  test("renders shimmered reasoning status before result", async () => {
    Date.now = () => new Date("2024-01-01T00:00:05.000Z").getTime()
    const message = makeCxMessage("working", {
      turn_id: "turn-1",
      event: "tool_call",
      events: [
        { turn_id: "turn-1", event: "question" },
        { turn_id: "turn-1", event: "tool_call", tool_name: "Read" },
      ],
      contents: [
        "Inspect file",
        "Read(/repo/file.ts)",
      ],
    })

    const frame = await renderCodexEvent(message, { messagePaneWidth: 110 })
    expect(frame).toContain("Inspect file")
    expect(frame).toContain("Read(/repo/file.ts)")
    expect(frame).toContain("Reasoning...")
    expect(frame).not.toContain("░")
    expect(frame).not.toContain("▒")
    expect(frame).not.toContain("▓")
  })
})

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { afterEach, describe, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import type { Message } from "../../src/lib/types"
import { ClaudeEventMessageItem } from "../../src/agent/claude/components/ClaudeEventMessageItem"

let testSetup: Awaited<ReturnType<typeof testRender>> | null = null
const originalDateNow = Date.now

async function renderClaudeEvent(
  message: Message,
  props?: { isOwnMessage?: boolean; messagePaneWidth?: number; width?: number; height?: number },
): Promise<string> {
  if (testSetup) {
    testSetup.renderer.destroy()
    testSetup = null
  }

  testSetup = await testRender(
    () => (
      <ClaudeEventMessageItem
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

function makeCcMessage(id: string, cc: Record<string, unknown>, content = ""): Message {
  return {
    id,
    username: "alice",
    content,
    timestamp: "2024-01-01T00:00:00.000Z",
    type: "cc",
    attributes: {
      cc: cc as any,
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

describe("ClaudeEventMessageItem edge states", () => {
  test("renders own cc messages as local prompt lines", async () => {
    const message = makeCcMessage(
      "own-cc",
      {
        turn_id: "turn-own",
        event: "question",
      },
      "Own Claude prompt line",
    )

    const frame = await renderClaudeEvent(message, { isOwnMessage: true, messagePaneWidth: 100 })
    expect(frame).toContain("Own Claude prompt line")
    expect(frame).toContain("alice")
    expect(frame).toContain("→")
  })

  test("renders in-progress thinking state before result", async () => {
    Date.now = () => new Date("2024-01-01T00:00:05.000Z").getTime()
    const message = makeCcMessage("working", {
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

    const frame = await renderClaudeEvent(message, { messagePaneWidth: 110 })
    expect(frame).toContain("Inspect file")
    expect(frame).toContain("Read(/repo/file.ts)")
    expect(frame).toContain("Thinking...")
  })

  test("renders error result summary for failed turns", async () => {
    Date.now = () => new Date("2024-01-01T00:00:07.000Z").getTime()
    const message = makeCcMessage("error-result", {
      turn_id: "turn-err",
      event: "result",
      events: [
        { turn_id: "turn-err", event: "question" },
        { turn_id: "turn-err", event: "text" },
        { turn_id: "turn-err", event: "result", is_error: true },
      ],
      contents: [
        "Run migration",
        "Migration failed with conflict",
        "",
      ],
    })

    const frame = await renderClaudeEvent(message, { messagePaneWidth: 110 })
    expect(frame).toContain("Migration failed with conflict")
    expect(frame).toContain("finished with error")
  })

  test("renders streamed thinking preview with live token stats", async () => {
    Date.now = () => new Date("2024-01-01T00:00:07.000Z").getTime()
    const message = makeCcMessage("thinking-live", {
      turn_id: "turn-thinking",
      event: "thinking",
      events: [
        { turn_id: "turn-thinking", event: "question" },
        { turn_id: "turn-thinking", event: "thinking", output_tokens: 128 },
      ],
      contents: [
        "Plan the next steps",
        "Planning tool calls and response structure",
      ],
    })

    const frame = await renderClaudeEvent(message, { messagePaneWidth: 110 })
    expect(frame).toContain("Plan the next steps")
    expect(frame).toContain("Planning tool calls and response structure")
    expect(frame).toContain("128 tok")
    expect(frame).toContain("Thinking...")
  })

  test("renders live tool progress detail below the latest tool call", async () => {
    const message = makeCcMessage("tool-progress", {
      turn_id: "turn-progress",
      event: "tool_progress",
      events: [
        { turn_id: "turn-progress", event: "question" },
        { turn_id: "turn-progress", event: "tool_call", tool_name: "Read" },
        { turn_id: "turn-progress", event: "tool_progress", tool_name: "Read", tool_use_id: "tool-read-1", elapsed_seconds: 1.2 },
      ],
      contents: [
        "Inspect file",
        "Read(/repo/file.ts)",
        "Read running (1.2s)",
      ],
    })

    const frame = await renderClaudeEvent(message, { messagePaneWidth: 110 })
    expect(frame).toContain("Read(/repo/file.ts)")
    expect(frame).toContain("Read running (1.2s)")
  })

  test("renders multi-tool count and avoids duplicate tool-name prefixes", async () => {
    const message = makeCcMessage("tools-dedupe", {
      turn_id: "turn-tools",
      event: "result",
      events: [
        { turn_id: "turn-tools", event: "question" },
        { turn_id: "turn-tools", event: "tool_call", tool_name: "Read" },
        { turn_id: "turn-tools", event: "tool_call", tool_name: "WebSearch" },
        { turn_id: "turn-tools", event: "text" },
        { turn_id: "turn-tools", event: "result", is_error: false },
      ],
      contents: [
        "Collect references",
        "Read(/repo/a.ts)",
        "WebSearch(latest updates)",
        "Done",
        "",
      ],
    })

    const frame = await renderClaudeEvent(message, { messagePaneWidth: 110 })
    expect(frame).toContain("1 tools used")
    expect(frame).toContain("WebSearch(latest updates)")
    expect(frame).not.toContain("WebSearch WebSearch(latest updates)")
  })

  test("normalizes malformed cc timeline arrays safely", async () => {
    const message = makeCcMessage("malformed", {
      turn_id: "turn-malformed",
      event: "text",
      events: [
        { turn_id: "turn-malformed", event: "question" },
        { event: "tool_call", tool_name: "Read" },
        { turn_id: "turn-malformed", event: "text" },
      ],
      contents: [
        "Safe question",
        "Safe answer",
        "SHOULD_NOT_RENDER",
      ],
    })

    const frame = await renderClaudeEvent(message, { messagePaneWidth: 100 })
    expect(frame).toContain("Safe question")
    expect(frame).toContain("Safe answer")
    expect(frame).not.toContain("SHOULD_NOT_RENDER")
    expect(frame).not.toContain("undefined")
  })
})

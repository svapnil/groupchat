// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { afterEach, describe, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import type { Message } from "../../src/lib/types"
import { ClaudeEventMessageItem } from "../../src/agent/claude/components/ClaudeEventMessageItem"

let testSetup: Awaited<ReturnType<typeof testRender>> | null = null

afterEach(() => {
  if (testSetup) {
    testSetup.renderer.destroy()
    testSetup = null
  }
})

describe("ClaudeEventMessageItem", () => {
  test("renders markdown tables from cc text events", async () => {
    const message: Message = {
      id: "cc1",
      username: "alice",
      content: "",
      timestamp: "2024-01-01T00:00:00.000Z",
      type: "cc",
      attributes: {
        cc: {
          turn_id: "turn-1",
          event: "text",
          events: [
            { turn_id: "turn-1", event: "question" },
            { turn_id: "turn-1", event: "text" },
          ],
          contents: [
            "Show me a score table",
            "| Name | Score |\n| --- | ---: |\n| Alice | 7 |\n| Bob | 12 |",
          ],
        },
      },
    }

    testSetup = await testRender(
      () => <ClaudeEventMessageItem message={message} messagePaneWidth={100} />,
      { width: 120, height: 22 },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()

    expect(frame).toContain("Name")
    expect(frame).toContain("Score")
    expect(frame).toContain("Alice")
    expect(frame).toContain("┬")
    expect(frame).toContain("┴")
  })

  test("renders safe clickable GitHub links for cc messages", async () => {
    const message: Message = {
      id: "cc2",
      username: "alice",
      content: "",
      timestamp: "2024-01-01T00:00:00.000Z",
      type: "cc",
      attributes: {
        cc: {
          turn_id: "turn-2",
          event: "text",
          events: [
            { turn_id: "turn-2", event: "question" },
            { turn_id: "turn-2", event: "text" },
          ],
          contents: [
            "Share references",
            "Use [OpenAI Python](https://GitHub.com/openai/openai-python) and <https://github.com/openai/openai-node>.",
          ],
        },
      },
    }

    testSetup = await testRender(
      () => <ClaudeEventMessageItem message={message} messagePaneWidth={110} />,
      { width: 130, height: 22 },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()

    expect(frame).toContain("OpenAI Python")
    expect(frame).toContain("https://github.com/openai/openai-node")
    expect(frame).not.toContain("GitHub.com")
    expect(frame).not.toContain("https&#58;")
  })
})

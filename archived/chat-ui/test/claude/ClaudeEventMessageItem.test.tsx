// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { afterEach, describe, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import type { Message } from "../../src/lib/types"
import { ClaudeEventMessageItem } from "../../src/agent/claude/components/ClaudeEventMessageItem"

let testSetup: Awaited<ReturnType<typeof testRender>> | null = null
const originalDateNow = Date.now

afterEach(() => {
  Date.now = originalDateNow
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

  test("renders a full aggregated cc turn timeline snapshot", async () => {
    Date.now = () => new Date("2024-01-01T00:00:15.000Z").getTime()

    const message: Message = {
      id: "cc3",
      username: "alice",
      content: "",
      timestamp: "2024-01-01T00:00:00.000Z",
      type: "cc",
      attributes: {
        cc: {
          turn_id: "turn-3",
          event: "result",
          events: [
            { turn_id: "turn-3", event: "question" },
            { turn_id: "turn-3", event: "tool_call", tool_name: "Read" },
            { turn_id: "turn-3", event: "text" },
            { turn_id: "turn-3", event: "result", is_error: false },
          ],
          contents: [
            "Summarize the README",
            "Read(/repo/README.md)",
            "Summary line one.\n\n- item A\n- item B",
            "",
          ],
        },
      },
    }

    testSetup = await testRender(
      () => <ClaudeEventMessageItem message={message} messagePaneWidth={110} />,
      { width: 130, height: 24 },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()
    const normalized = frame.replace(/\d{2}:\d{2} [AP]M/g, "<TIME>")

    expect(normalized).toContain("Summarize the README")
    expect(normalized).toContain("Read(/repo/README.md)")
    expect(normalized).toContain("Summary line one.")
    expect(normalized).toContain("finished")
    expect(normalized).toContain("(1 turns • 15.0s)")
    expect(normalized).toMatchSnapshot()
  })

  test("renders latest-turn details when multiple turns are aggregated in one session message", async () => {
    Date.now = () => new Date("2024-01-01T00:00:20.000Z").getTime()

    const message: Message = {
      id: "cc4",
      username: "alice",
      content: "",
      timestamp: "2024-01-01T00:00:00.000Z",
      type: "cc",
      attributes: {
        cc: {
          turn_id: "turn-2",
          session_id: "session-1",
          event: "result",
          events: [
            { turn_id: "turn-1", session_id: "session-1", event: "question" },
            { turn_id: "turn-1", session_id: "session-1", event: "tool_call", tool_name: "Read" },
            { turn_id: "turn-1", session_id: "session-1", event: "text" },
            { turn_id: "turn-1", session_id: "session-1", event: "result", is_error: false },
            { turn_id: "turn-2", session_id: "session-1", event: "question" },
            { turn_id: "turn-2", session_id: "session-1", event: "tool_call", tool_name: "Edit" },
            { turn_id: "turn-2", session_id: "session-1", event: "text" },
            { turn_id: "turn-2", session_id: "session-1", event: "result", is_error: false },
          ],
          contents: [
            "First question",
            "Read(/repo/file-1.ts)",
            "First answer should stay hidden from latest output pane",
            "",
            "Second question",
            "Edit(/repo/file-2.ts)",
            "Second answer is visible",
            "",
          ],
        },
      },
    }

    testSetup = await testRender(
      () => <ClaudeEventMessageItem message={message} messagePaneWidth={110} />,
      { width: 140, height: 28 },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()
    const normalized = frame.replace(/\d{2}:\d{2} [AP]M/g, "<TIME>")

    // Question list contains all question events.
    expect(normalized).toContain("First question")
    expect(normalized).toContain("Second question")

    // Tool/text/result details are from the latest turn only.
    expect(normalized).toContain("Edit(/repo/file-2.ts)")
    expect(normalized).toContain("Second answer is visible")
    expect(normalized).not.toContain("First answer should stay hidden from latest output pane")
    expect(normalized).toContain("(2 turns • 20.0s)")

    expect(normalized).toMatchSnapshot()
  })
})

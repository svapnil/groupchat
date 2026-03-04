// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { afterEach, describe, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import type { Message } from "../../src/lib/types"
import { ClaudeMessageItem } from "../../src/agent/claude/components/ClaudeMessageItem"

let testSetup: Awaited<ReturnType<typeof testRender>> | null = null

async function renderClaudeMessage(
  message: Message,
  props?: { claudeDepth?: number; permissionSelectedIndex?: number; width?: number; height?: number },
): Promise<string> {
  if (testSetup) {
    testSetup.renderer.destroy()
    testSetup = null
  }

  testSetup = await testRender(
    () => (
      <ClaudeMessageItem
        message={message}
        claudeDepth={props?.claudeDepth}
        permissionSelectedIndex={props?.permissionSelectedIndex}
      />
    ),
    { width: props?.width ?? 120, height: props?.height ?? 24 },
  )
  await testSetup.renderOnce()
  return testSetup.captureCharFrame()
}

function makeClaudeMessage(id: string, claude: Record<string, unknown>, content = ""): Message {
  return {
    id,
    username: "claude",
    content,
    timestamp: "2024-01-01T00:00:00.000Z",
    type: "claude-response",
    attributes: {
      claude: claude as any,
    },
  }
}

afterEach(() => {
  if (testSetup) {
    testSetup.renderer.destroy()
    testSetup = null
  }
})

describe("ClaudeMessageItem render states", () => {
  test("renders grouped tool-use one-liners", async () => {
    const message = makeClaudeMessage("tool-groups", {
      parentToolUseId: null,
      contentBlocks: [
        { type: "tool_use", id: "read-1", name: "Read", input: { file_path: "/repo/a.ts" } },
        { type: "tool_use", id: "read-2", name: "Read", input: { file_path: "/repo/b.ts" } },
        { type: "tool_use", id: "bash-1", name: "Bash", input: { command: "pwd" } },
        { type: "tool_use", id: "bash-2", name: "Bash", input: { command: "ls -la" } },
      ],
    })

    const frame = await renderClaudeMessage(message)
    expect(frame).toContain("Read 2 files")
    expect(frame).toContain("Bash (2 commands)")
  })

  test("renders tool results for success and error", async () => {
    const message = makeClaudeMessage("tool-results", {
      parentToolUseId: null,
      contentBlocks: [
        { type: "tool_result", tool_use_id: "read-1", content: "ok output", is_error: false },
        { type: "tool_result", tool_use_id: "edit-1", content: "permission denied", is_error: true },
      ],
    })

    const frame = await renderClaudeMessage(message)
    expect(frame).toContain("Result")
    expect(frame).toContain("ok output")
    expect(frame).toContain("Error")
    expect(frame).toContain("permission denied")
  })

  test("renders unresolved permission selector", async () => {
    const message = makeClaudeMessage("permission-open", {
      parentToolUseId: null,
      contentBlocks: [],
      permissionRequest: {
        requestId: "req-1",
        toolName: "Read",
        toolUseId: "tool-1",
        description: "Read file",
        input: { file_path: "/repo/file.ts" },
      },
    })

    const frame = await renderClaudeMessage(message, { permissionSelectedIndex: 1 })
    expect(frame).toContain("Allow")
    expect(frame).toContain("Deny")
    expect(frame).toContain("Enter to confirm")
    expect(frame).toContain("> Deny")
  })

  test("renders resolved permission statuses", async () => {
    const allowed = makeClaudeMessage("permission-allowed", {
      parentToolUseId: null,
      contentBlocks: [],
      permissionRequest: {
        requestId: "req-a",
        toolName: "Read",
        toolUseId: "tool-a",
        input: { file_path: "/repo/a.ts" },
        resolution: "allowed",
      },
    })
    const denied = makeClaudeMessage("permission-denied", {
      parentToolUseId: null,
      contentBlocks: [],
      permissionRequest: {
        requestId: "req-d",
        toolName: "Read",
        toolUseId: "tool-d",
        input: { file_path: "/repo/d.ts" },
        resolution: "denied",
      },
    })
    const cancelled = makeClaudeMessage("permission-cancelled", {
      parentToolUseId: null,
      contentBlocks: [],
      permissionRequest: {
        requestId: "req-c",
        toolName: "Read",
        toolUseId: "tool-c",
        input: { file_path: "/repo/c.ts" },
        resolution: "cancelled",
      },
    })

    expect(await renderClaudeMessage(allowed)).toContain("Allowed")
    expect(await renderClaudeMessage(denied)).toContain("Denied")
    expect(await renderClaudeMessage(cancelled)).toContain("Cancelled by Claude")
  })

  test("renders interrupted marker", async () => {
    const message = makeClaudeMessage("interrupted", {
      parentToolUseId: null,
      contentBlocks: [{ type: "text", text: "Stopped" }],
      interrupted: true,
    })

    const frame = await renderClaudeMessage(message)
    expect(frame).toContain("Interrupted")
  })

  test("renders thinking and streaming indicators", async () => {
    const thinking = makeClaudeMessage("thinking", {
      parentToolUseId: null,
      contentBlocks: [],
      thinking: true,
    })
    const streaming = makeClaudeMessage("streaming", {
      parentToolUseId: null,
      contentBlocks: [{ type: "text", text: "partial" }],
      streaming: true,
      thinking: false,
    })

    expect(await renderClaudeMessage(thinking)).toContain("Thinking...")
    expect(await renderClaudeMessage(streaming)).toContain("▍")
  })

  test("applies indentation for deeper claude depth", async () => {
    const message = makeClaudeMessage("depth", {
      parentToolUseId: null,
      contentBlocks: [{ type: "text", text: "depth-check-line" }],
    })

    const shallow = await renderClaudeMessage(message, { claudeDepth: 0, width: 90, height: 10 })
    const deep = await renderClaudeMessage(message, { claudeDepth: 4, width: 90, height: 10 })

    const shallowLine = shallow.split("\n").find((line) => line.includes("depth-check-line")) || ""
    const deepLine = deep.split("\n").find((line) => line.includes("depth-check-line")) || ""
    expect(shallowLine.length).toBeGreaterThan(0)
    expect(deepLine.length).toBeGreaterThan(0)
    expect(deepLine.indexOf("depth-check-line")).toBeGreaterThan(shallowLine.indexOf("depth-check-line"))
  })
})

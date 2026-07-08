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

  test("renders rich edit permission details", async () => {
    const message = makeClaudeMessage("permission-edit", {
      parentToolUseId: null,
      contentBlocks: [],
      permissionRequest: {
        requestId: "req-edit",
        toolName: "Edit",
        toolUseId: "tool-edit",
        description: "Update the config snippet",
        input: {
          file_path: "/repo/src/config.ts",
          old_string: "let ready = false;",
          new_string: "let ready = true;",
          replace_all: true,
        },
      },
    })

    const frame = await renderClaudeMessage(message, { width: 100, height: 22 })
    expect(frame).toContain("replace all")
    expect(frame).toContain("config.ts")
    expect(frame).toContain("ready = false")
    expect(frame).toContain("ready = true")
    expect(frame).toContain("Allow")
    expect(frame).toContain("Deny")
  })

  test("renders ask-user-question progress and selectable answers", async () => {
    const message = makeClaudeMessage("permission-question", {
      parentToolUseId: null,
      contentBlocks: [],
      permissionRequest: {
        requestId: "req-question",
        toolName: "AskUserQuestion",
        toolUseId: "tool-question",
        input: {
          questions: [
            {
              header: "Database",
              question: "Which database should we use?",
              options: [{ label: "SQLite", description: "Simple local setup" }],
            },
            {
              header: "Cache",
              question: "Should we add caching?",
              options: [
                { label: "Yes", description: "Add a cache layer" },
                { label: "No", description: "Keep it simple" },
              ],
            },
          ],
        },
        askUserQuestion: {
          questions: [
            {
              header: "Database",
              question: "Which database should we use?",
              options: [{ label: "SQLite", description: "Simple local setup" }],
            },
            {
              header: "Cache",
              question: "Should we add caching?",
              options: [
                { label: "Yes", description: "Add a cache layer" },
                { label: "No", description: "Keep it simple" },
              ],
            },
          ],
          answers: { "0": "SQLite" },
          activeQuestionIndex: 1,
        },
      },
    })

    const frame = await renderClaudeMessage(message, { permissionSelectedIndex: 1, width: 100, height: 24 })
    expect(frame).toContain("Question")
    expect(frame).toContain("Database: SQLite")
    expect(frame).toContain("Should we add caching?")
    expect(frame).toContain("Add a cache layer")
    expect(frame).toContain("> No")
    expect(frame).toContain("Enter to submit")
  })

  test("renders ask-user-question custom input state", async () => {
    const message = makeClaudeMessage("permission-question-custom", {
      parentToolUseId: null,
      contentBlocks: [],
      permissionRequest: {
        requestId: "req-question-custom",
        toolName: "AskUserQuestion",
        toolUseId: "tool-question-custom",
        input: {
          questions: [
            {
              header: "Context",
              question: "Add extra context",
              options: [{ label: "None", description: "No extra context" }],
            },
          ],
        },
        askUserQuestion: {
          questions: [
            {
              header: "Context",
              question: "Add extra context",
              options: [{ label: "None", description: "No extra context" }],
              allowCustomInput: true,
            },
          ],
          answers: {},
          activeQuestionIndex: 0,
          customInputQuestionIndex: 0,
        },
      },
    })

    const frame = await renderClaudeMessage(message, { width: 100, height: 20 })
    expect(frame).toContain("Add extra context")
    expect(frame).toContain("Type your answer in the input box below")
    expect(frame).toContain("Esc to go back")
  })

  test("renders permission suggestions alongside allow and deny", async () => {
    const message = makeClaudeMessage("permission-suggestions", {
      parentToolUseId: null,
      contentBlocks: [],
      permissionRequest: {
        requestId: "req-suggestions",
        toolName: "Bash",
        toolUseId: "tool-suggestions",
        input: { command: "ls -la" },
        permissionSuggestions: [
          {
            type: "addRules",
            rules: [{ toolName: "Bash" }],
            behavior: "allow",
            destination: "session",
          },
        ],
      },
    })

    const frame = await renderClaudeMessage(message, { permissionSelectedIndex: 1, width: 100, height: 20 })
    expect(frame).toContain("Allow")
    expect(frame).toContain("Allow Bash for session")
    expect(frame).toContain("Deny")
    expect(frame).toContain("> Allow Bash for session")
  })

  test("renders exit-plan-mode permission details", async () => {
    const message = makeClaudeMessage("permission-plan", {
      parentToolUseId: null,
      contentBlocks: [],
      permissionRequest: {
        requestId: "req-plan",
        toolName: "ExitPlanMode",
        toolUseId: "tool-plan",
        input: {
          plan: "## Step 1\nRun tests",
          allowedPrompts: [
            { tool: "Bash", prompt: "Run tests" },
            { tool: "Edit", prompt: "Fix typo" },
          ],
        },
      },
    })

    const frame = await renderClaudeMessage(message, { width: 100, height: 24 })
    expect(frame).toContain("Plan")
    expect(frame).toContain("Step 1")
    expect(frame).toContain("Requested permissions")
    expect(frame).toContain("Run tests")
    expect(frame).toContain("Fix typo")
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

    const thinkingFrame = await renderClaudeMessage(thinking)
    expect(thinkingFrame).toContain("Thinking...")
    expect(thinkingFrame).toContain("◐")
    expect(await renderClaudeMessage(streaming)).toContain("partial")
  })

  test("renders bash tool results as tailed terminal output", async () => {
    const output = Array.from({ length: 25 }, (_, index) => `line-${index + 1}`).join("\n")
    const message = makeClaudeMessage("bash-result", {
      parentToolUseId: null,
      contentBlocks: [
        { type: "tool_use", id: "tool-bash", name: "Bash", input: { command: "cat big.log" } },
        { type: "tool_result", tool_use_id: "tool-bash", content: output },
      ],
    })

    const frame = await renderClaudeMessage(message, { width: 100, height: 28 })
    const renderedLines = frame.split("\n").map((line) => line.trim())
    expect(frame).toContain("Terminal Output (last 20 lines)")
    expect(renderedLines.includes("line-1")).toBe(false)
    expect(frame).toContain("line-25")
    expect(frame).toContain("5 earlier lines omitted")
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

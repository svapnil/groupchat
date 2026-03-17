// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { afterEach, describe, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import type { Message } from "../../src/lib/types"
import { ClaudeMessageItem } from "../../src/agent/claude/components/ClaudeMessageItem"

let testSetup: Awaited<ReturnType<typeof testRender>> | null = null

async function renderClaudeMessage(message: Message, width = 100, height = 24): Promise<string> {
  if (testSetup) {
    testSetup.renderer.destroy()
    testSetup = null
  }

  testSetup = await testRender(
    () => <ClaudeMessageItem message={message} />,
    { width, height },
  )

  await testSetup.renderOnce()
  await testSetup.renderOnce()
  return testSetup.captureCharFrame()
}

afterEach(() => {
  if (testSetup) {
    testSetup.renderer.destroy()
    testSetup = null
  }
})

describe("ClaudeMessageItem", () => {
  test("renders markdown tables with native markdown renderable", async () => {
    const message: Message = {
      id: "m1",
      username: "claude",
      content: "",
      timestamp: "2024-01-01T00:00:00.000Z",
      type: "claude-response",
      attributes: {
        claude: {
          parentToolUseId: null,
          contentBlocks: [
            {
              type: "text",
              text: "| Name | Score |\n| --- | ---: |\n| Alice | 7 |\n| Bob | 12 |",
            },
          ],
        },
      },
    }

    const frame = await renderClaudeMessage(message, 80, 20)

    expect(frame).toContain("Name")
    expect(frame).toContain("Score")
    expect(frame).toContain("Alice")
    expect(frame).toContain("┬")
    expect(frame).toContain("│───────│")
    expect(frame).toContain("┴")
  })

  test("renders GitHub links as visible safe markdown output", async () => {
    const message: Message = {
      id: "m2",
      username: "claude",
      content: "",
      timestamp: "2024-01-01T00:00:00.000Z",
      type: "claude-response",
      attributes: {
        claude: {
          parentToolUseId: null,
          contentBlocks: [
            {
              type: "text",
              text: "Use [OpenAI Node](https://GitHub.com/openai/openai-node) and <https://github.com/openai/openai-python>.",
            },
          ],
        },
      },
    }

    const frame = await renderClaudeMessage(message, 120, 20)

    expect(frame).toContain("OpenAI Node")
    expect(frame).toContain("github.com/openai/openai-node")
    expect(frame).toContain("github.com/openai/openai-python")
    expect(frame).not.toContain("GitHub.com")
    expect(frame).not.toContain("https://github.com/openai/openai-python")
  })

  test("renders edit tool calls as inline diffs", async () => {
    const message: Message = {
      id: "m3",
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
              id: "tool-edit-1",
              name: "Edit",
              input: {
                file_path: "/repo/src/config/app.ts",
                old_string: "const retries = 1;\nconst enabled = false;",
                new_string: "const retries = 2;\nconst enabled = true;",
                replace_all: true,
              },
            },
          ],
        },
      },
    }

    const frame = await renderClaudeMessage(message, 100, 22)

    expect(frame).toContain("Edit File")
    expect(frame).toContain("replace all")
    expect(frame).toContain("config/app.ts")
    expect(frame).toContain("retries = 1")
    expect(frame).toContain("retries = 2")
    expect(frame).toMatchSnapshot()
  })

  test("renders write tool calls as inline code blocks", async () => {
    const message: Message = {
      id: "m4",
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
              id: "tool-write-1",
              name: "Write",
              input: {
                file_path: "/repo/src/generated/config.ts",
                content: "export const featureFlag = true;\nexport const retries = 3;",
              },
            },
          ],
        },
      },
    }

    const frame = await renderClaudeMessage(message, 100, 20)

    expect(frame).toContain("Write File")
    expect(frame).toContain("generated/config.ts")
    expect(frame).toContain("featureFlag")
    expect(frame).toContain("retries = 3")
    expect(frame).toMatchSnapshot()
  })
})

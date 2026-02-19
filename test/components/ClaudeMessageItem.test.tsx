import { afterEach, describe, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import type { Message } from "../../src/lib/types"
import { ClaudeMessageItem } from "../../src/components/ClaudeMessageItem"

let testSetup: Awaited<ReturnType<typeof testRender>> | null = null

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

    testSetup = await testRender(
      () => <ClaudeMessageItem message={message} />,
      { width: 80, height: 20 },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()

    expect(frame).toContain("Name")
    expect(frame).toContain("Score")
    expect(frame).toContain("Alice")
    expect(frame).toContain("┬")
    expect(frame).toContain("│───────│")
    expect(frame).toContain("┴")
  })
})

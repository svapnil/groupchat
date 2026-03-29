// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { afterEach, describe, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import type { Message } from "../../src/lib/types"
import { CodexMessageItem } from "../../src/agent/codex/components/CodexMessageItem"

let testSetup: Awaited<ReturnType<typeof testRender>> | null = null

async function renderCodexMessage(
  message: Message,
  props?: { codexDepth?: number; width?: number; height?: number },
): Promise<string> {
  if (testSetup) {
    testSetup.renderer.destroy()
    testSetup = null
  }

  testSetup = await testRender(
    () => (
      <CodexMessageItem
        message={message}
        codexDepth={props?.codexDepth}
      />
    ),
    { width: props?.width ?? 120, height: props?.height ?? 24 },
  )
  await testSetup.renderOnce()
  return testSetup.captureCharFrame()
}

function makeCodexMessage(id: string, codex: Record<string, unknown>, content = ""): Message {
  return {
    id,
    username: "codex",
    content,
    timestamp: "2024-01-01T00:00:00.000Z",
    type: "codex-response",
    attributes: {
      codex: codex as any,
    },
  }
}

afterEach(() => {
  if (testSetup) {
    testSetup.renderer.destroy()
    testSetup = null
  }
})

describe("CodexMessageItem render states", () => {
  test("renders shimmered reasoning indicator while thinking", async () => {
    const message = makeCodexMessage("thinking", {
      parentToolUseId: null,
      contentBlocks: [],
      thinking: true,
    })

    const frame = await renderCodexMessage(message)
    expect(frame).toContain("Reasoning...")
    expect(frame).not.toContain("░")
    expect(frame).not.toContain("▒")
    expect(frame).not.toContain("▓")
    expect(frame).toContain("(0s)")
  })
})

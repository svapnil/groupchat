// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { afterEach, describe, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { CodexThinkingIndicator } from "../../src/agent/codex/components/CodexThinkingIndicator"

let testSetup: Awaited<ReturnType<typeof testRender>> | null = null

afterEach(() => {
  if (testSetup) {
    testSetup.renderer.destroy()
    testSetup = null
  }
})

describe("CodexThinkingIndicator", () => {
  test("uses a greyscale shimmer palette after the animation advances", async () => {
    const label = "Reasoning..."

    testSetup = await testRender(
      () => <CodexThinkingIndicator label={label} summary="0s" />,
      { width: 40, height: 5 },
    )

    await testSetup.renderOnce()
    await new Promise((resolve) => setTimeout(resolve, 450))
    await testSetup.renderOnce()

    const spans = testSetup.captureSpans().lines[0]?.spans ?? []
    let consumed = 0
    const labelColors = new Set<string>()

    for (const span of spans) {
      if (consumed >= label.length) break
      const take = Math.min(span.text.length, label.length - consumed)
      if (take > 0) {
        const [r, g, b] = span.fg.toInts()
        expect(r).toBe(g)
        expect(g).toBe(b)
        labelColors.add([r, g, b].join(","))
        consumed += take
      }
    }

    expect(consumed).toBe(label.length)
    expect(labelColors.size).toBeGreaterThan(2)
  })
})

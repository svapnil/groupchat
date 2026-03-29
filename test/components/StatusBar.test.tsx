// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { afterEach, describe, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { StatusBar } from "../../src/components/StatusBar"

let testSetup: Awaited<ReturnType<typeof testRender>> | null = null

afterEach(() => {
  if (testSetup) {
    testSetup.renderer.destroy()
    testSetup = null
  }
})

function normalizeVersion(frame: string): string {
  return frame.replace(/\d+\.\d+\.\d+/g, "<version>")
}

describe("StatusBar", () => {
  test("renders default controls with user toggle", async () => {
    testSetup = await testRender(
      () => <StatusBar />,
      { width: 90, height: 1 },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()

    expect(frame).toContain("↑/↓ scroll | Ctrl+E users")
    expect(frame).toMatchSnapshot()
  })

  test("renders back navigation, title, and error message", async () => {
    testSetup = await testRender(
      () => (
        <StatusBar
          backLabel="Back"
          backShortcut="Esc"
          title={<text>Channel Settings</text>}
          error="Connection lost"
        />
      ),
      { width: 90, height: 1 },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()

    expect(frame).toContain("← Back [Esc] | Channel Settings")
    expect(frame).toContain("Connection lost")
    expect(frame).toMatchSnapshot()
  })

  test("renders custom hint text", async () => {
    testSetup = await testRender(
      () => <StatusBar hintText="Ctrl+O Logout | Ctrl+C Exit the App" showVersion />,
      { width: 90, height: 1 },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()

    expect(frame).toMatch(/\d+\.\d+\.\d+ \| Ctrl\+O Logout \| Ctrl\+C Exit the App/)
    expect(normalizeVersion(frame)).toMatchSnapshot()
  })

  test("renders online count before the hint", async () => {
    testSetup = await testRender(
      () => <StatusBar onlineCount={3} />,
      { width: 90, height: 1 },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()

    expect(frame).toContain("● 3 Online | ↑/↓ scroll | Ctrl+E users")
    expect(frame).toMatchSnapshot()
  })

  test("keeps online count visible on narrow layouts", async () => {
    testSetup = await testRender(
      () => (
        <StatusBar
          backLabel="Menu"
          backShortcut="ESC"
          title={<text truncate flexShrink={1} minWidth={0}>#very-long-channel-name-that-needs-truncation</text>}
          onlineCount={12}
        />
      ),
      { width: 52, height: 1 },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()

    expect(frame).toContain("● 12 Online")
    expect(frame).toMatchSnapshot()
  })

  test("keeps online count right-aligned when title is present", async () => {
    testSetup = await testRender(
      () => (
        <StatusBar
          backLabel="Menu"
          backShortcut="ESC"
          title={<text>#general</text>}
          onlineCount={1}
        />
      ),
      { width: 80, height: 1 },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()

    expect(frame).toMatch(/#general\s{5,}● 1 Online \| ↑\/↓ scroll \| Ctrl\+E users\s*\n$/)
    expect(frame).toMatchSnapshot()
  })
})

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

describe("StatusBar", () => {
  test("renders default controls with user toggle", async () => {
    testSetup = await testRender(
      () => <StatusBar connectionStatus="connected" />,
      { width: 90, height: 3 },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()

    expect(frame).toContain("● | ↑/↓ scroll | Ctrl+E users")
    expect(frame).toMatchSnapshot()
  })

  test("renders back navigation, title, and error message", async () => {
    testSetup = await testRender(
      () => (
        <StatusBar
          connectionStatus="disconnected"
          backLabel="Back"
          backShortcut="Esc"
          title={<text>Channel Settings</text>}
          error="Connection lost"
        />
      ),
      { width: 90, height: 3 },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()

    expect(frame).toContain("← Back [Esc] | Channel Settings")
    expect(frame).toContain("Connection lost")
    expect(frame).toMatchSnapshot()
  })
})

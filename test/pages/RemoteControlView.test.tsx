// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { afterEach, describe, expect, test } from "bun:test"
import type { JSX } from "solid-js"
import { testRender } from "@opentui/solid"
import { AuthProvider } from "../../src/stores/auth-store"
import { OrgProvider } from "../../src/stores/org-store"
import { ChannelProvider } from "../../src/stores/channel-store"
import { ChatProvider } from "../../src/stores/chat-store"
import { RemoteControlView } from "../../src/pages/RemoteControlView"
import {
  trackRunFinished,
  trackRunEvent,
  trackRunStarted,
} from "../../src/agent/core/remote-run-store"

let testSetup: Awaited<ReturnType<typeof testRender>> | null = null

afterEach(() => {
  if (testSetup) {
    testSetup.renderer.destroy()
    testSetup = null
  }
})

function withProviders(children: () => JSX.Element) {
  return (
    <AuthProvider>
      <OrgProvider>
        <ChannelProvider>
          <ChatProvider>{children()}</ChatProvider>
        </ChannelProvider>
      </OrgProvider>
    </AuthProvider>
  )
}

describe("RemoteControlView", () => {
  test("renders connection, codex, and idle status", async () => {
    testSetup = await testRender(
      () => withProviders(() => <RemoteControlView width={80} height={24} />),
      { width: 80, height: 24 },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()

    expect(frame).toContain("remote control")
    // Disconnected in the test harness — the point is the status line exists.
    expect(frame).toContain("remote offline")
    // Either "codex available" or "codex not found in PATH" depending on host.
    expect(frame).toContain("codex")
    expect(frame).toContain("idle — waiting for @mentions")
  })

  test("shows an active run and then the recent list", async () => {
    trackRunStarted({
      runId: "run-1",
      agentName: "Codex",
      room: "chat_room:acme:general",
      prompt: "fix the flaky test",
    })
    trackRunEvent("run-1", { event: "tool_call", content: "npm test", toolName: "Bash" })

    testSetup = await testRender(
      () => withProviders(() => <RemoteControlView width={80} height={24} />),
      { width: 80, height: 24 },
    )

    await testSetup.renderOnce()
    let frame = testSetup.captureCharFrame()

    expect(frame).toContain("responding to @Codex in #general")
    expect(frame).toContain("fix the flaky test")
    expect(frame).toContain("Bash: npm test")

    trackRunFinished("run-1", "completed")
    await testSetup.renderOnce()
    frame = testSetup.captureCharFrame()

    expect(frame).toContain("idle — waiting for @mentions")
    expect(frame).toContain("recent")
    expect(frame).toContain("✓ @Codex in #general")
  })
})

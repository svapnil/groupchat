// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { afterEach, describe, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { InputBox, type InputBoxProps } from "../../src/components/InputBox"

let testSetup: Awaited<ReturnType<typeof testRender>> | null = null

afterEach(() => {
  if (testSetup) {
    testSetup.renderer.destroy()
    testSetup = null
  }
})

const createProps = (overrides: Partial<InputBoxProps> = {}): InputBoxProps => ({
  onSend: async () => {},
  onTypingStart: () => {},
  onTypingStop: () => {},
  disabled: false,
  ...overrides,
})

describe("InputBox", () => {
  test("renders default placeholder and helper text", async () => {
    testSetup = await testRender(
      () => <InputBox {...createProps()} />,
      { width: 60, height: 8 },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()

    expect(frame).toContain("Type a message...")
    expect(frame).toContain("Enter to send")
    expect(frame).toContain("SEND")
    expect(frame).toMatchSnapshot()
  })

  test("submits a trimmed message on enter", async () => {
    const sent: string[] = []

    testSetup = await testRender(
      () =>
        <InputBox
          {...createProps({
            onSend: async (message) => {
              sent.push(message)
            },
          })}
        />,
      { width: 60, height: 8 },
    )

    await testSetup.renderOnce()
    await testSetup.mockInput.typeText("  hello world  ")
    testSetup.mockInput.pressEnter()

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0)
    })
    await testSetup.renderOnce()

    expect(sent).toEqual(["hello world"])
  })

  test("renders pending mode action state", async () => {
    testSetup = await testRender(
      () =>
        <InputBox
          {...createProps({
            mode: {
              id: "claude",
              label: "Claude Code",
              accentColor: "#FFA500",
              pendingAction: true,
              pendingActionPlaceholder: "Awaiting permission decision...",
              pendingActionHelperText: "↑/↓ select Allow/Deny in message list • Enter to confirm",
            },
          })}
        />,
      { width: 80, height: 8 },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()

    expect(frame).toContain("Awaiting permission decision...")
    expect(frame).toContain("Allow/Deny")
    expect(frame).toMatchSnapshot()
  })
})

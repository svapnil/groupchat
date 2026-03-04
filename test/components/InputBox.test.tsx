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

const pressTab = (setup: NonNullable<typeof testSetup>) => {
  setup.renderer.keyInput.emit("keypress", {
    name: "tab",
    sequence: "\t",
    ctrl: false,
    shift: false,
    meta: false,
    option: false,
    eventType: "press",
    repeated: false,
  })
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

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

    await tick()
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

describe("InputBox tab completion", () => {
  test("tab applies tabCompletion value to input", async () => {
    const changes: string[] = []

    testSetup = await testRender(
      () =>
        <InputBox
          {...createProps({
            onInputChange: (value) => changes.push(value),
            commandNames: ["/invite"],
            tabCompletion: "/invite ",
          })}
        />,
      { width: 60, height: 8 },
    )

    await testSetup.renderOnce()
    await testSetup.mockInput.typeText("/inv")
    pressTab(testSetup)

    await tick()
    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()

    expect(frame).toContain("/invite")
    expect(changes).toContain("/invite ")
  })

  test("tab does nothing when tabCompletion is null", async () => {
    const changes: string[] = []

    testSetup = await testRender(
      () =>
        <InputBox
          {...createProps({
            onInputChange: (value) => changes.push(value),
            commandNames: ["/invite"],
            tabCompletion: null,
          })}
        />,
      { width: 60, height: 8 },
    )

    await testSetup.renderOnce()
    await testSetup.mockInput.typeText("/inv")
    pressTab(testSetup)

    await tick()
    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()

    expect(frame).toContain("/inv")
    expect(changes.filter((c) => c === "/invite ")).toHaveLength(0)
  })

  test("tab completes a no-parameter command without trailing space", async () => {
    const changes: string[] = []

    testSetup = await testRender(
      () =>
        <InputBox
          {...createProps({
            onInputChange: (value) => changes.push(value),
            commandNames: ["/claude"],
            tabCompletion: "/claude",
          })}
        />,
      { width: 60, height: 8 },
    )

    await testSetup.renderOnce()
    await testSetup.mockInput.typeText("/cl")
    pressTab(testSetup)

    await tick()
    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()

    expect(frame).toContain("/claude")
    expect(changes).toContain("/claude")
  })
})

describe("InputBox command mode display", () => {
  test("renders mode placeholder and helper text for claude mode", async () => {
    testSetup = await testRender(
      () =>
        <InputBox
          {...createProps({
            mode: {
              id: "claude",
              label: "Claude Code",
              accentColor: "#FFA500",
              placeholder: "Message Claude Code...",
              helperText: "Type /exit to leave Claude Code mode",
            },
          })}
        />,
      { width: 80, height: 8 },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()

    expect(frame).toContain("Message Claude Code...")
    expect(frame).toContain("Type /exit to leave Claude Code mode")
    expect(frame).toMatchSnapshot()
  })

  test("shows disabled placeholder when disconnected", async () => {
    testSetup = await testRender(
      () => <InputBox {...createProps({ disabled: true })} />,
      { width: 60, height: 8 },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()

    expect(frame).toContain("Connecting...")
  })
})

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { afterEach, describe, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { createSignal } from "solid-js"
import { InputBox, type InputBoxProps } from "../../src/components/InputBox"
import type { InputMode } from "../../src/lib/input-mode"

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

  test("submits text while pending action input is enabled", async () => {
    const sent: string[] = []

    testSetup = await testRender(
      () =>
        <InputBox
          {...createProps({
            onSend: async (message) => {
              sent.push(message)
            },
            mode: {
              id: "claude",
              label: "Claude Code",
              accentColor: "#FFA500",
              pendingAction: true,
              pendingActionAllowsTextInput: true,
              pendingActionPlaceholder: "Type your answer...",
              pendingActionHelperText: "Type your answer and press Enter",
            },
          })}
        />,
      { width: 80, height: 8 },
    )

    await testSetup.renderOnce()
    await testSetup.mockInput.typeText("custom answer")
    testSetup.mockInput.pressEnter()

    await tick()
    await testSetup.renderOnce()

    expect(sent).toEqual(["custom answer"])
  })

  test("switches to bash mode and still submits from agent mode", async () => {
    const sent: string[] = []

    testSetup = await testRender(
      () =>
        <InputBox
          {...createProps({
            onSend: async (message) => {
              sent.push(message)
            },
            mode: {
              id: "claude",
              label: "Claude Code",
              accentColor: "#FFA500",
            },
          })}
        />,
      { width: 80, height: 8 },
    )

    await testSetup.renderOnce()
    await testSetup.mockInput.typeText("!echo hello")
    await testSetup.renderOnce()

    let frame = testSetup.captureCharFrame()
    expect(frame).toContain("Bash Mode")
    expect(frame).not.toContain("Using Claude Code")
    expect(frame).toContain("echo hello")

    testSetup.mockInput.pressEnter()

    await tick()
    await testSetup.renderOnce()
    frame = testSetup.captureCharFrame()

    expect(sent).toEqual(["!echo hello"])
    expect(frame).not.toContain("Bash Mode")
    expect(frame).toContain("Using Claude Code")
  })

  test("does not render a duplicate exclamation mark when entering bash mode", async () => {
    testSetup = await testRender(
      () => <InputBox {...createProps()} />,
      { width: 60, height: 8 },
    )

    await testSetup.renderOnce()
    await testSetup.mockInput.typeText("!")
    await testSetup.renderOnce()

    const frame = testSetup.captureCharFrame()
    expect(frame).toContain("Bash Mode")
    expect(frame).toContain("! Run a shell command...")
    expect(frame).not.toContain("! !")
  })

  test("clears bash input when pending mode takes over", async () => {
    const sent: string[] = []
    let setMode: ((value: InputMode | null) => void) | undefined

    testSetup = await testRender(
      () => {
        const [mode, updateMode] = createSignal<InputMode | null>({
          id: "claude",
          label: "Claude Code",
          accentColor: "#FFA500",
        })
        setMode = updateMode

        return (
          <InputBox
            {...createProps({
              onSend: async (message) => {
                sent.push(message)
              },
              mode: mode(),
            })}
          />
        )
      },
      { width: 80, height: 8 },
    )

    await testSetup.renderOnce()
    await testSetup.mockInput.typeText("!echo hello")
    await testSetup.renderOnce()

    let frame = testSetup.captureCharFrame()
    expect(frame).toContain("Bash Mode")
    expect(frame).toContain("echo hello")

    setMode?.({
      id: "claude",
      label: "Claude Code",
      accentColor: "#FFA500",
      pendingAction: true,
      pendingActionAllowsTextInput: true,
      pendingActionPlaceholder: "Type your answer...",
      pendingActionHelperText: "Type your answer and press Enter",
    })

    await tick()
    await testSetup.renderOnce()

    frame = testSetup.captureCharFrame()
    expect(frame).not.toContain("Bash Mode")
    expect(frame).toContain("Type your answer...")
    expect(frame).not.toContain("echo hello")

    testSetup.mockInput.pressEnter()

    await tick()
    await testSetup.renderOnce()

    expect(sent).toEqual([])
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

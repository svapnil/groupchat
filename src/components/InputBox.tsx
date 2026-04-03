// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import type { InputRenderable } from "@opentui/core"
import { useKeyboard } from "@opentui/solid"
import { isCommandLikeInput, startsWithKnownCommand } from "../lib/command-input"
import { LAYOUT_HEIGHTS } from "../lib/layout"
import type { BackgroundAgentMode, InputMode } from "../lib/input-mode"
import { BASH_MODE_COLOR, extractBashCommand, isBashPrefixedMessage } from "../bash/shared"

const FRAME_RULE = "─".repeat(512)

export type InputBoxProps = {
  onSend: (message: string) => Promise<void>
  onTypingStart: () => void
  onTypingStop: () => void
  disabled: boolean
  sendDisabled?: boolean
  onInputChange?: (value: string) => void
  commandNames?: string[]
  placeholder?: string
  mode?: InputMode | null
  backgroundMode?: BackgroundAgentMode | null
  tabCompletion?: string | null
  onBashModeChange?: (active: boolean) => void
}

export function InputBox(props: InputBoxProps) {
  const [value, setValue] = createSignal("")
  const [isSending, setIsSending] = createSignal(false)
  const [isBashMode, setIsBashMode] = createSignal(false)

  let typingTimeout: ReturnType<typeof setTimeout> | null = null
  let isTyping = false
  let isCommandMode = false
  let inputRef: InputRenderable | undefined

  const setBashMode = (active: boolean) => {
    if (isBashMode() === active) return
    if (active) {
      stopTyping()
      isCommandMode = false
      props.onInputChange?.("")
    }
    setIsBashMode(active)
    props.onBashModeChange?.(active)
  }

  const stopTyping = () => {
    if (isTyping) {
      isTyping = false
      props.onTypingStop()
    }
  }

  const handleChange = (newValue: string) => {
    const bashAllowed = !props.mode?.pendingAction
    let nextValue = newValue

    if (bashAllowed) {
      if (!isBashMode() && isBashPrefixedMessage(newValue)) {
        setBashMode(true)
        nextValue = newValue.slice(1).trimStart()
      } else if (isBashMode() && newValue.startsWith("!")) {
        nextValue = newValue.slice(1).trimStart()
      }
    } else if (isBashMode()) {
      setBashMode(false)
    }

    setValue(nextValue)
    if (nextValue !== newValue && inputRef && inputRef.value !== nextValue) {
      inputRef.value = nextValue
    }

    if (isBashMode()) {
      stopTyping()
      return
    }

    const isCommandLike = isCommandLikeInput(nextValue)

    if (isCommandLike) {
      isCommandMode = true
      if (props.onInputChange) {
        props.onInputChange(nextValue)
      }
    } else if (isCommandMode) {
      isCommandMode = false
      if (props.onInputChange) {
        props.onInputChange("")
      }
    }

    if (!isTyping && nextValue.length > 0) {
      isTyping = true
      props.onTypingStart()
    }

    if (typingTimeout) {
      clearTimeout(typingTimeout)
      typingTimeout = null
    }

    if (nextValue.length > 0) {
      typingTimeout = setTimeout(() => {
        stopTyping()
      }, 2000)
    } else {
      stopTyping()
    }
  }

  const handleSubmit = async (submittedValue?: string) => {
    const candidate = submittedValue ?? value()
    const bashCommand = isBashMode() ? extractBashCommand(`!${candidate}`) : null
    const trimmed = bashCommand ? `!${bashCommand}` : candidate.trim()
    if (!trimmed || props.disabled || props.sendDisabled || isSending()) return

    if (props.mode?.pendingAction && !props.mode.pendingActionAllowsTextInput) {
      return
    }

    setIsSending(true)

    if (typingTimeout) {
      clearTimeout(typingTimeout)
      typingTimeout = null
    }
    stopTyping()

    try {
      await props.onSend(trimmed)
      setValue("")
      setBashMode(false)
      isCommandMode = false
      if (props.onInputChange) {
        props.onInputChange("")
      }
    } catch {
      // Error handled by caller
    } finally {
      setIsSending(false)
    }
  }

  createEffect(() => {
    if (props.mode?.pendingAction && isBashMode()) {
      setValue("")
      if (inputRef && inputRef.value !== "") {
        inputRef.value = ""
      }
      isCommandMode = false
      props.onInputChange?.("")
      setBashMode(false)
    }
  })

  onCleanup(() => {
    if (typingTimeout) {
      clearTimeout(typingTimeout)
      typingTimeout = null
    }
    if (isBashMode()) {
      props.onBashModeChange?.(false)
    }
  })

  useKeyboard((key) => {
    if (key.name === "backspace" && isBashMode() && value() === "") {
      setBashMode(false)
      return
    }

    if (key.name === "tab" && props.tabCompletion && !isBashMode()) {
      handleChange(props.tabCompletion)
    }
  })

  const shouldShowBashMode = createMemo(() => isBashMode())
  const isKnownCommandPrefix = createMemo(() => {
    if (shouldShowBashMode()) return false
    return startsWithKnownCommand(value(), props.commandNames || [])
  })
  const inputTextColor = () => {
    return isKnownCommandPrefix() ? "cyan" : "#FFFFFF"
  }
  const frameColor = () => "gray"
  const placeholder = () => {
    if (props.disabled) return "Connecting..."
    if (shouldShowBashMode()) return "Run a shell command..."
    if (props.mode?.pendingAction) {
      return props.mode.pendingActionPlaceholder || "Awaiting action..."
    }
    if (props.mode) {
      return props.mode.placeholder || `${props.mode.label} mode...`
    }
    return props.placeholder || "Type a message..."
  }
  const helperText = () => {
    if (shouldShowBashMode()) {
      return ""
    }
    if (props.mode?.pendingAction) {
      return props.mode.pendingActionHelperText || "Complete the pending action in the message list."
    }
    if (props.mode) {
      return props.mode.helperText || ""
    }
    return ""
  }

  return (
    <box
      flexDirection="column"
      width="100%"
      height={
        (props.mode || props.backgroundMode || shouldShowBashMode())
          ? (helperText() ? LAYOUT_HEIGHTS.inputBoxWithModeAndHelper : LAYOUT_HEIGHTS.inputBoxWithMode)
          : (helperText() ? LAYOUT_HEIGHTS.inputBoxWithHelper : LAYOUT_HEIGHTS.inputBox)
      }
      overflow="hidden"
      flexShrink={0}
    >
      <box paddingLeft={1} paddingRight={1} width="100%" height="100%" flexDirection="column">
        <Show when={props.mode && !shouldShowBashMode()}>
          <box height={2} paddingLeft={1} flexDirection="column" justifyContent="flex-end">
            <box height={1} flexDirection="row">
              <text fg={props.mode!.accentColor}>{"● "}</text>
              <text fg="#FFFFFF">{`Using ${props.mode!.label}`}</text>
              <text fg="#888888">{" (Shift+Tab to toggle)"}</text>
            </box>
          </box>
        </Show>
        <Show when={!props.mode && props.backgroundMode && !shouldShowBashMode()}>
          <box height={2} paddingLeft={1} flexDirection="column" justifyContent="flex-end">
            <box height={1} flexDirection="row">
              <text fg="#888888">{"● "}</text>
              <text fg="#888888">{`Using ${props.backgroundMode!.label} in the background (Shift+Tab to resume)`}</text>
            </box>
          </box>
        </Show>
        <Show when={shouldShowBashMode()}>
          <box height={2} paddingLeft={1} flexDirection="column" justifyContent="flex-end">
            <box height={1} flexDirection="row">
              <text fg={BASH_MODE_COLOR}>{"● "}</text>
              <text fg="#FFFFFF">{"Bash Mode"}</text>
            </box>
          </box>
        </Show>
        <text fg={frameColor()} width="100%" height={1} truncate>{FRAME_RULE}</text>
        <box flexDirection="row" height={1} alignItems="center" paddingLeft={1} paddingRight={1}>
          <Show
            when={shouldShowBashMode()}
            fallback={<text fg="#FFFFFF">{"❯ "}</text>}
          >
            <text fg={BASH_MODE_COLOR}>{"! "}</text>
          </Show>
          <box flexGrow={1} minWidth={0} overflow="hidden">
            <input
              ref={(ref) => {
                inputRef = ref
              }}
              value={value()}
              onInput={handleChange}
              onSubmit={(submitted) => {
                const nextValue = typeof submitted === "string" ? submitted : undefined
                void handleSubmit(nextValue)
              }}
              placeholder={placeholder()}
              focused={!props.disabled && (!props.mode?.pendingAction || Boolean(props.mode.pendingActionAllowsTextInput))}
              width="100%"
              textColor={inputTextColor()}
              focusedTextColor={inputTextColor()}
            />
          </box>
        </box>
        <text fg={frameColor()} width="100%" height={1} truncate>{FRAME_RULE}</text>
        <Show when={helperText()}>
          <box height={1} alignItems="center" paddingLeft={1} paddingRight={1}>
            <text fg="#888888" width="100%" height={1} truncate>
              {helperText()}
            </text>
          </box>
        </Show>
      </box>
    </box>
  )
}

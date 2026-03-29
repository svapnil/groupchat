// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { Show, createMemo, createSignal, onCleanup } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { isCommandLikeInput, startsWithKnownCommand } from "../lib/command-input"
import { LAYOUT_HEIGHTS } from "../lib/layout"
import type { BackgroundAgentMode, InputMode } from "../lib/input-mode"

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
}

export function InputBox(props: InputBoxProps) {
  const [value, setValue] = createSignal("")
  const [isSending, setIsSending] = createSignal(false)

  let typingTimeout: ReturnType<typeof setTimeout> | null = null
  let isTyping = false
  let isCommandMode = false

  const stopTyping = () => {
    if (isTyping) {
      isTyping = false
      props.onTypingStop()
    }
  }

  const handleChange = (newValue: string) => {
    setValue(newValue)
    const isCommandLike = isCommandLikeInput(newValue)

    if (isCommandLike) {
      isCommandMode = true
      if (props.onInputChange) {
        props.onInputChange(newValue)
      }
    } else if (isCommandMode) {
      isCommandMode = false
      if (props.onInputChange) {
        props.onInputChange("")
      }
    }

    if (!isTyping && newValue.length > 0) {
      isTyping = true
      props.onTypingStart()
    }

    if (typingTimeout) {
      clearTimeout(typingTimeout)
      typingTimeout = null
    }

    if (newValue.length > 0) {
      typingTimeout = setTimeout(() => {
        stopTyping()
      }, 2000)
    } else {
      stopTyping()
    }
  }

  const handleSubmit = async (submittedValue?: string) => {
    const candidate = submittedValue ?? value()
    const trimmed = candidate.trim()
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

  onCleanup(() => {
    if (typingTimeout) {
      clearTimeout(typingTimeout)
      typingTimeout = null
    }
  })

  useKeyboard((key) => {
    if (key.name === "tab" && props.tabCompletion) {
      handleChange(props.tabCompletion)
    }
  })

  const isKnownCommandPrefix = createMemo(() => startsWithKnownCommand(value(), props.commandNames || []))
  const inputTextColor = () => {
    return isKnownCommandPrefix() ? "cyan" : "#FFFFFF"
  }
  const frameColor = () => "gray"
  const placeholder = () => {
    if (props.disabled) return "Connecting..."
    if (props.mode?.pendingAction) {
      return props.mode.pendingActionPlaceholder || "Awaiting action..."
    }
    if (props.mode) {
      return props.mode.placeholder || `${props.mode.label} mode...`
    }
    return props.placeholder || "Type a message..."
  }
  const helperText = () => {
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
        (props.mode || props.backgroundMode)
          ? (helperText() ? LAYOUT_HEIGHTS.inputBoxWithModeAndHelper : LAYOUT_HEIGHTS.inputBoxWithMode)
          : (helperText() ? LAYOUT_HEIGHTS.inputBoxWithHelper : LAYOUT_HEIGHTS.inputBox)
      }
      overflow="hidden"
      flexShrink={0}
    >
      <box paddingLeft={1} paddingRight={1} width="100%" height="100%" flexDirection="column">
        <Show when={props.mode}>
          <box height={1} paddingLeft={1} flexDirection="row">
            <text fg={props.mode!.accentColor}>{"● "}</text>
            <text fg="#FFFFFF">{`Using ${props.mode!.label}`}</text>
          </box>
        </Show>
        <Show when={!props.mode && props.backgroundMode}>
          <box height={1} paddingLeft={1} flexDirection="row">
            <text fg="#888888">{"● "}</text>
            <text fg="#888888">{`Using ${props.backgroundMode!.label} in the background`}</text>
          </box>
        </Show>
        <text fg={frameColor()} width="100%" height={1} truncate>{FRAME_RULE}</text>
        <box flexDirection="row" height={1} alignItems="center" paddingLeft={1} paddingRight={1}>
          <text fg="#FFFFFF">{"❯ "}</text>
          <box flexGrow={1} minWidth={0} overflow="hidden">
            <input
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

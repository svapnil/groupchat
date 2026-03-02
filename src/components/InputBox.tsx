// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { createMemo, createSignal, onCleanup } from "solid-js"
import { isCommandLikeInput, startsWithKnownCommand } from "../lib/command-input"
import { LAYOUT_HEIGHTS } from "../lib/layout"
import type { InputMode } from "../lib/input-mode"

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

    if (props.mode?.pendingAction) {
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

  const canSend = () =>
    !props.disabled &&
    !props.sendDisabled &&
    !props.mode?.pendingAction &&
    value().trim().length > 0
  const isKnownCommandPrefix = createMemo(() => startsWithKnownCommand(value(), props.commandNames || []))
  const inputTextColor = () => {
    if (props.mode) return props.mode.accentColor
    return isKnownCommandPrefix() ? "cyan" : "#FFFFFF"
  }
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
      return props.mode.helperText || `${props.mode.label} mode`
    }
    return "Enter to send"
  }

  return (
    <box
      border
      borderStyle="single"
      borderColor={props.mode ? props.mode.accentColor : "gray"}
      paddingLeft={1}
      paddingRight={1}
      flexDirection="column"
      width="100%"
      height={LAYOUT_HEIGHTS.inputBox}
      overflow="hidden"
      flexShrink={0}
    >
      <box flexDirection="row" height={1} alignItems="center">
        <text fg={props.mode ? props.mode.accentColor : "cyan"}>{"❯ "}</text>
        <box flexGrow={1} minWidth={0} overflow="hidden">
          <input
            value={value()}
            onInput={handleChange}
            onSubmit={(submitted) => {
              const nextValue = typeof submitted === "string" ? submitted : undefined
              void handleSubmit(nextValue)
            }}
            placeholder={placeholder()}
            focused={!props.disabled && !props.mode?.pendingAction}
            width="100%"
            textColor={inputTextColor()}
            focusedTextColor={inputTextColor()}
          />
        </box>
        <text fg={canSend() ? "#00FF00" : "gray"}>
          {" SEND"}
        </text>
      </box>
      <box height={1} alignItems="center">
        <text fg="#888888" width="100%" height={1} truncate>
          {helperText()}
        </text>
      </box>
    </box>
  )
}

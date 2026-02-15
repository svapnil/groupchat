import { createMemo, createSignal, onCleanup } from "solid-js"
import { isCommandLikeInput, startsWithKnownCommand } from "../lib/command-input"
import { LAYOUT_HEIGHTS } from "../lib/layout"
import type { ClaudePendingPermission } from "../primitives/create-claude-sdk-session"

export type InputBoxProps = {
  onSend: (message: string) => Promise<void>
  onTypingStart: () => void
  onTypingStop: () => void
  disabled: boolean
  sendDisabled?: boolean
  onInputChange?: (value: string) => void
  commandNames?: string[]
  placeholder?: string
  claudeMode?: boolean
  claudePendingPermission?: ClaudePendingPermission | null
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

    if (props.claudeMode && props.claudePendingPermission) {
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
    !props.claudePendingPermission &&
    value().trim().length > 0
  const isKnownCommandPrefix = createMemo(() => startsWithKnownCommand(value(), props.commandNames || []))
  const inputTextColor = () => {
    if (props.claudeMode) return "#FFA500"
    return isKnownCommandPrefix() ? "cyan" : "#FFFFFF"
  }
  const placeholder = () => {
    if (props.disabled) return "Connecting..."
    if (props.claudeMode && props.claudePendingPermission) return "Awaiting permission decision..."
    if (props.claudeMode) return "Claude Code mode..."
    return props.placeholder || "Type a message..."
  }
  const helperText = () => {
    if (props.claudeMode && props.claudePendingPermission) {
      return "↑/↓ select Allow/Deny in message list • Enter to confirm"
    }
    if (props.claudeMode) {
      return "Claude mode: /exit to leave, Ctrl+C to interrupt"
    }
    return "Enter to send"
  }

  return (
    <box
      border
      borderStyle="single"
      borderColor={props.claudeMode ? "#FFA500" : "gray"}
      paddingLeft={1}
      paddingRight={1}
      flexDirection="column"
      width="100%"
      height={LAYOUT_HEIGHTS.inputBox}
      overflow="hidden"
      flexShrink={0}
    >
      <box flexDirection="row" height={1} alignItems="center">
        <text fg={props.claudeMode ? "#FFA500" : "cyan"}>{"❯ "}</text>
        <box flexGrow={1} minWidth={0} overflow="hidden">
          <input
            value={value()}
            onInput={handleChange}
            onSubmit={(submitted) => {
              const nextValue = typeof submitted === "string" ? submitted : undefined
              void handleSubmit(nextValue)
            }}
            placeholder={placeholder()}
            focused={!props.disabled && !props.claudePendingPermission}
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

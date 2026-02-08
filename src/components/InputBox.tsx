import { createSignal, onCleanup } from "solid-js"
import { LAYOUT_HEIGHTS } from "../lib/layout"

export type InputBoxProps = {
  onSend: (message: string) => Promise<void>
  onTypingStart: () => void
  onTypingStop: () => void
  disabled: boolean
  onInputChange?: (value: string) => void
  placeholder?: string
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
    const isCommandLike = newValue.startsWith("/") || newValue.startsWith("?")

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
    if (!trimmed || props.disabled || isSending()) return

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

  const canSend = () => !props.disabled && value().trim().length > 0
  const placeholder = () => (props.disabled ? "Connecting..." : props.placeholder || "Type a message...")

  return (
    <box
      border
      borderStyle="single"
      borderColor="gray"
      paddingLeft={1}
      paddingRight={1}
      flexDirection="column"
      width="100%"
      height={LAYOUT_HEIGHTS.inputBox}
      overflow="hidden"
      flexShrink={0}
    >
      <box flexDirection="row" height={1} alignItems="center">
        <text fg="cyan">❯ </text>
        <box flexGrow={1} minWidth={0} overflow="hidden">
          <input
            value={value()}
            onInput={handleChange}
            onSubmit={(submitted) => {
              const nextValue = typeof submitted === "string" ? submitted : undefined
              void handleSubmit(nextValue)
            }}
            placeholder={placeholder()}
            focused={!props.disabled}
            width="100%"
          />
        </box>
        <text fg={canSend() ? "#00FF00" : "gray"}> SEND</text>
      </box>
      <box height={1} alignItems="center">
        <text fg="#888888" width="100%" height={1} truncate>Enter to send</text>
      </box>
    </box>
  )
}

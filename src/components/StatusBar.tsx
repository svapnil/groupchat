import { Show, createMemo } from "solid-js"
import type { JSX } from "solid-js"
import type { ConnectionStatus } from "../lib/types"
import { useStatusMessage } from "../stores/status-message-store"
import { PRESENCE } from "../lib/colors"

export type StatusBarProps = {
  connectionStatus: ConnectionStatus
  error?: string | null
  showUserToggle?: boolean
  backLabel?: string
  backShortcut?: string
  title?: JSX.Element
}

export function StatusBar(props: StatusBarProps) {
  let statusContext: ReturnType<typeof useStatusMessage> | null = null
  try {
    statusContext = useStatusMessage()
  } catch {
    statusContext = null
  }

  const displayMessage = () => {
    if (statusContext) {
      return statusContext.message()
    }

    if (props.error) {
      return { text: props.error, type: "error" as const }
    }

    return null
  }

  const currentMessage = createMemo(displayMessage)

  const statusColor = () => {
    if (props.connectionStatus === "connected") {
      return PRESENCE.online
    }
    if (props.connectionStatus === "connecting") {
      return "yellow"
    }
    return "red"
  }

  const showUserToggle = () => props.showUserToggle ?? true
  const hasBack = () => Boolean(props.backLabel && props.backShortcut)
  const hasTitle = () => Boolean(props.title)

  return (
    <box
      border
      borderStyle="single"
      borderColor="gray"
      paddingLeft={1}
      paddingRight={1}
      flexDirection="row"
      alignItems="center"
      justifyContent="space-between"
      width="100%"
      height={3}
      overflow="hidden"
      flexShrink={0}
    >
      <box flexDirection="row" flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden" alignItems="center">
        <Show when={hasBack()}>
          <text fg="gray" flexShrink={0}>{"← "}{props.backLabel} </text>
          <text fg="#888888" flexShrink={0}>[{props.backShortcut}]</text>
        </Show>
        <Show when={hasTitle()}>
          <Show when={hasBack()}>
            <text fg="#888888" flexShrink={0}> | </text>
          </Show>
          <box flexShrink={1} minWidth={0} overflow="hidden">
            {props.title}
          </box>
        </Show>
      </box>

      <box flexDirection="row" flexShrink={0} alignItems="center">
        <Show
          when={currentMessage()}
          fallback={
            <box flexDirection="row">
              <text fg={statusColor()}>●</text>
              <text fg="#888888">
                {" | ↑/↓ scroll"}
                {showUserToggle() ? " | Ctrl+E users" : ""}
              </text>
            </box>
          }
        >
          {(message: () => { text: string; type: "error" | "info" }) => (
            <text fg={message().type === "error" ? "red" : "#888888"}>{message().text}</text>
          )}
        </Show>
      </box>
    </box>
  )
}

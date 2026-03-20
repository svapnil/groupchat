// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { Show, createMemo } from "solid-js"
import type { JSX } from "solid-js"
import { PRESENCE } from "../lib/colors"
import { useStatusMessage } from "../stores/status-message-store"
import packageJson from "../../package.json"

export type StatusBarProps = {
  error?: string | null
  showUserToggle?: boolean
  showVersion?: boolean
  hintText?: string
  backLabel?: string
  backShortcut?: string
  title?: JSX.Element
  onlineCount?: number
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

  const showUserToggle = () => props.showUserToggle ?? true
  const hasBack = () => Boolean(props.backLabel && props.backShortcut)
  const hasTitle = () => Boolean(props.title)
  const hasOnlineCount = () => (props.onlineCount ?? 0) > 0
  const hintText = () => props.hintText ?? `↑/↓ scroll${showUserToggle() ? " | Ctrl+E users" : ""}`

  return (
    <box
      paddingLeft={1}
      paddingRight={1}
      flexDirection="row"
      alignItems="center"
      justifyContent="flex-start"
      width="100%"
      height={1}
      overflow="hidden"
      flexShrink={0}
    >
      <box flexDirection="row" flexShrink={1} minWidth={0} overflow="hidden" alignItems="center">
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

      <box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden" alignItems="center" justifyContent="flex-end">
        <Show
          when={currentMessage()}
          fallback={
            <box
              flexDirection="row"
              width="100%"
              flexShrink={1}
              minWidth={0}
              overflow="hidden"
              alignItems="center"
              justifyContent="flex-end"
            >
              <Show when={props.showVersion || hasOnlineCount()}>
                <box flexDirection="row" alignItems="center" flexShrink={0}>
                  <Show when={props.showVersion}>
                    <text fg="#888888" flexShrink={0}>{packageJson.version}</text>
                  </Show>
                  <Show when={props.showVersion && hasOnlineCount()}>
                    <text fg="#888888" flexShrink={0}> | </text>
                  </Show>
                  <Show when={hasOnlineCount()}>
                    <text fg={PRESENCE.online}>●</text>
                    <text fg="#888888"> {props.onlineCount} Online</text>
                  </Show>
                </box>
                <text fg="#888888" flexShrink={0}> | </text>
              </Show>
              <box flexShrink={1} minWidth={0} overflow="hidden">
                <text fg="#888888" width="100%" height={1} truncate>{hintText()}</text>
              </box>
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

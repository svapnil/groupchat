import { Show, createMemo, onMount } from "solid-js"
import { useKeyboard, useRenderer } from "@opentui/solid"

export type LoginScreenProps = {
  onLogin: () => void
  status: string
  isLoading: boolean
}

export function LoginScreen(props: LoginScreenProps) {
  const renderer = useRenderer()
  const isLoading = () => props.isLoading
  const hasStatus = createMemo(() => props.status.trim().length > 0)

  onMount(() => {
    renderer.setTerminalTitle("Welcome to Groupchatty")
  })

  useKeyboard((key) => {
    if (key.name === "return" && !isLoading()) {
      props.onLogin()
    }
  })

  return (
    <box flexDirection="column" alignItems="center" justifyContent="center" padding={2}>
      <box marginBottom={2}>
        <ascii_font text="GROUPCHAT" font="block" color="red" />
      </box>

      <box
        border
        borderStyle="single"
        borderColor="red"
        paddingLeft={4}
        paddingRight={4}
        paddingTop={1}
        paddingBottom={1}
        flexDirection="column"
        alignItems="center"
      >
        <Show
          when={isLoading()}
          fallback={
            <Show
              when={hasStatus()}
              fallback={
                <>
                  <text fg="red">Welcome to Groupchat!</text>
                  <box marginTop={1} flexDirection="row">
                    <text fg="#888888">Press </text>
                    <text fg="#00FF00">
                      <strong>Enter</strong>
                    </text>
                    <text fg="#888888"> to login with your browser</text>
                  </box>
                </>
              }
            >
              <text fg="red">{props.status}</text>
              <box marginTop={1} flexDirection="row">
                <text fg="#888888">Press </text>
                <text fg="cyan">
                  <strong>Enter</strong>
                </text>
                <text fg="#888888"> to try again</text>
              </box>
            </Show>
          }
        >
          <text fg="yellow">{props.status || "Authenticating..."}</text>
          <box marginTop={1}>
            <text fg="#888888">Please complete login in your browser...</text>
          </box>
        </Show>
      </box>

      <box marginTop={2}>
        <text fg="#888888">Ctrl+C to exit</text>
      </box>
    </box>
  )
}

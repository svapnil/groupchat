import { Show, createEffect, createMemo, createSignal } from "solid-js"
import { useKeyboard, useRenderer } from "@opentui/solid"
import { Layout } from "../components/Layout"
import { StatusBar } from "../components/StatusBar"
import { useNavigation } from "../components/Router"
import { useAuth } from "../stores/auth-store"
import { useChannelsStore } from "../stores/channel-store"
import { useChatStore } from "../stores/chat-store"
import { useDmStore } from "../stores/dm-store"
import { createChannel } from "../lib/chat-client"
import { getConfig } from "../lib/config"
import { LAYOUT_HEIGHTS } from "../lib/layout"

export type CreateChannelScreenProps = {
  width: number
  height: number
  topPadding?: number
}

type ActiveField = "name" | "description" | "submit"

export function CreateChannelScreen(props: CreateChannelScreenProps) {
  const navigation = useNavigation()
  const auth = useAuth()
  const chat = useChatStore()
  const channels = useChannelsStore()
  const dms = useDmStore()
  const renderer = useRenderer()

  const [name, setName] = createSignal("")
  const [description, setDescription] = createSignal("")
  const [activeField, setActiveField] = createSignal<ActiveField>("name")
  const [isSubmitting, setIsSubmitting] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const totalUnreadCount = createMemo(() => channels.totalUnreadCount() + dms.totalUnreadCount())

  createEffect(() => {
    const unreadSuffix = totalUnreadCount() > 0 ? ` (${totalUnreadCount()})` : ""
    renderer.setTerminalTitle(`Create Channel${unreadSuffix}`)
  })

  const handleSubmit = async () => {
    const trimmedName = name().trim()
    if (!trimmedName) {
      setError("Channel name is required")
      return
    }

    const token = auth.token()
    if (!token || isSubmitting()) return

    setError(null)
    setIsSubmitting(true)

    try {
      const config = getConfig()
      const trimmedDescription = description().trim()
      const response = await createChannel(
        config.wsUrl,
        token,
        trimmedName,
        trimmedDescription.length > 0 ? trimmedDescription : undefined
      )

      channels.setChannels(response.channels.public, response.channels.private)
      navigation.navigate("menu")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create channel")
      setIsSubmitting(false)
    }
  }

  useKeyboard((key) => {
    if (key.name === "escape") {
      navigation.navigate("menu")
      return
    }

    if (key.name === "tab" && !key.shift) {
      setActiveField((prev) => {
        if (prev === "name") return "description"
        if (prev === "description") return "submit"
        return "name"
      })
      return
    }

    if (key.name === "tab" && key.shift) {
      setActiveField((prev) => {
        if (prev === "submit") return "description"
        if (prev === "description") return "name"
        return "submit"
      })
      return
    }

    if (key.name === "down") {
      setActiveField((prev) => {
        if (prev === "name") return "description"
        if (prev === "description") return "submit"
        return prev
      })
      return
    }

    if (key.name === "up") {
      setActiveField((prev) => {
        if (prev === "submit") return "description"
        if (prev === "description") return "name"
        return prev
      })
      return
    }

    if ((key.name === "return" || key.name === "enter") && activeField() === "submit" && !isSubmitting()) {
      void handleSubmit()
    }
  })

  const contentHeight = () => props.height - (props.topPadding ?? 0) - LAYOUT_HEIGHTS.statusBar

  return (
    <Layout width={props.width} height={props.height} topPadding={props.topPadding ?? 0}>
      <Layout.Content>
        <box flexDirection="column" height={contentHeight()} padding={2}>
          <box flexDirection="column" marginBottom={1}>
            <box>
              <text fg={activeField() === "name" ? "#00FF00" : "white"}>
                <strong>Channel Name {activeField() === "name" ? "(editing)" : ""}</strong>
              </text>
            </box>
            <box
              border
              borderStyle="single"
              borderColor={activeField() === "name" ? "#00FF00" : "gray"}
              paddingLeft={1}
              paddingRight={1}
            >
              {activeField() === "name" ? (
                <input
                  value={name()}
                  onInput={setName}
                  placeholder="Enter channel name..."
                  focused
                />
              ) : (
                <text fg={name() ? "white" : "gray"}>{name() || "Enter channel name..."}</text>
              )}
            </box>
          </box>

          <box flexDirection="column" marginBottom={1}>
            <box>
              <text fg={activeField() === "description" ? "#00FF00" : "white"}>
                <strong>Description (optional) {activeField() === "description" ? "(editing)" : ""}</strong>
              </text>
            </box>
            <box
              border
              borderStyle="single"
              borderColor={activeField() === "description" ? "#00FF00" : "gray"}
              paddingLeft={1}
              paddingRight={1}
            >
              {activeField() === "description" ? (
                <input
                  value={description()}
                  onInput={setDescription}
                  placeholder="Enter channel description..."
                  focused
                />
              ) : (
                <text fg={description() ? "white" : "gray"}>
                  {description() || "Enter channel description..."}
                </text>
              )}
            </box>
          </box>

          <box marginTop={1}>
            <text fg={activeField() === "submit" ? "#00FF00" : "white"}>
              <strong>{activeField() === "submit" ? "> " : "  "}[{isSubmitting() ? "Creating..." : "Create Channel"}]</strong>
            </text>
          </box>

          <Show when={error()}>
            <box marginTop={1}>
              <text fg="red">{error()}</text>
            </box>
          </Show>

          <box flexGrow={1} />

          <box border borderStyle="single" borderColor="gray" paddingLeft={1} paddingRight={1}>
            <box flexDirection="column">
              <box flexDirection="row">
                <text fg="cyan">Tab/Down</text>
                <text fg="#888888"> Next field</text>
              </box>
              <box flexDirection="row">
                <text fg="cyan">Shift+Tab/Up</text>
                <text fg="#888888"> Previous field</text>
              </box>
              <box flexDirection="row">
                <text fg="cyan">Enter</text>
                <text fg="#888888"> Submit (when on button)</text>
              </box>
              <box flexDirection="row">
                <text fg="cyan">ESC</text>
                <text fg="#888888"> Back to menu</text>
              </box>
            </box>
          </box>
        </box>
      </Layout.Content>
      <Layout.Footer>
        <StatusBar
          connectionStatus={chat.connectionStatus()}
          error={error()}
          backLabel="Menu"
          backShortcut="ESC"
          title={
            <text fg="cyan" truncate flexShrink={1} minWidth={0}>
              <strong>Create New Private Channel</strong>
            </text>
          }
          showUserToggle={false}
        />
      </Layout.Footer>
    </Layout>
  )
}

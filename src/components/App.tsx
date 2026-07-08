// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { Match, Switch, createMemo, createSignal } from "solid-js"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid"
import { AuthProvider, useAuth } from "../stores/auth-store"
import { OrgProvider, useOrgStore } from "../stores/org-store"
import { ChannelProvider } from "../stores/channel-store"
import { ChatProvider, useChatStore } from "../stores/chat-store"
import { StatusMessageProvider, useStatusMessage } from "../stores/status-message-store"
import { LoginScreen } from "../pages/LoginScreen"
import { OrgSelectScreen } from "../pages/OrgSelectScreen"
import { RemoteControlView } from "../pages/RemoteControlView"

const CTRL_C_TIMEOUT_MS = 3000

function AppContent() {
  const auth = useAuth()
  const org = useOrgStore()
  const chat = useChatStore()
  const renderer = useRenderer()
  const dimensions = useTerminalDimensions()
  const statusMessage = useStatusMessage()
  const [lastCtrlC, setLastCtrlC] = createSignal(0)

  const topPadding = createMemo(() => (process.env.TERM_PROGRAM === "WarpTerminal" ? 1 : 0))
  const width = () => dimensions().width
  const height = () => dimensions().height

  useKeyboard((key) => {
    if (key.ctrl && key.name === "c") {
      const now = Date.now()
      if (now - lastCtrlC() < CTRL_C_TIMEOUT_MS) {
        // Disconnect WebSocket before destroying renderer
        const manager = chat.channelManager()
        if (manager) {
          manager.disconnect()
        }
        renderer.destroy()
        // Restore terminal: show cursor, reset attributes, print newline
        process.stdout.write("\x1b[?25h\x1b[0m\n")
        process.exit(0)
      } else {
        setLastCtrlC(now)
        statusMessage.pushMessage("Press Ctrl+C again to exit", "info", CTRL_C_TIMEOUT_MS)
      }
      return
    }

    if (key.ctrl && key.name === "o") {
      if (auth.authState() === "authenticated") {
        void auth.logout()
      }
      return
    }
  })

  return (
    <Switch>
      <Match when={auth.authState() !== "authenticated"}>
        <LoginScreen
          onLogin={auth.login}
          status={auth.authStatus()}
          isLoading={auth.authState() === "authenticating"}
        />
      </Match>

      {/* 2+ orgs and no stored choice: pick before the remote goes online. */}
      <Match when={org.needsSelection()}>
        <OrgSelectScreen width={width()} height={height()} topPadding={topPadding()} />
      </Match>

      {/* The whole product: the remote control panel. The socket/user-channel
          machinery (and the agent runner it feeds) lives in ChatProvider, so
          it serves agent:run pushes underneath this view. The old full chat
          UI is preserved under archived/chat-ui/. */}
      <Match when={true}>
        <RemoteControlView width={width()} height={height()} topPadding={topPadding()} />
      </Match>
    </Switch>
  )
}

export default function App() {
  return (
    <AuthProvider autoCheck>
      <OrgProvider>
        <ChannelProvider>
          <ChatProvider>
            <StatusMessageProvider>
              <AppContent />
            </StatusMessageProvider>
          </ChatProvider>
        </ChannelProvider>
      </OrgProvider>
    </AuthProvider>
  )
}

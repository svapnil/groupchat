// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { Match, Switch, createEffect, createMemo, createSignal } from "solid-js"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid"
import { Router, useNavigation } from "./Router"
import { AuthProvider, useAuth } from "../stores/auth-store"
import { ChannelProvider, useChannelsStore } from "../stores/channel-store"
import { ChatProvider, useChatStore } from "../stores/chat-store"
import { DmProvider, useDmStore } from "../stores/dm-store"
import { StatusMessageProvider, useStatusMessage } from "../stores/status-message-store"
import { LoginScreen } from "../pages/LoginScreen"
import { Menu } from "../pages/Menu"
import { ChatView } from "../pages/ChatView"
import { CreateChannelScreen } from "../pages/CreateChannelScreen"
import { DmInbox } from "../pages/DmInbox"
import { DmChatView } from "../pages/DmChatView"

const CTRL_C_TIMEOUT_MS = 3000

function AppContent() {
  const auth = useAuth()
  const navigation = useNavigation()
  const channels = useChannelsStore()
  const chat = useChatStore()
  const dms = useDmStore()
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

    if (key.name === "escape") {
      navigation.navigate("menu")
    }
  })

  createEffect(() => {
    if (navigation.route() === "menu") {
      void channels.refetchUnreadCounts()
      void dms.refetch()
    }
  })

  createEffect(() => {
    if (navigation.route() !== "dm-inbox") {
      dms.setShouldStartDmSearch(false)
    }
  })

  return (
    <Switch>
      <Match when={auth.authState() !== "authenticated" || navigation.route() === "login"}>
        <LoginScreen
          onLogin={auth.login}
          status={auth.authStatus()}
          isLoading={auth.authState() === "authenticating"}
        />
      </Match>

      <Match when={navigation.route() === "menu"}>
        <Menu width={width()} height={height()} topPadding={topPadding()} />
      </Match>

      <Match when={navigation.route() === "chat"}>
        <ChatView width={width()} height={height()} topPadding={topPadding()} />
      </Match>

      <Match when={navigation.route() === "create-channel"}>
        <CreateChannelScreen width={width()} height={height()} topPadding={topPadding()} />
      </Match>

      <Match when={navigation.route() === "dm-inbox"}>
        <DmInbox width={width()} height={height()} topPadding={topPadding()} />
      </Match>

      <Match when={navigation.route() === "dm-chat"}>
        <DmChatView width={width()} height={height()} topPadding={topPadding()} />
      </Match>

      <Match when={true}>
        <Menu width={width()} height={height()} topPadding={topPadding()} />
      </Match>
    </Switch>
  )
}

export default function App() {
  return (
    <AuthProvider autoCheck>
      <ChannelProvider>
        <ChatProvider>
          <DmProvider>
            <StatusMessageProvider>
              <Router initialRoute="menu">
                <AppContent />
              </Router>
            </StatusMessageProvider>
          </DmProvider>
        </ChatProvider>
      </ChannelProvider>
    </AuthProvider>
  )
}

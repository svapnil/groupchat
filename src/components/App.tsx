import React, { useState, useEffect, useCallback, useRef } from "react";
import { Box, useApp, useInput, useStdout } from "ink";
import { LoginScreen } from "./LoginScreen.js";
import { Menu } from "./Menu.js";
import { ChatView } from "./ChatView.js";
import { useMultiChannelChat } from "../hooks/use-multi-channel-chat.js";
import { usePresence } from "../hooks/use-presence.js";
import { useChannels } from "../hooks/use-channels.js";
import {
  isAuthenticated,
  getCurrentToken,
  login,
  logout,
} from "../auth/auth-manager.js";
import type { AuthState } from "../lib/types.js";

export function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const isWarp = process.env.TERM_PROGRAM === "WarpTerminal";
  const topPadding = isWarp ? 1 : 0;
  const [authState, setAuthState] = useState<AuthState>("unauthenticated");
  const [authStatus, setAuthStatus] = useState<string>("");
  const [token, setToken] = useState<string | null>(null);
  const [terminalSize, setTerminalSize] = useState({
    rows: stdout?.rows || 24,
    columns: stdout?.columns || 80,
  });

  // Scroll state for message list
  const [scrollOffset, setScrollOffset] = useState(0); // 0 = at bottom (tailing)
  const [isScrollDetached, setIsScrollDetached] = useState(false);

  // User list visibility
  const [showUserList, setShowUserList] = useState(true);

  // View/Page navigation
  const [currentView, setCurrentView] = useState<"menu" | "chat">("chat");
  const [currentChannel, setCurrentChannel] = useState("chat_room:global");
  const prevAuthStateRef = useRef<AuthState | null>(null);

  // Listen for terminal resize events
  useEffect(() => {
    if (!stdout) return;

    const handleResize = () => {
      setTerminalSize({
        rows: stdout.rows || 24,
        columns: stdout.columns || 80,
      });
    };

    stdout.on("resize", handleResize);

    return () => {
      stdout.off("resize", handleResize);
    };
  }, [stdout]);

  // Clear screen only when transitioning from authenticated -> unauthenticated
  useEffect(() => {
    if (!stdout) return;
    if (prevAuthStateRef.current === "authenticated" && authState !== "authenticated") {
      stdout.write("\x1b[2J\x1b[0f");
    }
    prevAuthStateRef.current = authState;
  }, [authState, stdout]);

  // Check auth on mount
  useEffect(() => {
    async function checkAuth() {
      const authenticated = await isAuthenticated();
      if (authenticated) {
        const stored = await getCurrentToken();
        if (stored) {
          setToken(stored.token);
          setAuthState("authenticated");
        }
      }
    }
    checkAuth();
  }, []);

  // Channels hook - fetch available channels
  const { publicChannels, privateChannels } = useChannels(token);

  // Multi-channel chat hook - maintains persistent connection
  const {
    messages,
    connectionStatus,
    username,
    error,
    sendMessage,
    startTyping,
    stopTyping,
    typingUsers,
    presenceState,
    connect,
    disconnect,
  } = useMultiChannelChat(token, currentChannel);

  // Presence hook
  const { users } = usePresence(presenceState);

  // Find current channel details
  const allChannels = [...publicChannels, ...privateChannels];
  const currentChannelDetails = allChannels.find((ch) => ch.slug === currentChannel);

  // Handle login
  const handleLogin = useCallback(async () => {
    setAuthState("authenticating");
    setAuthStatus("Starting login...");

    const result = await login((status) => setAuthStatus(status));

    if (result.success) {
      const stored = await getCurrentToken();
      if (stored) {
        setToken(stored.token);
        setAuthState("authenticated");
        setAuthStatus("");
      }
    } else {
      setAuthState("unauthenticated");
      setAuthStatus(result.error || "Login failed");
    }
  }, []);

  // Handle logout
  const handleLogout = useCallback(async () => {
    disconnect();
    setToken(null);
    setAuthState("unauthenticated");
    setAuthStatus("");
    try {
      await logout();
    } catch {
      setAuthStatus("Logged out locally; failed to clear credentials.");
    }
  }, [disconnect]);

  // Calculate max visible messages for scroll bounds
  const headerHeight = 3;
  const inputBoxHeight = 4;
  const statusBarHeight = 1;
  const middleSectionHeight = Math.max(
    5,
    terminalSize.rows - topPadding - headerHeight - inputBoxHeight - statusBarHeight
  );
  const linesPerMessage = 2;
  const maxVisibleMessages = Math.floor(middleSectionHeight / linesPerMessage);

  // Global keyboard shortcuts
  useInput((input, key) => {
    // Ctrl+C to exit
    if (input === "c" && key.ctrl) {
      disconnect();
      exit();
    }
    // Ctrl+O to logout (when authenticated)
    if (input === "o" && key.ctrl && authState === "authenticated") {
      handleLogout();
    }

    // Ctrl+E to toggle user list (when authenticated)
    if (input === "e" && key.ctrl && authState === "authenticated") {
      setShowUserList((prev) => !prev);
    }

    // Ctrl+Q to navigate to menu (when authenticated and in chat view)
    if (input === "q" && key.ctrl && authState === "authenticated" && currentView === "chat") {
      setCurrentView("menu");
    }

    // Up/Down arrow keys for scrolling (only when authenticated)
    if (authState === "authenticated") {
      const maxOffset = Math.max(0, messages.length - maxVisibleMessages);

      if (key.upArrow) {
        // Scroll up (increase offset from bottom)
        setScrollOffset((prev) => {
          const newOffset = Math.min(prev + 1, maxOffset);
          if (newOffset > 0) {
            setIsScrollDetached(true);
          }
          return newOffset;
        });
      }

      if (key.downArrow) {
        // Scroll down (decrease offset from bottom)
        setScrollOffset((prev) => {
          const newOffset = Math.max(prev - 1, 0);
          if (newOffset === 0) {
            setIsScrollDetached(false);
          }
          return newOffset;
        });
      }
    }
  });

  // No longer needed! Connection is managed automatically by useMultiChannelChat.
  // The hook maintains a persistent connection and fetches history when currentChannel changes.

  // Show login screen if not authenticated
  if (authState !== "authenticated") {
    return (
      <Box
        flexDirection="column"
        width={terminalSize.columns}
        height={terminalSize.rows}
        overflow="hidden"
      >
        <LoginScreen
          onLogin={handleLogin}
          status={authStatus}
          isLoading={authState === "authenticating"}
        />
      </Box>
    );
  }

  // Show Menu page
  if (currentView === "menu") {
    return (
      <Box
        flexDirection="column"
        width={terminalSize.columns}
        height={terminalSize.rows}
        overflow="hidden"
      >
        <Menu
          width={terminalSize.columns}
          height={terminalSize.rows}
          currentChannel={currentChannel}
          onChannelSelect={setCurrentChannel}
          onBack={() => setCurrentView("chat")}
          username={username}
          connectionStatus={connectionStatus}
          onLogout={handleLogout}
          topPadding={topPadding}
          publicChannels={publicChannels}
          privateChannels={privateChannels}
        />
      </Box>
    );
  }

  // Show Chat view
  return (
    <ChatView
      terminalSize={terminalSize}
      currentChannel={currentChannel}
      channelName={currentChannelDetails?.name}
      channelDescription={currentChannelDetails?.description || undefined}
      connectionStatus={connectionStatus}
      username={username}
      onLogout={handleLogout}
      messages={messages}
      typingUsers={typingUsers}
      middleSectionHeight={middleSectionHeight}
      scrollOffset={scrollOffset}
      isDetached={isScrollDetached}
      showUserList={showUserList}
      users={users}
      topPadding={topPadding}
      onSend={sendMessage}
      onTypingStart={startTyping}
      onTypingStop={stopTyping}
      error={error}
    />
  );
}

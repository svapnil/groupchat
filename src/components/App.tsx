import React, { useState, useEffect, useCallback } from "react";
import { Box, useApp, useInput, useStdout } from "ink";
import { Header } from "./Header.js";
import { MessageList } from "./MessageList.js";
import { UserList } from "./UserList.js";
import { InputBox } from "./InputBox.js";
import { StatusBar } from "./StatusBar.js";
import { LoginScreen } from "./LoginScreen.js";
import { useChat } from "../hooks/use-chat.js";
import { usePresence } from "../hooks/use-presence.js";
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
  const [authState, setAuthState] = useState<AuthState>("unauthenticated");
  const [authStatus, setAuthStatus] = useState<string>("");
  const [token, setToken] = useState<string | null>(null);
  const [terminalSize, setTerminalSize] = useState({
    rows: stdout?.rows || 24,
    columns: stdout?.columns || 80,
  });

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

  // Chat hook - only active when authenticated
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
  } = useChat(token);

  // Presence hook
  const { users } = usePresence(presenceState);

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
    await logout();
    setToken(null);
    setAuthState("unauthenticated");
  }, [disconnect]);

  // Global keyboard shortcuts
  useInput((input, key) => {
    // Ctrl+C to exit
    if (input === "c" && key.ctrl) {
      disconnect();
      exit();
    }
    // Ctrl+L to logout (when authenticated)
    if (input === "l" && key.ctrl && authState === "authenticated") {
      handleLogout();
    }
  });

  // Connect when token is available
  useEffect(() => {
    if (token && authState === "authenticated") {
      connect();
    }
  }, [token, authState, connect]);

  // Show login screen if not authenticated
  if (authState !== "authenticated") {
    return (
      <LoginScreen
        onLogin={handleLogin}
        status={authStatus}
        isLoading={authState === "authenticating"}
      />
    );
  }

  // Calculate explicit heights for layout
  // Header: 3 lines (border + content + border)
  // InputBox: 4 lines (border + 2 content lines + border)
  // StatusBar: 1 line
  const headerHeight = 3;
  const inputBoxHeight = 4;
  const statusBarHeight = 1;
  const middleSectionHeight = Math.max(
    5,
    terminalSize.rows - headerHeight - inputBoxHeight - statusBarHeight
  );

  return (
    <Box
      flexDirection="column"
      width={terminalSize.columns}
      height={terminalSize.rows}
      overflow="hidden"
    >
      <Header
        username={username}
        roomName="chat_room:global"
        connectionStatus={connectionStatus}
        onLogout={handleLogout}
      />

      <Box flexDirection="row" height={middleSectionHeight} overflow="hidden">
        <Box flexGrow={1} flexDirection="column" overflow="hidden">
          <MessageList
            messages={messages}
            currentUsername={username}
            typingUsers={typingUsers}
            height={middleSectionHeight}
          />
        </Box>
        <UserList users={users} currentUsername={username} height={middleSectionHeight} />
      </Box>

      <InputBox
        onSend={sendMessage}
        onTypingStart={startTyping}
        onTypingStop={stopTyping}
        disabled={connectionStatus !== "connected"}
      />

      <StatusBar
        connectionStatus={connectionStatus}
        error={error}
        userCount={users.length}
      />
    </Box>
  );
}

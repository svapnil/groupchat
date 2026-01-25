import React, { useState, useEffect, useCallback, useRef } from "react";
import { Box, useApp, useInput, useStdout } from "ink";
import { LoginScreen } from "./LoginScreen.js";
import { Menu } from "./Menu.js";
import { ChatView } from "./ChatView.js";
import { CreateChannelScreen } from "./CreateChannelScreen.js";
import { DmInbox } from "./DmInbox.js";
import { DmConversation } from "./DmConversation.js";
import { useMultiChannelChat } from "../hooks/use-multi-channel-chat.js";
import { usePresence } from "../hooks/use-presence.js";
import { useAgentDetection } from "../hooks/use-agent-detection.js";
import { useChannels } from "../hooks/use-channels.js";
import { useDms } from "../hooks/use-dms.js";
import {
  isAuthenticated,
  getCurrentToken,
  login,
  logout,
} from "../auth/auth-manager.js";
import { Router, useNavigation } from "../routes/Router.js";
import { createChannel } from "../lib/chat-client.js";
import { getConfig } from "../lib/config.js";
import { getNotificationManager } from "../lib/notification-manager.js";
import type { AuthState, DmConversation as DmConvo } from "../lib/types.js";

export function App() {
  return (
    <Router initialRoute="menu">
      <AppContent />
    </Router>
  );
}

function AppContent() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const { route, navigate } = useNavigation();
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

  // Channel state
  const [currentChannel, setCurrentChannel] = useState("chat_room:global");
  const prevAuthStateRef = useRef<AuthState | null>(null);

  // DM state
  const [currentDm, setCurrentDm] = useState<DmConvo | null>(null);
  const [shouldStartDmSearch, setShouldStartDmSearch] = useState(false);

  // Initialize NotificationManager with stdout
  useEffect(() => {
    if (stdout) {
      getNotificationManager().setStdout(stdout);
    }
  }, [stdout]);

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
  const { publicChannels, privateChannels, unreadCounts, loading: isLoadingChannels, refetchUnreadCounts, refetch: refetchChannels, incrementUnreadCount, clearUnreadCount, totalUnreadCount } = useChannels(token);

  // DMs hook - fetch DM conversations
  const {
    conversations: dmConversations,
    loading: isLoadingDms,
    totalDmUnreadCount,
    refetch: refetchDms,
  } = useDms(token);

  // Combined total unread count (channels + DMs)
  const combinedTotalUnreadCount = totalUnreadCount + totalDmUnreadCount;

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
    subscribers,
    connect,
    disconnect,
    channelManager,
  } = useMultiChannelChat(token, currentChannel, refetchChannels, incrementUnreadCount);

  // Presence hook
  const { users } = usePresence(presenceState, subscribers, currentChannel);

  // Add agent detection
  useAgentDetection(channelManager, connectionStatus === "connected");

  // Command send handler
  const sendCommand = useCallback(
    async (eventType: string, data: any) => {
      if (!channelManager) {
        throw new Error("Not connected");
      }
      await channelManager.sendCommand(currentChannel, eventType, data);
    },
    [currentChannel, channelManager]
  );

  // Find current channel details
  const allChannels = [...publicChannels, ...privateChannels];
  const currentChannelDetails = allChannels.find((ch) => ch.slug === currentChannel);
  const isPrivateChannel = currentChannel.startsWith("private_room:");

  // Track previous channel for mark as read
  const prevChannelForMarkAsReadRef = useRef<string | null>(null);
  const markedAsReadOnEntryRef = useRef<Set<string>>(new Set());

  // Mark channel as read when entering/exiting
  useEffect(() => {
    const markChannelAsRead = async (channelSlug: string, isEntry: boolean) => {
      if (!channelManager) {
        return;
      }

      try {
        if (isEntry) {
          // Check if this is the first time entering this channel
          if (!markedAsReadOnEntryRef.current.has(channelSlug)) {
            // First time - mark all as read
            await channelManager.markAllMessagesAsRead(channelSlug);
            markedAsReadOnEntryRef.current.add(channelSlug);
          } else {
            // Subsequent entry - mark as read up to current seq_no
            await channelManager.markChannelAsRead(channelSlug);
          }
        } else {
          // Exiting channel - mark as read
          await channelManager.markChannelAsRead(channelSlug);
        }

        // Refetch unread counts to update UI
        await refetchUnreadCounts();
      } catch (err) {
        console.error(`Failed to mark ${channelSlug} as read:`, err);
      }
    };

    // When currentChannel changes
    if (currentChannel !== prevChannelForMarkAsReadRef.current) {
      // Mark previous channel as read (on exit)
      if (prevChannelForMarkAsReadRef.current) {
        markChannelAsRead(prevChannelForMarkAsReadRef.current, false);
      }

      // Mark new channel as read (on entry)
      if (currentChannel) {
        markChannelAsRead(currentChannel, true);
        // Clear local unread count for this channel
        clearUnreadCount(currentChannel);
      }

      prevChannelForMarkAsReadRef.current = currentChannel;
    }
  }, [currentChannel, channelManager, refetchUnreadCounts, clearUnreadCount]);

  // Also mark as read on app unmount (cleanup)
  useEffect(() => {
    return () => {
      if (currentChannel && channelManager) {
        channelManager.markChannelAsReadBestEffort(currentChannel);
      }
    };
  }, [currentChannel, channelManager]);

  // Refetch unread counts and DM conversations when navigating to menu
  useEffect(() => {
    if (route === "menu") {
      refetchUnreadCounts();
      refetchDms();
    }
  }, [route, refetchUnreadCounts, refetchDms]);

  // Reset search mode flag when leaving dm-inbox
  useEffect(() => {
    if (route !== "dm-inbox") {
      setShouldStartDmSearch(false);
    }
  }, [route]);

  // Reset scroll state when channel changes
  useEffect(() => {
    setScrollOffset(0);
    setIsScrollDetached(false);
  }, [currentChannel]);

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
    // Mark current channel as read before disconnecting
    if (currentChannel && channelManager) {
      channelManager.markChannelAsReadBestEffort(currentChannel);
    }
    disconnect();
    setToken(null);
    setAuthState("unauthenticated");
    setAuthStatus("");
    try {
      await logout();
    } catch {
      setAuthStatus("Logged out locally; failed to clear credentials.");
    }
  }, [disconnect, currentChannel, channelManager]);

  // Handle create channel
  const handleCreateChannel = useCallback(async (name: string, description: string) => {
    if (!token) {
      throw new Error("Not authenticated");
    }
    const config = getConfig();
    await createChannel(config.wsUrl, token, name, description || undefined);
    await refetchChannels();
  }, [token, refetchChannels]);

  // Handle DM selection from Menu
  const handleDmSelect = useCallback((dm: DmConvo) => {
    setCurrentDm(dm);
    navigate("dm-chat");
  }, [navigate]);

  // Handle new DM action
  const handleNewDm = useCallback(() => {
    setShouldStartDmSearch(true);
    navigate("dm-inbox");
  }, [navigate]);

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
      // Mark current channel as read before disconnecting
      if (currentChannel && channelManager) {
        channelManager.markChannelAsReadBestEffort(currentChannel);
      }
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

    // Shift+Tab to navigate to menu (when authenticated and in chat view)
    if (key.tab && key.shift && authState === "authenticated" && route === "chat") {
      navigate("menu");
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
  if (route === "menu") {
    // Get aggregated presence across all channels for "At a Glance" section
    const aggregatedPresence = channelManager?.getAggregatedPresence() || {};

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
          username={username}
          connectionStatus={connectionStatus}
          onLogout={handleLogout}
          topPadding={topPadding}
          publicChannels={publicChannels}
          privateChannels={privateChannels}
          unreadCounts={unreadCounts}
          aggregatedPresence={aggregatedPresence}
          isLoadingChannels={isLoadingChannels}
          totalUnreadCount={combinedTotalUnreadCount}
          dmConversations={dmConversations}
          isLoadingDms={isLoadingDms}
          onDmSelect={handleDmSelect}
          onNewDm={handleNewDm}
        />
      </Box>
    );
  }

  // Show Create Channel page
  if (route === "create-channel") {
    return (
      <Box
        flexDirection="column"
        width={terminalSize.columns}
        height={terminalSize.rows}
        overflow="hidden"
      >
        <CreateChannelScreen
          width={terminalSize.columns}
          height={terminalSize.rows}
          username={username}
          connectionStatus={connectionStatus}
          onLogout={handleLogout}
          onCreateChannel={handleCreateChannel}
          topPadding={topPadding}
          totalUnreadCount={combinedTotalUnreadCount}
        />
      </Box>
    );
  }

  // Show DM Inbox page
  if (route === "dm-inbox") {
    const handleSelectDm = (dm: DmConvo) => {
      setCurrentDm(dm);
      navigate("dm-chat");
    };

    return (
      <Box
        flexDirection="column"
        width={terminalSize.columns}
        height={terminalSize.rows}
        overflow="hidden"
      >
        <DmInbox
          width={terminalSize.columns}
          height={terminalSize.rows}
          username={username}
          connectionStatus={connectionStatus}
          token={token}
          onLogout={handleLogout}
          onSelectDm={handleSelectDm}
          topPadding={topPadding}
          totalUnreadCount={combinedTotalUnreadCount}
          startInSearchMode={shouldStartDmSearch}
        />
      </Box>
    );
  }

  // Show DM Conversation page
  if (route === "dm-chat" && currentDm) {
    return (
      <Box
        flexDirection="column"
        width={terminalSize.columns}
        height={terminalSize.rows}
        overflow="hidden"
      >
        <DmConversation
          terminalSize={terminalSize}
          dm={currentDm}
          connectionStatus={connectionStatus}
          username={username}
          channelManager={channelManager}
          token={token}
          onLogout={handleLogout}
          topPadding={topPadding}
          totalUnreadCount={combinedTotalUnreadCount}
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
      subscribers={subscribers}
      isPrivateChannel={isPrivateChannel}
      topPadding={topPadding}
      onSend={sendMessage}
      onTypingStart={startTyping}
      onTypingStop={stopTyping}
      onCommandSend={sendCommand}
      error={error}
      token={token}
      totalUnreadCount={combinedTotalUnreadCount}
    />
  );
}

import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { Header } from "./Header.js";
import { Layout } from "./Layout.js";
import { StatusBar } from "./StatusBar.js";
import { InputBox } from "./InputBox.js";
import { MessageList } from "./MessageList.js";
import { useNavigation } from "../routes/Router.js";
import { fetchDmMessages } from "../lib/chat-client.js";
import { getConfig } from "../lib/config.js";
import { ChannelManager } from "../lib/channel-manager.js";
import { getAgentColor, getAgentDisplayName } from "../lib/constants.js";
import type { DmConversation as DmConvo, Message, ConnectionStatus, DmMessage, PresenceState } from "../lib/types.js";

interface DmConversationProps {
  terminalSize: { rows: number; columns: number };
  dm: DmConvo;
  connectionStatus: ConnectionStatus;
  username: string | null;
  channelManager: ChannelManager | null;
  token: string | null;
  onLogout: () => void;
  topPadding: number;
  totalUnreadCount: number;
  globalPresence: PresenceState;
}

export function DmConversation({
  terminalSize,
  dm,
  connectionStatus,
  username,
  channelManager,
  token,
  onLogout,
  topPadding,
  totalUnreadCount,
  globalPresence,
}: DmConversationProps) {
  const presenceData = globalPresence[dm.other_username];
  const isOtherUserOnline = !!presenceData;
  const currentAgent = presenceData?.metas[0]?.current_agent;
  const agentDisplayName = currentAgent ? getAgentDisplayName(currentAgent) : null;
  const agentColor = currentAgent ? getAgentColor(currentAgent) : undefined;
  const { navigate } = useNavigation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);

  // Scroll state
  const [scrollOffset, setScrollOffset] = useState(0);
  const [isScrollDetached, setIsScrollDetached] = useState(false);

  // Fetch message history
  useEffect(() => {
    if (!token || !dm) return;

    const fetchHistory = async () => {
      setLoading(true);
      try {
        const config = getConfig();
        const data = await fetchDmMessages(config.wsUrl, token, dm.slug);
        setMessages(data.messages || []);
        setError(null);
      } catch (err) {
        setError("Failed to load messages");
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [token, dm?.slug]);

  // Mark DM as read on entry
  useEffect(() => {
    if (channelManager && dm) {
      channelManager.markDmAsRead(dm.slug).catch(() => {
        // Ignore errors
      });
    }
  }, [channelManager, dm?.slug]);

  // Handle incoming DM messages
  useEffect(() => {
    if (!channelManager) return;

    const handleDmMessage = (msg: DmMessage) => {
      if (msg.dm_slug === dm.slug) {
        // Convert DmMessage to Message format
        const message: Message = {
          id: msg.id,
          username: msg.username,
          content: msg.content,
          timestamp: new Date().toISOString(),
          attributes: msg.attributes,
        };
        setMessages((prev) => [...prev, message]);

        // Auto-scroll to bottom when new message arrives (if not detached)
        if (!isScrollDetached) {
          setScrollOffset(0);
        }
      }
    };

    const handleTypingStart = (dmSlug: string, user: string) => {
      if (dmSlug === dm.slug && user !== username) {
        setTypingUsers((prev) => (prev.includes(user) ? prev : [...prev, user]));
      }
    };

    const handleTypingStop = (dmSlug: string, user: string) => {
      if (dmSlug === dm.slug) {
        setTypingUsers((prev) => prev.filter((existingUser) => existingUser !== user));
      }
    };

    // Subscribe to callbacks - chain to existing handlers so useDms continues to work
    const originalOnDmMessage = channelManager["callbacks"].onDmMessage;
    const originalOnDmTypingStart = channelManager["callbacks"].onDmTypingStart;
    const originalOnDmTypingStop = channelManager["callbacks"].onDmTypingStop;

    channelManager["callbacks"].onDmMessage = (msg: DmMessage) => {
      handleDmMessage(msg);
      originalOnDmMessage?.(msg);
    };
    channelManager["callbacks"].onDmTypingStart = handleTypingStart;
    channelManager["callbacks"].onDmTypingStop = handleTypingStop;

    return () => {
      // Restore original callbacks
      channelManager["callbacks"].onDmMessage = originalOnDmMessage;
      channelManager["callbacks"].onDmTypingStart = originalOnDmTypingStart;
      channelManager["callbacks"].onDmTypingStop = originalOnDmTypingStop;
    };
  }, [channelManager, dm?.slug, username, isScrollDetached]);

  // Send message handler - non-blocking for responsive UI
  const handleSendMessage = useCallback(async (content: string) => {
    if (!channelManager || !dm) return;

    // DELIVERED: Return immediately so InputBox clears the input without waiting
    // Fire off the actual send in the background
    channelManager.sendDmMessage(dm.slug, content).catch(() => {
      // ACKNOWLEDGED (error): Server rejected the message
      setError("Failed to send message");
    });

    // ACKNOWLEDGED (success): Message appears when server broadcasts dm:new_message back
  }, [channelManager, dm]);

  // Typing handlers
  const handleTypingStart = useCallback(() => {
    if (!channelManager || !dm) return;
    channelManager.startDmTyping(dm.slug);
  }, [channelManager, dm]);

  const handleTypingStop = useCallback(() => {
    if (!channelManager || !dm) return;
    channelManager.stopDmTyping(dm.slug);
  }, [channelManager, dm]);

  // Calculate layout
  const headerHeight = 3;
  const inputBoxHeight = 4;
  const statusBarHeight = 1;
  const middleSectionHeight = Math.max(
    5,
    terminalSize.rows - topPadding - headerHeight - inputBoxHeight - statusBarHeight
  );
  const linesPerMessage = 2;
  const maxVisibleMessages = Math.floor(middleSectionHeight / linesPerMessage);
  const maxOffset = Math.max(0, messages.length - maxVisibleMessages);

  useInput((input, key) => {
    // Navigate back
    if (key.escape || (key.shift && key.tab)) {
      // Mark as read before leaving
      if (channelManager && dm) {
        channelManager.markDmAsRead(dm.slug).catch(() => {});
      }
      navigate("dm-inbox");
      return;
    }

    // Scroll up
    if (key.upArrow) {
      setScrollOffset((prev) => {
        const newOffset = Math.min(prev + 1, maxOffset);
        if (newOffset > 0) setIsScrollDetached(true);
        return newOffset;
      });
      return;
    }

    // Scroll down
    if (key.downArrow) {
      setScrollOffset((prev) => {
        const newOffset = Math.max(prev - 1, 0);
        if (newOffset === 0) setIsScrollDetached(false);
        return newOffset;
      });
      return;
    }
  });

  return (
    <Layout width={terminalSize.columns} height={terminalSize.rows} topPadding={topPadding}>
      <Layout.Header>
        <Header
          roomName={`DM with @${dm.other_username}`}
          username={username}
          connectionStatus={connectionStatus}
          onLogout={onLogout}
          title={
            <Text bold color="cyan">
              <Text color={isOtherUserOnline ? "green" : "gray"}>●</Text> {dm.other_username}
              {agentDisplayName && (
                <Text bold={false} color={agentColor}>
                  {" "}- Using {agentDisplayName}
                </Text>
              )}
            </Text>
          }
        />
      </Layout.Header>

      <Layout.Content>
        <Box flexDirection="column" height={middleSectionHeight}>
          {loading ? (
            <Box paddingX={1}>
              <Text color="gray">Loading messages...</Text>
            </Box>
          ) : error ? (
            <Box paddingX={1}>
              <Text color="red">{error}</Text>
            </Box>
          ) : (
            <MessageList
              messages={messages}
              currentUsername={username}
              typingUsers={typingUsers}
              height={middleSectionHeight}
              scrollOffset={scrollOffset}
              isDetached={isScrollDetached}
            />
          )}
        </Box>
      </Layout.Content>

      <Layout.Footer>
        <InputBox
          onSend={handleSendMessage}
          onTypingStart={handleTypingStart}
          onTypingStop={handleTypingStop}
          disabled={connectionStatus !== "connected"}
          placeholder={`Message @${dm.other_username}...`}
        />
        <StatusBar
          connectionStatus={connectionStatus}
          error={error}
          userCount={2}
        />
      </Layout.Footer>
    </Layout>
  );
}

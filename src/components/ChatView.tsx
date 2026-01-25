import React, { useEffect, useState, useCallback } from "react";
import { Box, Text, useStdout } from "ink";
import { Header } from "./Header.js";
import { Layout } from "./Layout.js";
import { MessageList } from "./MessageList.js";
import { UserList } from "./UserList.js";
import { StatusBar } from "./StatusBar.js";
import { CommandInputPanel } from "./CommandInputPanel.js";
import type { ConnectionStatus, Message, Subscriber } from "../lib/types.js";
import type { UserWithStatus } from "../hooks/use-presence.js";

interface ChatViewProps {
  terminalSize: { rows: number; columns: number };
  currentChannel: string;
  channelName?: string;
  channelDescription?: string;
  connectionStatus: ConnectionStatus;
  username: string | null;
  onLogout: () => void;
  messages: Message[];
  typingUsers: string[];
  middleSectionHeight: number;
  scrollOffset: number;
  isDetached: boolean;
  showUserList: boolean;
  users: UserWithStatus[];
  subscribers: Subscriber[];
  isPrivateChannel?: boolean;
  topPadding?: number;
  onSend: (message: string) => Promise<void>;
  onTypingStart: () => void;
  onTypingStop: () => void;
  onCommandSend: (eventType: string, data: any) => Promise<void>;
  error: string | null;
  token: string | null;
  totalUnreadCount?: number;
}

export function ChatView({
  terminalSize,
  currentChannel,
  channelName,
  channelDescription,
  connectionStatus,
  username,
  onLogout,
  messages,
  typingUsers,
  middleSectionHeight,
  scrollOffset,
  isDetached,
  showUserList,
  users,
  subscribers,
  isPrivateChannel = false,
  topPadding = 0,
  onSend,
  onTypingStart,
  onTypingStop,
  onCommandSend,
  error,
  token,
  totalUnreadCount = 0,
}: ChatViewProps) {
  const { stdout } = useStdout();
  const [tooltipHeight, setTooltipHeight] = useState(0);
  const handleTooltipHeightChange = useCallback((nextHeight: number) => {
    setTooltipHeight((prev) => (prev === nextHeight ? prev : nextHeight));
  }, []);

  // Display name: use channel name if available, otherwise fall back to slug
  const displayName = channelName || currentChannel;
  const displayText = channelDescription
    ? `${displayName} - ${channelDescription}`
    : displayName;

  // Update terminal tab title for chat view
  useEffect(() => {
    if (!stdout) return;
    const prefix = connectionStatus === "connected" ? "• " : "";
    const unreadSuffix = totalUnreadCount > 0 ? ` (${totalUnreadCount})` : "";
    stdout.write(`\x1b]0;${prefix}#${displayName}${unreadSuffix}\x07`);
  }, [stdout, connectionStatus, displayName, totalUnreadCount]);

  return (
    <Layout width={terminalSize.columns} height={terminalSize.rows} topPadding={topPadding}>
      <Layout.Header>
        <Header
          username={username}
          roomName={currentChannel}
          connectionStatus={connectionStatus}
          onLogout={onLogout}
          title={
            <>
              <Text color="gray">← Menu </Text>
              <Text color="gray" dimColor>[SHIFT+TAB]</Text>
              <Text color="gray"> | </Text>
              <Text color="cyan" bold>#{displayText}</Text>
            </>
          }
        />
      </Layout.Header>

      <Layout.Content>
        <Box
          flexDirection="row"
          height={Math.max(1, middleSectionHeight - tooltipHeight)}
          overflow="hidden"
        >
          <Box flexGrow={1} flexDirection="column" overflow="hidden">
            <MessageList
              messages={messages}
              currentUsername={username}
              typingUsers={typingUsers}
              height={Math.max(1, middleSectionHeight - tooltipHeight)}
              scrollOffset={scrollOffset}
              isDetached={isDetached}
            />
          </Box>
          {showUserList && (
            <UserList
              users={users}
              currentUsername={username}
              // 1 below header and 1 above tooltip
              height={Math.max(1, middleSectionHeight - tooltipHeight - 2)}
              isPrivateChannel={isPrivateChannel}
            />
          )}
        </Box>

        <CommandInputPanel
          token={token}
          currentChannel={currentChannel}
          isPrivateChannel={isPrivateChannel}
          connectionStatus={connectionStatus}
          username={username}
          users={users}
          subscribers={subscribers}
          onSend={onSend}
          onTypingStart={onTypingStart}
          onTypingStop={onTypingStop}
          onCommandSend={onCommandSend}
          onTooltipHeightChange={handleTooltipHeightChange}
        />

        <StatusBar
          connectionStatus={connectionStatus}
          error={error}
          userCount={users.length}
        />
      </Layout.Content>
    </Layout>
  );
}

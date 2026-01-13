import React, { useEffect } from "react";
import { Box, Text, useStdout } from "ink";
import { Header } from "./Header.js";
import { MessageList } from "./MessageList.js";
import { UserList } from "./UserList.js";
import { InputBox } from "./InputBox.js";
import { StatusBar } from "./StatusBar.js";
import type { ConnectionStatus, Message, User } from "../lib/types.js";

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
  users: User[];
  topPadding?: number;
  onSend: (message: string) => Promise<void>;
  onTypingStart: () => void;
  onTypingStop: () => void;
  error: string | null;
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
  topPadding = 0,
  onSend,
  onTypingStart,
  onTypingStop,
  error,
}: ChatViewProps) {
  const { stdout } = useStdout();

  // Display name: use channel name if available, otherwise fall back to slug
  const displayName = channelName || currentChannel;
  const displayText = channelDescription
    ? `${displayName} - ${channelDescription}`
    : displayName;

  // Update terminal tab title for chat view
  useEffect(() => {
    if (!stdout) return;
    const prefix = connectionStatus === "connected" ? "• " : "";
    stdout.write(`\x1b]0;${prefix}#${displayName}\x07`);
  }, [stdout, connectionStatus, displayName]);

  return (
    <Box
      flexDirection="column"
      width={terminalSize.columns}
      height={terminalSize.rows}
      overflow="hidden"
      paddingTop={topPadding}
    >
      <Header
        username={username}
        roomName={currentChannel}
        connectionStatus={connectionStatus}
        onLogout={onLogout}
        title={
          <>
            <Text color="gray">← Menu </Text>
            <Text color="gray" dimColor>[CTRL+Q]</Text>
            <Text color="gray"> | </Text>
            <Text color="cyan" bold>#{displayText}</Text>
          </>
        }
      />

      <Box flexDirection="row" height={middleSectionHeight} overflow="hidden">
        <Box flexGrow={1} flexDirection="column" overflow="hidden">
          <MessageList
            messages={messages}
            currentUsername={username}
            typingUsers={typingUsers}
            height={middleSectionHeight}
            scrollOffset={scrollOffset}
            isDetached={isDetached}
          />
        </Box>
        {showUserList && (
          <UserList users={users} currentUsername={username} height={middleSectionHeight} />
        )}
      </Box>

      <InputBox
        onSend={onSend}
        onTypingStart={onTypingStart}
        onTypingStop={onTypingStop}
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

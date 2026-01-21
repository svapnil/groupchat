import React, { useEffect } from "react";
import { Box, Text, useStdout } from "ink";
import { Header } from "./Header.js";
import { Layout } from "./Layout.js";
import { MessageList } from "./MessageList.js";
import { UserList } from "./UserList.js";
import { InputBox } from "./InputBox.js";
import { StatusBar } from "./StatusBar.js";
import { ToolTip } from "./ToolTip.js";
import type { ConnectionStatus, Message, Subscriber } from "../lib/types.js";
import type { UserWithStatus } from "../hooks/use-presence.js";
import { useCommandInput } from "../hooks/use-command-input.js";

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
}: ChatViewProps) {
  const { stdout } = useStdout();
  const { tooltip, isInputDisabled, handleInputChange, handleSubmit } = useCommandInput({
    token,
    currentChannel,
    isPrivateChannel,
    connectionStatus,
    username,
    users,
    subscribers,
    onSendMessage: onSend,
    onCommandSend,
  });

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
              <Text color="gray" dimColor>[CTRL+Q]</Text>
              <Text color="gray"> | </Text>
              <Text color="cyan" bold>#{displayText}</Text>
            </>
          }
        />
      </Layout.Header>

      <Layout.Content>
        <Box
        flexDirection="row"
        height={Math.max(1, middleSectionHeight - tooltip.height)}
        overflow="hidden"
      >
        <Box flexGrow={1} flexDirection="column" overflow="hidden">
          <MessageList
            messages={messages}
            currentUsername={username}
            typingUsers={typingUsers}
            height={Math.max(1, middleSectionHeight - tooltip.height)}
            scrollOffset={scrollOffset}
            isDetached={isDetached}
          />
        </Box>
        {showUserList && (
          <UserList
            users={users}
            currentUsername={username}
            // 1 below header and 1 above tooltip
            height={Math.max(1, middleSectionHeight - tooltip.height - 2)}
            isPrivateChannel={isPrivateChannel}
          />
        )}
      </Box>

      {tooltip.show && tooltip.tips.length > 0 && (
        <ToolTip tips={tooltip.tips} type={tooltip.type} />
      )}

      <InputBox
        onSend={handleSubmit}
        onTypingStart={onTypingStart}
        onTypingStop={onTypingStop}
        onInputChange={handleInputChange}
        disabled={isInputDisabled}
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

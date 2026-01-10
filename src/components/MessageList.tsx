import React, { useMemo } from "react";
import { Box, Text } from "ink";
import { MessageItem } from "./MessageItem.js";
import type { Message } from "../lib/types.js";

interface MessageListProps {
  messages: Message[];
  currentUsername: string | null;
  typingUsers: string[];
  height: number;
}

export function MessageList({
  messages,
  currentUsername,
  typingUsers,
  height,
}: MessageListProps) {
  // Filter out current user from typing users
  const othersTyping = typingUsers.filter((u) => u !== currentUsername);

  // Calculate how many messages can fit in the available space
  // Each message takes approximately 2 lines (timestamp/username + content)
  const visibleMessages = useMemo(() => {
    const linesPerMessage = 2;
    const maxMessages = Math.floor(height / linesPerMessage);

    // Show the most recent messages that fit
    return messages.slice(-maxMessages);
  }, [messages, height]);

  return (
    <Box
      flexDirection="column"
      height={height}
      paddingX={1}
      overflow="hidden"
    >
      {/* Spacer to push messages to bottom */}
      <Box flexGrow={1} />

      {messages.length === 0 ? (
        <Box justifyContent="center" paddingY={2}>
          <Text color="gray">No messages yet. Say hello!</Text>
        </Box>
      ) : (
        visibleMessages.map((message) => (
          <MessageItem
            key={message.id}
            message={message}
            isOwnMessage={message.username === currentUsername}
          />
        ))
      )}

      {othersTyping.length > 0 && (
        <Box paddingTop={1}>
          <Text color="gray" italic>
            {othersTyping.length === 1
              ? `${othersTyping[0]} is typing...`
              : `${othersTyping.join(", ")} are typing...`}
          </Text>
        </Box>
      )}
    </Box>
  );
}

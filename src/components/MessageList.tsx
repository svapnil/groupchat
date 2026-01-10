import React from "react";
import { Box, Text } from "ink";
import { MessageItem } from "./MessageItem.js";
import type { Message } from "../lib/types.js";

interface MessageListProps {
  messages: Message[];
  currentUsername: string | null;
  typingUsers: string[];
}

export function MessageList({
  messages,
  currentUsername,
  typingUsers,
}: MessageListProps) {
  // Filter out current user from typing users
  const othersTyping = typingUsers.filter((u) => u !== currentUsername);

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      {messages.length === 0 ? (
        <Box justifyContent="center" paddingY={2}>
          <Text color="gray">No messages yet. Say hello!</Text>
        </Box>
      ) : (
        messages.map((message) => (
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

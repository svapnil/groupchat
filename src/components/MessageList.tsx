import React, { useMemo } from "react";
import { Box, Text } from "ink";
import { MessageItem } from "./MessageItem.js";
import type { Message } from "../lib/types.js";
import { LAYOUT_HEIGHTS } from "../lib/layout.js";

interface MessageListProps {
  messages: Message[];
  currentUsername: string | null;
  typingUsers: string[];
  height: number;
  scrollOffset: number;
  isDetached: boolean;
}

export const MessageList = React.memo(function MessageList({
  messages,
  currentUsername,
  typingUsers,
  height,
  scrollOffset,
  isDetached,
}: MessageListProps) {
  // Filter out current user from typing users
  const othersTyping = typingUsers.filter((u) => u !== currentUsername);

  // Calculate how many messages can fit in the available space
  // Most messages take 1 line (content only), first in sequence takes 2 (header + content)
  const visibleMessages = useMemo(() => {
    const maxMessages = Math.floor(height / LAYOUT_HEIGHTS.linesPerMessage);

    // Calculate slice indices based on scroll offset
    // scrollOffset=0 means we're at the bottom (most recent messages)
    // scrollOffset>0 means we've scrolled up
    const endIndex = messages.length - scrollOffset;
    const startIndex = Math.max(0, endIndex - maxMessages);

    return messages.slice(startIndex, endIndex);
  }, [messages, height, scrollOffset]);

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
        visibleMessages.map((message, index) => {
          const prevMessage = visibleMessages[index - 1];
          const showHeader = !prevMessage || prevMessage.username !== message.username;
          return (
            <MessageItem
              key={message.id}
              message={message}
              isOwnMessage={message.username === currentUsername}
              showHeader={showHeader}
            />
          );
        })
      )}

      {isDetached && (
        <Box justifyContent="center">
          <Text color="yellow" bold>
            -- {scrollOffset} more below (↓ to scroll down) --
          </Text>
        </Box>
      )}

      {othersTyping.length > 0 && !isDetached && (
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
});

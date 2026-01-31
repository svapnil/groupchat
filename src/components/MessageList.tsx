import React, { useMemo } from "react";
import { Box, Text } from "ink";
import { MessageItem } from "./MessageItem.js";
import type { Message } from "../lib/types.js";
import { calculateVisibleMessages } from "../lib/layout.js";

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
  const othersTyping = typingUsers.filter((u) => u !== currentUsername);
  const { visibleMessages, prevMessage } = useMemo(
    () => calculateVisibleMessages(messages, height, scrollOffset),
    [messages, height, scrollOffset]
  );

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
          const prev = index === 0 ? prevMessage : visibleMessages[index - 1];
          const showHeader = !prev || prev.username !== message.username;
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

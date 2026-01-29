import React from "react";
import { Box, Text } from "ink";
import type { Message } from "../lib/types.js";

interface MessageItemProps {
  message: Message;
  isOwnMessage: boolean;
  showHeader?: boolean;
}

/**
 * Generate a consistent color for a username.
 */
function getUsernameColor(username: string): string {
  const colors = [
    "cyan",
    "magenta",
    "yellow",
    "blue",
    "green",
    "red",
  ];

  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }

  return colors[Math.abs(hash) % colors.length];
}

/**
 * Format timestamp as HH:MM AM/PM
 */
function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export const MessageItem = React.memo(function MessageItem({
  message,
  isOwnMessage,
  showHeader = true,
}: MessageItemProps) {
  const time = formatTime(message.timestamp);

  // Render system messages differently
  if (message.type === "system") {
    return (
      <Box justifyContent="center" paddingY={0}>
        <Text color="gray" italic>
          {message.content}
        </Text>
      </Box>
    );
  }

  const usernameColor = getUsernameColor(message.username);

  if (isOwnMessage) {
    // Own messages: left-aligned
    return (
      <Box justifyContent="flex-start" paddingY={0}>
        <Box flexDirection="column">
          {showHeader && (
            <Box>
              <Text color="gray">→ </Text>
              <Text color={usernameColor} bold>
                {message.username}
              </Text>
              <Text color="gray"> {time}</Text>
            </Box>
          )}
          <Box paddingLeft={2}>
            <Text>{message.content}</Text>
          </Box>
        </Box>
      </Box>
    );
  }

  // Others' messages: right-aligned
  return (
    <Box justifyContent="flex-end" paddingY={0}>
      <Box flexDirection="column" alignItems="flex-end">
        {showHeader && (
          <Box>
            <Text color="gray">{time} </Text>
            <Text color={usernameColor} bold>
              {message.username}
            </Text>
            <Text color="gray"> ←</Text>
          </Box>
        )}
        <Box paddingLeft={2}>
          <Text>{message.content}</Text>
        </Box>
      </Box>
    </Box>
  );
});

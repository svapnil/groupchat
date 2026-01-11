import React from "react";
import { Box, Text } from "ink";
import type { ConnectionStatus } from "../lib/types.js";

interface StatusBarProps {
  connectionStatus: ConnectionStatus;
  error: string | null;
  userCount: number;
}

export function StatusBar({
  connectionStatus,
  error,
  userCount,
}: StatusBarProps) {
  const presenceText =
    connectionStatus === "connected"
      ? "Active"
      : connectionStatus === "connecting"
        ? "Connecting"
        : "Disconnected";

  const presenceColor =
    connectionStatus === "connected"
      ? "green"
      : connectionStatus === "connecting"
        ? "yellow"
        : "red";

  return (
    <Box
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      justifyContent="space-between"
      width="100%"
      flexShrink={0}
    >
      <Box>
        {error ? (
          <Text color="red">[Error: {error}]</Text>
        ) : (
          <>
            <Text color="gray">→ Presence: </Text>
            <Text color={presenceColor}>{presenceText}</Text>
          </>
        )}
      </Box>

      <Box>
        <Text color="gray">Users: </Text>
        <Text color="cyan">{userCount}</Text>
        <Text color="gray"> | ↑/↓ scroll | Ctrl+E users | Ctrl+C exit</Text>
      </Box>
    </Box>
  );
}

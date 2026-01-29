import React from "react";
import { Box, Text } from "ink";
import type { ConnectionStatus } from "../lib/types.js";

interface StatusBarProps {
  connectionStatus: ConnectionStatus;
  error: string | null;
  showUserToggle?: boolean;
}

export function StatusBar({
  connectionStatus,
  error,
  showUserToggle = true,
}: StatusBarProps) {
  const statusColor =
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
      justifyContent="flex-end"
      width="100%"
      flexShrink={0}
    >
      {error ? (
        <Text color="red">[Error: {error}]</Text>
      ) : (
        <>
          <Text color={statusColor}>●</Text>
          <Text color="gray"> | ↑/↓ scroll{showUserToggle ? " | Ctrl+E users" : ""} | Ctrl+C exit</Text>
        </>
      )}
    </Box>
  );
}

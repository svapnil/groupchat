import React from "react";
import { Box, Text } from "ink";
import type { ConnectionStatus } from "../lib/types.js";

interface StatusBarProps {
  connectionStatus: ConnectionStatus;
  error: string | null;
  showUserToggle?: boolean;
  backLabel?: string;
  backShortcut?: string;
  title?: React.ReactNode;
}

export function StatusBar({
  connectionStatus,
  error,
  showUserToggle = true,
  backLabel,
  backShortcut,
  title,
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
      justifyContent="space-between"
      width="100%"
      flexShrink={0}
    >
      {/* Left side: back navigation and title */}
      <Box>
        {backLabel && backShortcut && (
          <>
            <Text color="gray">← {backLabel} </Text>
            <Text color="gray" dimColor>[{backShortcut}]</Text>
          </>
        )}
        {title && (
          <>
            {backLabel && backShortcut && <Text color="gray"> | </Text>}
            {title}
          </>
        )}
      </Box>

      {/* Right side: status and shortcuts */}
      <Box>
        {error ? (
          <Text color="red">[Error: {error}]</Text>
        ) : (
          <>
            <Text color={statusColor}>●</Text>
            <Text color="gray"> | ↑/↓ scroll{showUserToggle ? " | Ctrl+E users" : ""} | Ctrl+C exit</Text>
          </>
        )}
      </Box>
    </Box>
  );
}

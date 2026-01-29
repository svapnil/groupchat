import React from "react";
import { Box, Text } from "ink";
import type { ConnectionStatus } from "../lib/types.js";
import { useStatusMessage, type StatusMessage } from "../hooks/use-status-message.js";

interface StatusBarProps {
  connectionStatus: ConnectionStatus;
  error?: string | null;
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
  // Try to get message from context, but don't fail if provider is missing
  let contextMessage: StatusMessage | null = null;
  try {
    const ctx = useStatusMessage();
    contextMessage = ctx.message;
  } catch {
    // Provider not available, that's fine
  }

  // Context message takes precedence, then error prop
  const displayMessage = contextMessage ?? (error ? { text: error, type: "error" as const } : null);

  const statusColor =
    connectionStatus === "connected"
      ? "green"
      : connectionStatus === "connecting"
        ? "yellow"
        : "red";

  const messageColor = displayMessage?.type === "error" ? "red" : "gray";

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
        {displayMessage ? (
          <Text color={messageColor}>{displayMessage.text}</Text>
        ) : (
          <>
            <Text color={statusColor}>●</Text>
            <Text color="gray"> | ↑/↓ scroll{showUserToggle ? " | Ctrl+E users" : ""}</Text>
          </>
        )}
      </Box>
    </Box>
  );
}

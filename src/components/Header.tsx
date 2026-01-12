import React from "react";
import { Box, Text } from "ink";
import type { ConnectionStatus } from "../lib/types.js";

interface HeaderProps {
  username: string | null;
  roomName: string;
  connectionStatus: ConnectionStatus;
  onLogout: () => void;
  title?: React.ReactNode; // Optional custom title for left side
  showStatus?: boolean;
}

export function Header({
  username,
  roomName,
  connectionStatus,
  title,
  showStatus = true,
}: HeaderProps) {
  const statusColor =
    connectionStatus === "connected"
      ? "green"
      : connectionStatus === "connecting"
        ? "yellow"
        : "red";

  const statusText =
    connectionStatus === "connected"
      ? "ONLINE"
      : connectionStatus === "connecting"
        ? "CONNECTING"
        : "OFFLINE";

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
        {title || (
          <>
            <Text color="cyan" bold>
              ${" "}
            </Text>
            <Text color="blue" bold>
              terminal-chat
            </Text>
            <Text color="gray"> --session </Text>
            <Text color="yellow">{username || "..."}</Text>
          </>
        )}
      </Box>

      <Box>
        {showStatus && (
          <>
            <Text color={statusColor}>[{statusText}]</Text>
            <Text color="gray"> </Text>
          </>
        )}
        <Text color="gray">[Ctrl+L: LOGOUT]</Text>
      </Box>
    </Box>
  );
}

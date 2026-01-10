import React from "react";
import { Box, Text } from "ink";
import type { ConnectionStatus } from "../lib/types.js";

interface HeaderProps {
  username: string | null;
  roomName: string;
  connectionStatus: ConnectionStatus;
  onLogout: () => void;
}

export function Header({
  username,
  roomName,
  connectionStatus,
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
      borderColor="blue"
      paddingX={1}
      justifyContent="space-between"
    >
      <Box>
        <Text color="cyan" bold>
          ${" "}
        </Text>
        <Text color="blue" bold>
          terminal-chat
        </Text>
        <Text color="gray"> --session </Text>
        <Text color="yellow">{username || "..."}</Text>
      </Box>

      <Box>
        <Text color="gray">→ Connected to </Text>
        <Text color="cyan">{roomName}</Text>
      </Box>

      <Box>
        <Text color={statusColor}>[{statusText}]</Text>
        <Text color="gray"> </Text>
        <Text color="gray">[Ctrl+L: LOGOUT]</Text>
      </Box>
    </Box>
  );
}

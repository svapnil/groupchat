import React from "react";
import { Box, Text, useInput } from "ink";
import { Header } from "./Header.js";
import type { ConnectionStatus } from "../lib/types.js";

interface MenuProps {
  width: number;
  height: number;
  currentChannel: string;
  onChannelSelect: (channel: string) => void;
  onBack: () => void;
  username: string | null;
  connectionStatus: ConnectionStatus;
  onLogout: () => void;
}

export function Menu({
  width,
  height,
  currentChannel,
  onChannelSelect,
  onBack,
  username,
  connectionStatus,
  onLogout
}: MenuProps) {
  const channels = [
    { id: "global", name: "#global", description: "General chat" },
  ];

  // Handle keyboard input in menu
  useInput((input, key) => {
    // ESC to go back to chat
    if (key.escape) {
      onBack();
    }

    // Enter to select current channel and go to chat
    if (key.return) {
      onBack();
    }
  });

  // Header is 3 lines tall
  const headerHeight = 3;
  const contentHeight = height - headerHeight;

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      overflow="hidden"
    >
      <Header
        username={username}
        roomName="Menu"
        connectionStatus={connectionStatus}
        onLogout={onLogout}
        title={<Text bold color="cyan">Menu</Text>}
      />

      <Box
        flexDirection="column"
        height={contentHeight}
        padding={2}
      >
        {/* Channels Section */}
        <Box flexDirection="column" marginBottom={2}>
          <Box marginBottom={1}>
            <Text bold color="white">
              Global Channels
            </Text>
          </Box>

          {channels.map((channel) => {
            const isActive = currentChannel === channel.id;
            return (
              <Box key={channel.id} marginLeft={2}>
                <Text
                  color={isActive ? "green" : "white"}
                  bold={isActive}
                >
                  {isActive ? "▶ " : "  "}
                  {channel.name}
                </Text>
                {isActive && (
                  <Text color="gray" dimColor>
                    {" "}
                    - {channel.description}
                  </Text>
                )}
              </Box>
            );
          })}
        </Box>

        {/* Spacer */}
        <Box flexGrow={1} />

        {/* Footer help text */}
        <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
          <Text color="gray">
            <Text color="cyan">Enter</Text> - Join selected channel
          </Text>
          <Text color="gray">
            <Text color="cyan">ESC</Text> - Back to chat
          </Text>
          <Text color="gray">
            <Text color="cyan">Ctrl+C</Text> - Exit the app
          </Text>
        </Box>
      </Box>
    </Box>
  );
}

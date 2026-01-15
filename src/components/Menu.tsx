import React, { useState, useEffect, useMemo } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { Header } from "./Header.js";
import type { ConnectionStatus, Channel, UnreadCounts } from "../lib/types.js";

interface MenuProps {
  width: number;
  height: number;
  currentChannel: string;
  onChannelSelect: (channel: string) => void;
  onBack: () => void;
  username: string | null;
  connectionStatus: ConnectionStatus;
  onLogout: () => void;
  topPadding?: number;
  publicChannels: Channel[];
  privateChannels: Channel[];
  unreadCounts: UnreadCounts;
}

export function Menu({
  width,
  height,
  currentChannel,
  onChannelSelect,
  onBack,
  username,
  connectionStatus,
  onLogout,
  topPadding = 0,
  publicChannels,
  privateChannels,
  unreadCounts,
}: MenuProps) {
  const { stdout } = useStdout();

  const sortedPublicChannels = useMemo(() => {
    return [...publicChannels].sort((a, b) => a.id.localeCompare(b.id));
  }, [publicChannels]);

  // Combine all channels into a single navigable list
  const allChannels = useMemo(() => {
    return [...sortedPublicChannels, ...privateChannels];
  }, [sortedPublicChannels, privateChannels]);

  // Selection state - index into allChannels
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Reset selection when channels change
  useEffect(() => {
    if (allChannels.length > 0) {
      // Try to find current channel in list, otherwise default to 0
      const currentIndex = allChannels.findIndex((c) => c.slug === currentChannel);
      setSelectedIndex(currentIndex >= 0 ? currentIndex : 0);
    }
  }, [allChannels, currentChannel]);

  // Update terminal tab title for menu view
  useEffect(() => {
    if (!stdout) return;
    stdout.write(`\x1b]0;Menu\x07`);
  }, [stdout]);

  // Handle keyboard input in menu
  useInput((input, key) => {
    // ESC to go back to chat
    if (key.escape) {
      onBack();
      return;
    }

    // Arrow key navigation
    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(allChannels.length - 1, prev + 1));
      return;
    }

    // Enter to select current channel and go to chat
    if (key.return && allChannels.length > 0) {
      const selected = allChannels[selectedIndex];
      if (selected) {
        onChannelSelect(selected.slug);
        onBack();
      }
    }
  });

  // Header is 3 lines tall
  const headerHeight = 3;
  const contentHeight = height - topPadding - headerHeight;

  // Calculate which index is the start of private channels for section headers
  const privateStartIndex = sortedPublicChannels.length;

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      overflow="hidden"
      paddingTop={topPadding}
    >
      <Header
        username={username}
        roomName="Menu"
        connectionStatus={connectionStatus}
        onLogout={onLogout}
        title={<Text bold color="cyan">Menu</Text>}
        showStatus={false}
      />

      <Box flexDirection="column" height={contentHeight} padding={2}>
        {/* Public Channels Section */}
        {sortedPublicChannels.length > 0 && (
          <Box flexDirection="column" marginBottom={1}>
            <Box marginBottom={1}>
              <Text bold color="white">
                Global Channels
              </Text>
            </Box>

            {sortedPublicChannels.map((channel, idx) => {
              const isSelected = selectedIndex === idx;
              const unreadCount = unreadCounts[channel.slug] || 0;
              return (
                <ChannelItem
                  key={channel.id}
                  channel={channel}
                  isSelected={isSelected}
                  unreadCount={unreadCount}
                />
              );
            })}
          </Box>
        )}

        {/* Private Channels Section */}
        {privateChannels.length > 0 && (
          <Box flexDirection="column" marginBottom={1}>
            <Box marginBottom={1}>
              <Text bold color="white">
                Private Channels
              </Text>
            </Box>

            {privateChannels.map((channel, idx) => {
              const absoluteIndex = privateStartIndex + idx;
              const isSelected = selectedIndex === absoluteIndex;
              const unreadCount = unreadCounts[channel.slug] || 0;
              return (
                <ChannelItem
                  key={channel.id}
                  channel={channel}
                  isSelected={isSelected}
                  isPrivate
                  unreadCount={unreadCount}
                />
              );
            })}
          </Box>
        )}

        {/* Empty state */}
        {allChannels.length === 0 && (
          <Box>
            <Text color="gray">No channels available</Text>
          </Box>
        )}

        {/* Spacer */}
        <Box flexGrow={1} />

        {/* Footer help text */}
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor="gray"
          paddingX={1}
        >
          <Text color="gray">
            <Text color="cyan">Up/Down</Text> Navigate channels
          </Text>
          <Text color="gray">
            <Text color="cyan">Enter</Text> Join selected channel
          </Text>
          <Text color="gray">
            <Text color="cyan">ESC</Text> Back to chat
          </Text>
          <Text color="gray">
            <Text color="cyan">Ctrl+C</Text> Exit the app
          </Text>
        </Box>
      </Box>
    </Box>
  );
}

interface ChannelItemProps {
  channel: Channel;
  isSelected: boolean;
  isPrivate?: boolean;
  unreadCount?: number;
}

function ChannelItem({ channel, isSelected, isPrivate = false, unreadCount = 0 }: ChannelItemProps) {
  return (
    <Box marginLeft={2}>
      <Text color={isSelected ? "green" : "white"} bold={isSelected}>
        {isSelected ? "> " : "  "}
        {isPrivate && <Text color="yellow">🔒 </Text>}
        #{channel.name || channel.slug}
        {unreadCount > 0 && (
          <Text color="green" bold>
            {" "}({unreadCount})
          </Text>
        )}
      </Text>
      {isSelected && channel.description && (
        <Text color="gray" dimColor>
          {" "}
          - {channel.description}
        </Text>
      )}
    </Box>
  );
}

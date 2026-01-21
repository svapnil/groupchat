import React, { useState, useEffect, useMemo } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { Header } from "./Header.js";
import { Layout } from "./Layout.js";
import { useNavigation } from "../routes/Router.js";
import type { ConnectionStatus, Channel, UnreadCounts } from "../lib/types.js";

type MenuItem =
  | { type: "channel"; channel: Channel }
  | { type: "action"; action: "create-channel"; label: string };

interface MenuProps {
  width: number;
  height: number;
  currentChannel: string;
  onChannelSelect: (channel: string) => void;
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
  username,
  connectionStatus,
  onLogout,
  topPadding = 0,
  publicChannels,
  privateChannels,
  unreadCounts,
}: MenuProps) {
  const { stdout } = useStdout();
  const { navigate } = useNavigation();

  const sortedPublicChannels = useMemo(() => {
    return [...publicChannels].sort((a, b) => a.id.localeCompare(b.id));
  }, [publicChannels]);

  // Combine all channels into a single navigable list
  const allChannels = useMemo(() => {
    return [...sortedPublicChannels, ...privateChannels];
  }, [sortedPublicChannels, privateChannels]);

  // Create menu items: channels + action item for creating new channel
  const menuItems: MenuItem[] = useMemo(() => {
    const items: MenuItem[] = allChannels.map((channel) => ({
      type: "channel" as const,
      channel,
    }));
    // Add "Create New Channel" action at the end
    items.push({
      type: "action",
      action: "create-channel",
      label: "Create New Private Channel",
    });
    return items;
  }, [allChannels]);

  // Selection state - index into menuItems
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Reset selection when channels change
  useEffect(() => {
    if (menuItems.length > 0) {
      // Try to find current channel in list, otherwise default to 0
      const currentIndex = menuItems.findIndex(
        (item) => item.type === "channel" && item.channel.slug === currentChannel
      );
      setSelectedIndex(currentIndex >= 0 ? currentIndex : 0);
    }
  }, [menuItems, currentChannel]);

  // Update terminal tab title for menu view
  useEffect(() => {
    if (!stdout) return;
    stdout.write(`\x1b]0;Menu\x07`);
  }, [stdout]);

  // Handle keyboard input in menu
  useInput((input, key) => {
    // ESC to go back to chat
    if (key.escape) {
      navigate("chat");
      return;
    }

    // Arrow key navigation
    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(menuItems.length - 1, prev + 1));
      return;
    }

    // Enter to select current item
    if (key.return && menuItems.length > 0) {
      const selected = menuItems[selectedIndex];
      if (selected) {
        if (selected.type === "channel") {
          onChannelSelect(selected.channel.slug);
          navigate("chat");
        } else if (selected.type === "action" && selected.action === "create-channel") {
          navigate("create-channel");
        }
      }
    }
  });

  // Header is 3 lines tall
  const headerHeight = 3;
  const contentHeight = height - topPadding - headerHeight;

  // Calculate which index is the start of private channels for section headers
  const privateStartIndex = sortedPublicChannels.length;

  return (
    <Layout width={width} height={height} topPadding={topPadding}>
      <Layout.Header>
        <Header
          username={username}
          roomName="Menu"
          connectionStatus={connectionStatus}
          onLogout={onLogout}
          title={<Text bold color="cyan">Menu</Text>}
          showStatus={false}
        />
      </Layout.Header>

      <Layout.Content>
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

        {/* Create New Channel Action */}
        <Box flexDirection="column" marginBottom={1}>
          {/* Only show header if there are no private channels yet */}
          {privateChannels.length === 0 && (
            <Box marginBottom={1}>
              <Text bold color="white">
                Private Channels
              </Text>
            </Box>
          )}
          <ActionItem
            label="+ Create New Private Channel"
            isSelected={selectedIndex === allChannels.length}
          />
        </Box>

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
      </Layout.Content>
    </Layout>
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

interface ActionItemProps {
  label: string;
  isSelected: boolean;
}

function ActionItem({ label, isSelected }: ActionItemProps) {
  return (
    <Box marginLeft={2}>
      <Text color={isSelected ? "green" : "cyan"} bold={isSelected}>
        {isSelected ? "> " : "  "}
        {label}
      </Text>
    </Box>
  );
}

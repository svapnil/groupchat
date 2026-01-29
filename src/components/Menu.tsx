import React, { useState, useEffect, useMemo } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { Layout } from "./Layout.js";
import { StatusBar } from "./StatusBar.js";
import { AtAGlance } from "./AtAGlance.js";
import { useNavigation } from "../routes/Router.js";
import type { ConnectionStatus, Channel, UnreadCounts, PresenceState, DmConversation } from "../lib/types.js";
import { LAYOUT_HEIGHTS } from "../lib/layout.js";

type MenuItem =
  | { type: "channel"; channel: Channel }
  | { type: "dm"; conversation: DmConversation }
  | { type: "action"; action: "create-channel" | "new-dm" | "dm-see-more"; label: string };

interface MenuProps {
  width: number;
  height: number;
  currentChannel: string;
  onChannelSelect: (channel: string) => void;
  connectionStatus: ConnectionStatus;
  topPadding?: number;
  publicChannels: Channel[];
  privateChannels: Channel[];
  unreadCounts: UnreadCounts;
  globalPresence: PresenceState;
  isLoadingChannels?: boolean;
  totalUnreadCount?: number;
  dmConversations: DmConversation[];
  isLoadingDms?: boolean;
  onDmSelect: (dm: DmConversation) => void;
  onNewDm: () => void;
}

export function Menu({
  width,
  height,
  currentChannel,
  onChannelSelect,
  connectionStatus,
  topPadding = 0,
  publicChannels,
  privateChannels,
  unreadCounts,
  globalPresence,
  isLoadingChannels = false,
  totalUnreadCount = 0,
  dmConversations,
  isLoadingDms = false,
  onDmSelect,
  onNewDm,
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

  // Create menu items: channels + create channel + DM section
  const menuItems: MenuItem[] = useMemo(() => {
    const items: MenuItem[] = [];

    // Global Channels section
    sortedPublicChannels.forEach((channel) => {
      items.push({
        type: "channel",
        channel,
      });
    });

    // Private Channels section
    privateChannels.forEach((channel) => {
      items.push({
        type: "channel",
        channel,
      });
    });

    // Create New Channel action
    items.push({
      type: "action",
      action: "create-channel",
      label: "+ Create New Private Channel",
    });

    // Direct Messages section
    // "+ New Message" action
    items.push({
      type: "action",
      action: "new-dm",
      label: "+ New Message",
    });

    // Add up to 5 most recent DM conversations
    const recentDms = dmConversations.slice(0, 5);
    recentDms.forEach((conversation) => {
      items.push({
        type: "dm",
        conversation,
      });
    });

    // Add "See More..." if more than 5 conversations
    if (dmConversations.length > 5) {
      items.push({
        type: "action",
        action: "dm-see-more",
        label: "See More...",
      });
    }

    return items;
  }, [sortedPublicChannels, privateChannels, dmConversations]);

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
    const unreadSuffix = totalUnreadCount > 0 ? ` (${totalUnreadCount})` : "";
    stdout.write(`\x1b]0;groupchat${unreadSuffix}\x07`);
  }, [stdout, totalUnreadCount]);

  // Handle keyboard input in menu
  useInput((input, key) => {
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
        } else if (selected.type === "dm") {
          onDmSelect(selected.conversation);
        } else if (selected.type === "action") {
          if (selected.action === "create-channel") {
            navigate("create-channel");
          } else if (selected.action === "new-dm") {
            onNewDm();
          } else if (selected.action === "dm-see-more") {
            navigate("dm-inbox");
          }
        }
      }
    }
  });

  const contentHeight = height - topPadding - LAYOUT_HEIGHTS.statusBar;

  // Calculate which index is the start of each section
  const publicStartIndex = 0; // First section is now public channels
  const privateStartIndex = publicStartIndex + sortedPublicChannels.length;
  const createChannelIndex = privateStartIndex + privateChannels.length;

  // DM section starts after create channel
  const newDmIndex = createChannelIndex + 1;
  const dmStartIndex = newDmIndex + 1;
  const dmCount = Math.min(5, dmConversations.length);
  const dmSeeMoreIndex = dmConversations.length > 5 ? dmStartIndex + dmCount : -1;

  return (
    <Layout width={width} height={height} topPadding={topPadding}>
      <Layout.Content>
        <Box flexDirection="column" height={contentHeight}>
          {/* Top section: Channels and At a Glance */}
          <Box flexDirection="row" flexGrow={1}>
            {/* Left side: Channel list */}
            <Box flexDirection="column" flexGrow={1} padding={2}>
              {/* Public Channels Section */}
              {sortedPublicChannels.length > 0 && (
                <Box flexDirection="column" marginBottom={1}>
                  <Box marginBottom={1}>
                    <Text bold color="white">
                      Global Channels
                    </Text>
                  </Box>

                  {sortedPublicChannels.map((channel, idx) => {
                    const absoluteIndex = publicStartIndex + idx;
                    const isSelected = selectedIndex === absoluteIndex;
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
                <ActionItem
                  label="+ Create a new private channel"
                  isSelected={selectedIndex === createChannelIndex}
                />
              </Box>

              {/* Direct Messages Section */}
              <Box flexDirection="column" marginBottom={1}>
                <Box marginBottom={1}>
                  <Text bold color="white">
                    Direct Messages
                  </Text>
                </Box>

                {/* New Message Action */}
                <ActionItem
                  label="+ Start a new conversation"
                  isSelected={selectedIndex === newDmIndex}
                />

                {/* DM Conversations or Empty State */}
                {isLoadingDms && dmConversations.length === 0 ? (
                  <Box marginLeft={2}>
                    <Text color="cyan">Loading conversations...</Text>
                  </Box>
                ) : dmConversations.length === 0 ? (
                  <Box marginLeft={2}>
                    <Text color="gray">No Direct Messages Yet..</Text>
                  </Box>
                ) : (
                  <>
                    {dmConversations.slice(0, 5).map((conversation, idx) => {
                      const absoluteIndex = dmStartIndex + idx;
                      const isSelected = selectedIndex === absoluteIndex;
                      const isOnline = !!globalPresence[conversation.other_username];
                      return (
                        <DmItem
                          key={conversation.slug}
                          conversation={conversation}
                          isSelected={isSelected}
                          isOnline={isOnline}
                        />
                      );
                    })}

                    {/* See More action */}
                    {dmConversations.length > 5 && (
                      <ActionItem
                        label="See More..."
                        isSelected={selectedIndex === dmSeeMoreIndex}
                      />
                    )}
                  </>
                )}
              </Box>

              {/* Loading/Empty state */}
              {allChannels.length === 0 && (
                <Box>
                  {isLoadingChannels ? (
                    <Text color="cyan">Loading channels...</Text>
                  ) : (
                    <Text color="gray">No channels available</Text>
                  )}
                </Box>
              )}
            </Box>

            {/* Right side: At a Glance (compact, top-aligned) */}
            <Box paddingRight={2} paddingTop={2}>
              <AtAGlance presenceState={globalPresence} height={contentHeight - 4} />
            </Box>
          </Box>

          {/* Bottom section: Footer help text (full width) */}
          <Box paddingX={2} paddingBottom={2}>
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
                <Text color="cyan">Ctrl+O</Text> Logout
              </Text>
              <Text color="gray">
                <Text color="cyan">Ctrl+C</Text> Exit the app
              </Text>
            </Box>
          </Box>
        </Box>
      </Layout.Content>

      <Layout.Footer>
        <StatusBar
          connectionStatus={connectionStatus}
          error={null}
          showUserToggle={false}
        />
      </Layout.Footer>
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
  icon?: string;
}

function ActionItem({ label, isSelected, icon }: ActionItemProps) {
  return (
    <Box marginLeft={2}>
      <Text color={isSelected ? "green" : "cyan"} bold={isSelected}>
        {isSelected ? "> " : "  "}
        {icon && <Text>{icon} </Text>}
        {label}
      </Text>
    </Box>
  );
}

interface DmItemProps {
  conversation: DmConversation;
  isSelected: boolean;
  isOnline: boolean;
}

function DmItem({ conversation, isSelected, isOnline }: DmItemProps) {
  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: "short" });
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  };

  return (
    <Box flexDirection="column" marginLeft={2}>
      <Box>
        <Text color={isSelected ? "green" : "white"} bold={isSelected}>
          {isSelected ? "> " : "  "}
          <Text color={isOnline ? "green" : "gray"}>●</Text>{" "}
          {conversation.other_username}
          {conversation.unread_count > 0 && (
            <Text color="green" bold>
              {" "}({conversation.unread_count})
            </Text>
          )}
        </Text>
      </Box>
      <Box marginLeft={4}>
        <Text color="gray" wrap="truncate">
          {conversation.last_message_preview || "No messages yet"}
        </Text>
        <Text color="gray"> • </Text>
        <Text color="gray">{formatTime(conversation.last_activity_at)}</Text>
      </Box>
    </Box>
  );
}

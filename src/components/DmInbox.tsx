import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { Layout } from "./Layout.js";
import { StatusBar } from "./StatusBar.js";
import { useNavigation } from "../routes/Router.js";
import { fetchDmConversations, createOrGetDm, searchUsers } from "../lib/chat-client.js";
import { getConfig } from "../lib/config.js";
import { LAYOUT_HEIGHTS } from "../lib/layout.js";
import type { DmConversation, ConnectionStatus, UserSearchResult, PresenceState } from "../lib/types.js";

interface DmInboxProps {
  width: number;
  height: number;
  connectionStatus: ConnectionStatus;
  token: string | null;
  onSelectDm: (dm: DmConversation) => void;
  topPadding: number;
  totalUnreadCount: number;
  startInSearchMode?: boolean;
  globalPresence: PresenceState;
}

export function DmInbox({
  width,
  height,
  connectionStatus,
  token,
  onSelectDm,
  topPadding,
  totalUnreadCount,
  startInSearchMode = false,
  globalPresence,
}: DmInboxProps) {
  const { navigate } = useNavigation();
  const [conversations, setConversations] = useState<DmConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Search mode state
  const [isSearching, setIsSearching] = useState(startInSearchMode);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searchSelectedIndex, setSearchSelectedIndex] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);

  // Handle startInSearchMode prop changes
  useEffect(() => {
    if (startInSearchMode) {
      setIsSearching(true);
    }
  }, [startInSearchMode]);

  // Fetch conversations
  useEffect(() => {
    if (!token) return;

    const fetchConvos = async () => {
      try {
        const config = getConfig();
        const data = await fetchDmConversations(config.wsUrl, token);
        setConversations(data.conversations || []);
        setError(null);
      } catch (err) {
        setError("Failed to load conversations");
      } finally {
        setLoading(false);
      }
    };

    fetchConvos();
  }, [token]);

  // Search users when query changes
  useEffect(() => {
    if (!token || !isSearching || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const searchTimeout = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const config = getConfig();
        const data = await searchUsers(config.wsUrl, token, searchQuery);
        setSearchResults(data.users || []);
        setSearchSelectedIndex(0);
      } catch (err) {
        // Ignore search errors
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(searchTimeout);
  }, [token, isSearching, searchQuery]);

  // Handle starting a DM with a user
  const startDmWithUser = useCallback(async (user: UserSearchResult) => {
    if (!token) return;

    try {
      const config = getConfig();
      const dm = await createOrGetDm(config.wsUrl, token, { user_id: user.user_id });

      // Create a DmConversation object from the response
      const conversation: DmConversation = {
        channel_id: dm.channel_id,
        slug: dm.slug,
        other_user_id: dm.other_user_id,
        other_username: dm.other_username,
        last_activity_at: new Date().toISOString(),
        last_message_preview: null,
        unread_count: 0,
      };

      onSelectDm(conversation);
    } catch (err) {
      setError("Failed to create DM");
    }
  }, [token, onSelectDm]);

  useInput((input, key) => {
    if (isSearching) {
      // Search mode input handling
      if (key.escape) {
        setIsSearching(false);
        setSearchQuery("");
        setSearchResults([]);
        return;
      }

      if (key.return && searchResults.length > 0) {
        const selectedUser = searchResults[searchSelectedIndex];
        if (selectedUser) {
          startDmWithUser(selectedUser);
        }
        return;
      }

      if (key.upArrow) {
        setSearchSelectedIndex((prev) => Math.max(0, prev - 1));
        return;
      }

      if (key.downArrow) {
        setSearchSelectedIndex((prev) => Math.min(searchResults.length - 1, prev + 1));
        return;
      }

      if (key.backspace || key.delete) {
        setSearchQuery((prev) => prev.slice(0, -1));
        return;
      }

      // Add character to search query
      if (input && !key.ctrl && !key.meta) {
        setSearchQuery((prev) => prev + input);
      }
      return;
    }

    // Normal mode input handling
    if (key.escape) {
      navigate("menu");
      return;
    }

    if (input === "n" || input === "N") {
      setIsSearching(true);
      return;
    }

    if (key.return && conversations.length > 0) {
      const selectedConvo = conversations[selectedIndex];
      if (selectedConvo) {
        onSelectDm(selectedConvo);
      }
      return;
    }

    if (key.upArrow || input === "k") {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow || input === "j") {
      setSelectedIndex((prev) => Math.min(conversations.length - 1, prev + 1));
      return;
    }
  });

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

  const contentHeight = height - topPadding - LAYOUT_HEIGHTS.statusBar;

  return (
    <Layout width={width} height={height} topPadding={topPadding}>
      <Layout.Content>
        <Box flexDirection="column" height={contentHeight} paddingX={1}>
        {/* Search mode */}
        {isSearching ? (
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text color="cyan">Search user: </Text>
              <Text>{searchQuery}</Text>
              <Text color="gray">|</Text>
            </Box>

            {searchQuery.length < 2 ? (
              <Text color="gray">Type at least 2 characters to search...</Text>
            ) : searchLoading ? (
              <Text color="gray">Searching...</Text>
            ) : searchResults.length === 0 ? (
              <Text color="gray">No users found</Text>
            ) : (
              searchResults.slice(0, 10).map((user, index) => {
                const isOnline = !!globalPresence[user.username];
                return (
                  <Box key={user.user_id}>
                    <Text color={index === searchSelectedIndex ? "cyan" : undefined}>
                      {index === searchSelectedIndex ? "> " : "  "}
                      <Text color={isOnline ? "green" : "gray"}>●</Text> {user.username}
                    </Text>
                  </Box>
                );
              })
            )}

            <Box marginTop={1}>
              <Text color="gray">[Enter] Start DM  [Esc] Cancel</Text>
            </Box>
          </Box>
        ) : (
          /* Conversation list */
          <Box flexDirection="column">
            <Box marginBottom={1} justifyContent="space-between">
              <Text color="cyan" bold>Conversations</Text>
              <Text color="gray">[N] New DM  [Esc] Back</Text>
            </Box>

            {loading ? (
              <Text color="gray">Loading conversations...</Text>
            ) : error ? (
              <Text color="red">{error}</Text>
            ) : conversations.length === 0 ? (
              <Box flexDirection="column">
                <Text color="gray">No conversations yet.</Text>
                <Text color="gray">Press [N] to start a new DM.</Text>
              </Box>
            ) : (
              conversations.map((conv, index) => {
                const isOnline = !!globalPresence[conv.other_username];
                return (
                  <Box key={conv.slug} flexDirection="column">
                    <Box>
                      <Text color={index === selectedIndex ? "cyan" : undefined}>
                        {index === selectedIndex ? "> " : "  "}
                      </Text>
                      <Text color={index === selectedIndex ? "cyan" : "white"} bold>
                        <Text color={isOnline ? "green" : "gray"}>●</Text> {conv.other_username}
                      </Text>
                      <Text color="gray"> </Text>
                      <Text color="gray">{formatTime(conv.last_activity_at)}</Text>
                      {conv.unread_count > 0 && (
                        <Text color="yellow"> ({conv.unread_count})</Text>
                      )}
                    </Box>
                    <Box marginLeft={4}>
                      <Text color="gray" wrap="truncate">
                        {conv.last_message_preview || "No messages yet"}
                      </Text>
                    </Box>
                  </Box>
                );
              })
            )}
          </Box>
        )}
        </Box>
      </Layout.Content>

      <Layout.Footer>
        <StatusBar
          connectionStatus={connectionStatus}
          error={error}
          showUserToggle={false}
          backLabel="Menu"
          backShortcut="ESC"
          title={<Text color="cyan" bold>Direct Messages</Text>}
        />
      </Layout.Footer>
    </Layout>
  );
}

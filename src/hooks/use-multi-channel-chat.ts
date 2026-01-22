import { useState, useCallback, useRef, useEffect } from "react";
import { ChannelManager } from "../lib/channel-manager.js";
import { fetchChannels } from "../lib/chat-client.js";
import { getConfig } from "../lib/config.js";
import type {
  Message,
  ConnectionStatus,
  PresenceState,
  Subscriber,
} from "../lib/types.js";

/**
 * React hook for multi-channel chat with persistent connection.
 *
 * Key differences from useChat:
 * - Maintains a single WebSocket connection for the entire session
 * - Subscribes to ALL channels on login (not just one)
 * - Fetches message history fresh when currentChannel changes
 * - Buffers real-time messages for non-active channels
 *
 * API-compatible with useChat for easy migration.
 */
export function useMultiChannelChat(
  token: string | null,
  currentChannel: string,
  onChannelListChanged?: () => void
) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [username, setUsername] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [presenceState, setPresenceState] = useState<PresenceState>({});
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [channelsReady, setChannelsReady] = useState(false);

  const managerRef = useRef<ChannelManager | null>(null);
  const prevChannelRef = useRef<string | null>(null);
  const isLoadingHistory = useRef(false);

  // Connect and subscribe to all channels (once per session)
  useEffect(() => {
    if (!token) {
      // No token - ensure disconnected
      if (managerRef.current) {
        managerRef.current.disconnect();
        managerRef.current = null;
      }
      setChannelsReady(false);
      return;
    }

    // Already connected
    if (managerRef.current) {
      return;
    }

    const config = getConfig();

    // Create ChannelManager with callbacks
    const manager = new ChannelManager(
      config.wsUrl,
      token,
      {
        onMessage: (channelSlug, message) => {
          // ChannelManager already routes to active channel only, just update UI
          setMessages((prev) => [...prev, message]);
        },
        onPresenceState: (channelSlug, state) => {
          // ChannelManager already routes to active channel only
          setPresenceState(state);
        },
        onPresenceDiff: (channelSlug, diff) => {
          // ChannelManager already routes to active channel only
          setPresenceState((prev) => {
            const next = { ...prev };

            // Remove leaves first (presence updates send leaves + joins for same user)
            Object.keys(diff.leaves).forEach((username) => {
              delete next[username];
            });

            // Add joins
            Object.entries(diff.joins).forEach(([username, data]) => {
              next[username] = data;
            });

            return next;
          });
        },
        onUserTyping: (channelSlug, username, typing) => {
          // ChannelManager already routes to active channel only
          setTypingUsers((prev) => {
            if (typing) {
              return prev.includes(username) ? prev : [...prev, username];
            } else {
              return prev.filter((u) => u !== username);
            }
          });
        },
        onConnectionChange: (status) => {
          setConnectionStatus(status);
          if (status === "disconnected" || status === "error") {
            setError(null);
          }
        },
        onError: (err) => {
          setError(err);
        },
        onChannelJoined: (channelSlug, joinedUsername) => {
          // Set username once (same across all channels)
          if (!username) {
            setUsername(joinedUsername);
          }
        },
        onInvitedToChannel: (channelSlug, invitedBy) => {
          // We were invited to a channel - need to join it
          // The subscription is created, but we need to actually join the Phoenix channel
          if (managerRef.current) {
            // Fetch updated channel list and subscribe to the new channel
            const authToken = token;
            async function joinNewChannel() {
              if (!authToken || !manager) return;
              try {
                const channelsResponse = await fetchChannels(config.wsUrl, authToken);
                const allChannels = [
                  ...channelsResponse.channels.public,
                  ...channelsResponse.channels.private,
                ];

                // Find the new channel
                const newChannel = allChannels.find(ch => ch.slug === channelSlug);
                if (newChannel) {
                  await manager.subscribeToChannels([newChannel]);
                  // Notify that channel list changed (for Menu to refetch)
                  onChannelListChanged?.();
                }
              } catch (err) {
                console.error("Failed to join new channel:", err);
              }
            }
            joinNewChannel();
          }
        },
        onUserInvitedToChannel: (channelSlug, invitedUsername, invitedUserId, invitedBy) => {
          // Someone else was invited, update subscribers list
          setSubscribers((prev) => {
            // Check if already in list
            const exists = prev.some((s) => s.user_id === invitedUserId);
            if (!exists) {
              return [...prev, { username: invitedUsername, user_id: invitedUserId, role: "member" }];
            }
            return prev;
          });
        },
        onRemovedFromChannel: (channelSlug, removedBy) => {
          // We were removed from a channel
          setError(`You were removed from ${channelSlug} by ${removedBy}`);
          // The channel-manager already left the channel, no action needed
        },
        onUserRemovedFromChannel: (channelSlug, removedUsername, removedBy) => {
          // Someone else was removed, update subscribers list
          setSubscribers((prev) => prev.filter((s) => s.username !== removedUsername));
        },
      }
    );

    managerRef.current = manager;

    // Connect and subscribe to all channels
    const authToken = token;
    async function init() {
      if (!authToken) {
        return;
      }
      try {
        await manager.connect();

        // Fetch list of channels
        const channelsResponse = await fetchChannels(config.wsUrl, authToken);
        const allChannels = [
          ...channelsResponse.channels.public,
          ...channelsResponse.channels.private,
        ];

        // Subscribe to all channels
        await manager.subscribeToChannels(allChannels);

        // Mark channels as ready (triggers agent detection)
        setChannelsReady(true);

        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Connection failed");
        console.error("Failed to initialize multi-channel chat:", err);
      }
    }

    init();

    // Cleanup on unmount or token change
    return () => {
      if (managerRef.current) {
        managerRef.current.disconnect();
        managerRef.current = null;
      }
      setChannelsReady(false);
    };
  }, [token]); // Only re-run when token changes, not currentChannel!

  // Fetch history when channel changes OR when connection is established
  // Always fetch fresh history per the requirements
  useEffect(() => {
    const manager = managerRef.current;
    if (!manager || !manager.isConnected() || !currentChannel) {
      return;
    }

    // Stop typing on previous channel
    if (prevChannelRef.current && prevChannelRef.current !== currentChannel) {
      manager.stopTyping(prevChannelRef.current);
    }

    prevChannelRef.current = currentChannel;

    // Set active channel in manager (affects message routing)
    manager.setActiveChannel(currentChannel);

    // Load history for this channel
    async function loadHistory() {
      if (isLoadingHistory.current || !manager) return;

      isLoadingHistory.current = true;

      try {
        // Fetch history from API
        const history = await manager.fetchHistory(currentChannel);

        // Fetch subscribers if private channel
        if (currentChannel.startsWith("private_room:")) {
          const subs = await manager.fetchSubscribers(currentChannel);
          setSubscribers(subs);
        } else {
          // Public channel - no subscriber list
          setSubscribers([]);
        }

        // Get buffered real-time messages
        const realtimeMessages = manager.getRealtimeMessages(currentChannel);

        // Merge and sort by timestamp
        const merged = [...history, ...realtimeMessages];

        // Deduplicate by ID (in case of race condition)
        const seen = new Set<string>();
        const deduplicated = merged.filter((msg) => {
          if (seen.has(msg.id)) return false;
          seen.add(msg.id);
          return true;
        });

        // Sort by timestamp
        deduplicated.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

        setMessages(deduplicated);

        // Clear buffered messages
        manager.clearRealtimeMessages(currentChannel);

        // Update presence for current channel
        const presence = manager.getPresence(currentChannel);
        setPresenceState(presence);

        // Update typing users for current channel
        const typing = manager.getTypingUsers(currentChannel);
        setTypingUsers(typing);

        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load history");
        console.error("Failed to load message history:", err);
      } finally {
        isLoadingHistory.current = false;
      }
    }

    loadHistory();
  }, [currentChannel, connectionStatus]); // Re-run when channel changes OR connection established

  // Send a message to the current channel
  const sendMessage = useCallback(
    async (content: string) => {
      if (!managerRef.current) {
        throw new Error("Not connected");
      }
      await managerRef.current.sendMessage(currentChannel, content);
    },
    [currentChannel]
  );

  // Typing indicators for current channel
  const startTyping = useCallback(() => {
    managerRef.current?.startTyping(currentChannel);
  }, [currentChannel]);

  const stopTyping = useCallback(() => {
    managerRef.current?.stopTyping(currentChannel);
  }, [currentChannel]);

  // For backward compatibility with useChat
  const connect = useCallback(() => {
    // No-op: connection is managed automatically
  }, []);

  const disconnect = useCallback(() => {
    // No-op: disconnection is managed automatically
  }, []);

  return {
    messages,
    connectionStatus,
    username,
    error,
    sendMessage,
    startTyping,
    stopTyping,
    typingUsers,
    presenceState,
    subscribers,
    connect, // No-op for backward compatibility
    disconnect, // No-op for backward compatibility
    channelManager: channelsReady ? managerRef.current : null,
  };
}

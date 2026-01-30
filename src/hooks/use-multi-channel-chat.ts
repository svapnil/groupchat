import { useState, useCallback, useRef, useEffect } from "react";
import { ChannelManager } from "../lib/channel-manager.js";
import { fetchChannels } from "../lib/chat-client.js";
import { getConfig } from "../lib/config.js";
import { getNotificationManager } from "../lib/notification-manager.js";
import { applyPresenceDiff } from "../lib/presence-utils.js";
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
  onChannelListChanged?: () => void,
  incrementUnreadCount?: (channelSlug: string) => void
) {
  // Cache messages and subscribers per channel
  const [messageCache, setMessageCache] = useState<Record<string, Message[]>>({});
  const [subscriberCache, setSubscriberCache] = useState<Record<string, Subscriber[]>>({});
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [username, setUsername] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [presenceState, setPresenceState] = useState<PresenceState>({});
  const [globalPresence, setGlobalPresence] = useState<PresenceState>({});
  const [channelsReady, setChannelsReady] = useState(false);

  const managerRef = useRef<ChannelManager | null>(null);
  const prevChannelRef = useRef<string | null>(null);
  const isLoadingHistory = useRef(false);
  const userChannelJoinAttemptedRef = useRef(false);

  // Get messages and subscribers for current channel from cache
  const messages = messageCache[currentChannel] || [];
  const subscribers = subscriberCache[currentChannel] || [];

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

    // Track username locally for notification filtering
    // (needed because callbacks capture stale closure)
    let myUsername: string | null = null;

    // Create ChannelManager with callbacks
    const manager = new ChannelManager(
      config.wsUrl,
      token,
      {
        onMessage: (channelSlug, message) => {
          // Update the message cache for this specific channel
          setMessageCache((prev) => ({
            ...prev,
            [channelSlug]: [...(prev[channelSlug] || []), message],
          }));

          // Trigger bell notification (don't notify for own messages)
          if (myUsername && message.username !== myUsername) {
            getNotificationManager().notify("bell");
          }
        },
        onNonActiveChannelMessage: (channelSlug, message) => {
          // Don't increment unread count for system messages
          if (message.type === "system") {
            return;
          }
          // Increment unread count only for regular user messages
          incrementUnreadCount?.(channelSlug);
        },
        onPresenceState: (channelSlug, state) => {
          // ChannelManager already routes to active channel only
          setPresenceState(state);

          if (userChannelJoinAttemptedRef.current) {
            return;
          }

          const currentUsername = manager.getUsername();
          if (!currentUsername) {
            return;
          }

          const meta = state[currentUsername]?.metas?.[0];
          const userId = meta?.user_id;
          if (!userId) {
            return;
          }

          userChannelJoinAttemptedRef.current = true;
          manager.joinUserChannel(userId).catch((err) => {
            console.error("Failed to join user channel:", err);
            userChannelJoinAttemptedRef.current = false;
          });
        },
        onPresenceDiff: (channelSlug, diff) => {
          // ChannelManager already routes to active channel only
          setPresenceState((prev) => applyPresenceDiff(prev, diff));
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
          // Track locally for notification filtering
          myUsername = joinedUsername;
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
          // Someone else was invited, update subscribers list for this channel
          setSubscriberCache((prev) => {
            const currentSubs = prev[channelSlug] || [];
            // Check if already in list
            const exists = currentSubs.some((s) => s.user_id === invitedUserId);
            if (!exists) {
              return {
                ...prev,
                [channelSlug]: [...currentSubs, { username: invitedUsername, user_id: invitedUserId, role: "member" }],
              };
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
          // Someone else was removed, update subscribers list for this channel
          setSubscriberCache((prev) => {
            const currentSubs = prev[channelSlug] || [];
            return {
              ...prev,
              [channelSlug]: currentSubs.filter((s) => s.username !== removedUsername),
            };
          });
        },
        onGlobalPresenceState: (state) => {
          setGlobalPresence(state);
        },
        onGlobalPresenceDiff: (diff) => {
          setGlobalPresence((prev) => applyPresenceDiff(prev, diff));
        },
        onChannelListChanged: () => {
          // Called when user is added to a channel via web invite
          onChannelListChanged?.();
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

        // Join status channel for global presence (used by AtAGlance)
        await manager.joinStatusChannel();

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

    // Load history for this channel
    async function loadHistory() {
      // Set active channel in manager (affects message routing)
      // This also subscribes to the channel if not already subscribed
      await manager.setActiveChannel(currentChannel);
      if (isLoadingHistory.current || !manager) return;

      isLoadingHistory.current = true;

      try {
        // Fetch history from API
        const history = await manager.fetchHistory(currentChannel);

        // Fetch subscribers if private channel
        if (currentChannel.startsWith("private_room:")) {
          const subs = await manager.fetchSubscribers(currentChannel);
          setSubscriberCache((prev) => ({
            ...prev,
            [currentChannel]: subs,
          }));
        } else {
          // Public channel - no subscriber list
          setSubscriberCache((prev) => ({
            ...prev,
            [currentChannel]: [],
          }));
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

        // Update cache for this channel
        setMessageCache((prev) => ({
          ...prev,
          [currentChannel]: deduplicated,
        }));

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
    globalPresence,
    subscribers,
    connect, // No-op for backward compatibility
    disconnect, // No-op for backward compatibility
    channelManager: channelsReady ? managerRef.current : null,
  };
}

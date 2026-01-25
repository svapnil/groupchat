import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { fetchDmConversations } from "../lib/chat-client.js";
import { getConfig } from "../lib/config.js";
import { ChannelManager } from "../lib/channel-manager.js";
import { getNotificationManager } from "../lib/notification-manager.js";
import { truncatePreview, sortConversationsByActivity } from "../lib/dm-utils.js";
import type { DmConversation, DmMessage } from "../lib/types.js";

interface UseDmsResult {
  conversations: DmConversation[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  totalDmUnreadCount: number;
  clearUnreadCount: (dmSlug: string) => void;
}

export function useDms(
  token: string | null,
  channelManager: ChannelManager | null,
  currentUsername: string | null,
  activeDmSlug?: string | null
): UseDmsResult {
  const [conversations, setConversations] = useState<DmConversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use refs for values that change frequently to avoid callback recreation
  const activeDmSlugRef = useRef(activeDmSlug);
  const currentUsernameRef = useRef(currentUsername);

  // Keep refs in sync
  useEffect(() => {
    activeDmSlugRef.current = activeDmSlug;
  }, [activeDmSlug]);

  useEffect(() => {
    currentUsernameRef.current = currentUsername;
  }, [currentUsername]);

  const fetchData = useCallback(async () => {
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      const config = getConfig();
      const data = await fetchDmConversations(config.wsUrl, token);
      setConversations(sortConversationsByActivity(data.conversations));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch DM conversations");
    } finally {
      setLoading(false);
    }
  }, [token]);

  const totalDmUnreadCount = useMemo(() => {
    return conversations.reduce((sum, conv) => sum + conv.unread_count, 0);
  }, [conversations]);

  /**
   * Clear unread count for a specific DM (called when entering a DM conversation)
   */
  const clearUnreadCount = useCallback((dmSlug: string) => {
    setConversations((prev) =>
      prev.map((conv) =>
        conv.slug === dmSlug ? { ...conv, unread_count: 0 } : conv
      )
    );
  }, []);

  /**
   * Handle incoming DM message - update conversation list in real-time.
   * Optimized to move updated conversation to front (O(n)) instead of full sort (O(n log n)).
   */
  const handleDmMessage = useCallback((msg: DmMessage) => {
    const now = new Date().toISOString();
    const preview = truncatePreview(msg.content);

    // Read current values from refs
    const isActiveConversation = activeDmSlugRef.current === msg.dm_slug;
    const isOwnMessage = msg.username === currentUsernameRef.current;

    setConversations((prev) => {
      const existingIndex = prev.findIndex((conv) => conv.slug === msg.dm_slug);

      if (existingIndex >= 0) {
        // Update existing: remove from current position, update, prepend to front
        const updated = prev.filter((_, idx) => idx !== existingIndex);
        const conversation: DmConversation = {
          ...prev[existingIndex],
          last_activity_at: now,
          last_message_preview: preview,
          unread_count: isActiveConversation || isOwnMessage
            ? prev[existingIndex].unread_count
            : prev[existingIndex].unread_count + 1,
        };
        return [conversation, ...updated];
      } else {
        // New conversation - prepend to front
        const newConversation: DmConversation = {
          channel_id: msg.dm_slug,
          slug: msg.dm_slug,
          other_user_id: msg.sender_id,
          other_username: msg.username,
          last_activity_at: now,
          last_message_preview: preview,
          unread_count: isOwnMessage ? 0 : 1,
        };
        return [newConversation, ...prev];
      }
    });

    // Trigger bell notification for messages from others (not in active conversation)
    if (!isOwnMessage && !isActiveConversation) {
      getNotificationManager().notify("bell");
    }
  }, []); // No deps - uses refs for changing values

  // Set up DM message callback on channelManager (only when channelManager changes)
  useEffect(() => {
    if (!channelManager) {
      return;
    }

    // Store the original callback from channel-manager (before any component sets it)
    const originalCallback = channelManager["callbacks"].onDmMessage;

    // Set up our callback as the base handler
    channelManager["callbacks"].onDmMessage = handleDmMessage;

    return () => {
      // Restore original callback on cleanup
      channelManager["callbacks"].onDmMessage = originalCallback;
    };
  }, [channelManager, handleDmMessage]);

  // Fetch on mount when token is available
  useEffect(() => {
    if (token) {
      fetchData();
    }
  }, [token, fetchData]);

  return {
    conversations,
    loading,
    error,
    refetch: fetchData,
    totalDmUnreadCount,
    clearUnreadCount,
  };
}

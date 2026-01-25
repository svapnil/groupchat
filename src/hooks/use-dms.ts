import { useState, useCallback, useEffect, useMemo } from "react";
import { fetchDmConversations } from "../lib/chat-client.js";
import { getConfig } from "../lib/config.js";
import type { DmConversation } from "../lib/types.js";

interface UseDmsResult {
  conversations: DmConversation[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  totalDmUnreadCount: number;
}

export function useDms(token: string | null): UseDmsResult {
  const [conversations, setConversations] = useState<DmConversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      const config = getConfig();
      const data = await fetchDmConversations(config.wsUrl, token);

      // Sort conversations by last_activity_at descending (most recent first)
      const sortedConversations = [...data.conversations].sort((a, b) => {
        return new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime();
      });

      setConversations(sortedConversations);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch DM conversations");
    } finally {
      setLoading(false);
    }
  }, [token]);

  const totalDmUnreadCount = useMemo(() => {
    return conversations.reduce((sum, conv) => sum + conv.unread_count, 0);
  }, [conversations]);

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
  };
}

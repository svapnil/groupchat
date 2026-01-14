import { useState, useCallback, useEffect } from "react";
import { fetchChannels, fetchUnreadCounts } from "../lib/chat-client.js";
import { getConfig } from "../lib/config.js";
import type { Channel, UnreadCounts } from "../lib/types.js";

interface UseChannelsResult {
  publicChannels: Channel[];
  privateChannels: Channel[];
  unreadCounts: UnreadCounts;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  refetchUnreadCounts: () => Promise<void>;
}

export function useChannels(token: string | null): UseChannelsResult {
  const [publicChannels, setPublicChannels] = useState<Channel[]>([]);
  const [privateChannels, setPrivateChannels] = useState<Channel[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<UnreadCounts>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      const config = getConfig();

      // Fetch channels and unread counts in parallel
      const [channelsData, unreadData] = await Promise.all([
        fetchChannels(config.wsUrl, token),
        fetchUnreadCounts(config.wsUrl, token),
      ]);

      setPublicChannels(channelsData.channels.public);
      setPrivateChannels(channelsData.channels.private);
      setUnreadCounts(unreadData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, [token]);

  const refetchUnreadCounts = useCallback(async () => {
    if (!token) return;

    try {
      const config = getConfig();
      const unreadData = await fetchUnreadCounts(config.wsUrl, token);
      setUnreadCounts(unreadData);
    } catch (err) {
      console.error("Failed to refetch unread counts:", err);
    }
  }, [token]);

  // Fetch on mount when token is available
  useEffect(() => {
    if (token) {
      fetchData();
    }
  }, [token, fetchData]);

  return {
    publicChannels,
    privateChannels,
    unreadCounts,
    loading,
    error,
    refetch: fetchData,
    refetchUnreadCounts,
  };
}

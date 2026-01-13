import { useState, useCallback, useEffect } from "react";
import { fetchChannels } from "../lib/chat-client.js";
import { getConfig } from "../lib/config.js";
import type { Channel } from "../lib/types.js";

interface UseChannelsResult {
  publicChannels: Channel[];
  privateChannels: Channel[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useChannels(token: string | null): UseChannelsResult {
  const [publicChannels, setPublicChannels] = useState<Channel[]>([]);
  const [privateChannels, setPrivateChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      const config = getConfig();
      const data = await fetchChannels(config.wsUrl, token);
      setPublicChannels(data.channels.public);
      setPrivateChannels(data.channels.private);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch channels");
    } finally {
      setLoading(false);
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
    loading,
    error,
    refetch: fetchData,
  };
}

import { useState, useEffect, useMemo, useRef } from "react";
import { searchUsers } from "../lib/chat-client.js";
import { getConfig } from "../lib/config.js";
import { debounce } from "../lib/debounce.js";
import type { UserSearchResult } from "../lib/types.js";

/**
 * Custom hook for async user search.
 *
 * Used primarily for the /invite command to search all users in the database
 * and exclude those already subscribed to the current channel.
 *
 * Features:
 * - Debounced search (300ms) to reduce API calls
 * - Client-side caching by query + channel slug
 * - Automatic cache clearing when query/channel changes
 *
 * @param token - Authentication token
 * @param query - Username prefix to search for (without '@' prefix)
 * @param channelSlug - Optional channel slug to exclude subscribers from results
 * @returns Object with suggestions array and loading state
 */
export function useUserSearch(
  token: string | null,
  query: string | null,
  channelSlug: string | null
) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const cacheRef = useRef<Map<string, UserSearchResult[]>>(new Map());
  const { wsUrl } = getConfig();

  // Debounced search function
  const debouncedSearch = useMemo(
    () => debounce(async (q: string, slug: string) => {
      if (!token) return;

      // Build cache key including channel slug
      const cacheKey = `${q}:${slug}`;

      // Check cache first
      if (cacheRef.current.has(cacheKey)) {
        const cached = cacheRef.current.get(cacheKey)!;
        setResults(cached);
        setSuggestions(cached.map(u => `@${u.username}`));
        return;
      }

      // Perform API search
      setIsLoading(true);
      try {
        const result = await searchUsers(wsUrl, token, q, slug);
        cacheRef.current.set(cacheKey, result.users);
        setResults(result.users);
        setSuggestions(result.users.map(u => `@${u.username}`));
      } catch (err) {
        console.error('User search failed:', err);
        setResults([]);
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    }, 300),
    [wsUrl, token]
  );

  // Trigger search when query or channel changes
  useEffect(() => {
    if (query && query.length > 0 && channelSlug) {
      debouncedSearch(query, channelSlug);
    } else {
      setResults([]);
      setSuggestions([]);
      cacheRef.current.clear();
    }
  }, [query, channelSlug, debouncedSearch]);

  return { suggestions, results, isLoading };
}

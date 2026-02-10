import { createEffect, createMemo, createSignal } from "solid-js"
import { searchUsers } from "../lib/chat-client"
import { getConfig } from "../lib/config"
import { debounce } from "../lib/debounce"
import type { UserSearchResult } from "../lib/types"

export const useUserSearch = (options: {
  token: () => string | null
  query: () => string | null
  channelSlug?: () => string | null
  requireChannelSlug?: boolean
  minQueryLength?: number
}) => {
  const [suggestions, setSuggestions] = createSignal<string[]>([])
  const [results, setResults] = createSignal<UserSearchResult[]>([])
  const [isLoading, setIsLoading] = createSignal(false)
  const cache = new Map<string, UserSearchResult[]>()
  const { wsUrl } = getConfig()
  const requireChannelSlug = () => options.requireChannelSlug ?? false
  const minQueryLength = () => options.minQueryLength ?? 1

  const debouncedSearch = createMemo(() =>
    debounce(async (query: string, slug: string | null, token: string) => {
      const cacheKey = `${query}:${slug ?? ""}`

      if (cache.has(cacheKey)) {
        const cached = cache.get(cacheKey) ?? []
        setResults(cached)
        setSuggestions(cached.map((user) => user.username))
        return
      }

      setIsLoading(true)
      try {
        const result = await searchUsers(wsUrl, token, query, slug ?? undefined)
        cache.set(cacheKey, result.users)
        setResults(result.users)
        setSuggestions(result.users.map((user) => user.username))
      } catch (err) {
        console.error("User search failed:", err)
        setResults([])
        setSuggestions([])
      } finally {
        setIsLoading(false)
      }
    }, 300)
  )

  createEffect(() => {
    const token = options.token()
    const query = options.query()
    const slug = options.channelSlug ? options.channelSlug() : null

    if (
      token &&
      query &&
      query.length >= minQueryLength() &&
      (!requireChannelSlug() || slug)
    ) {
      debouncedSearch()(query, slug, token)
    } else {
      setResults([])
      setSuggestions([])
      cache.clear()
    }
  })

  return {
    suggestions,
    results,
    isLoading,
  }
}

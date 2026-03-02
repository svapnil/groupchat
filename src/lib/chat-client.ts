// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import type {
  Message,
  ChannelsResponse,
  CreateChannelResponse,
  UnreadCounts,
  SubscribersResponse,
  UserSearchResponse,
  DmConversationsResponse,
  CreateDmResponse,
} from "./types.js";

/**
 * Fetch channels from the backend API.
 * This is a standalone function since it doesn't require WebSocket connection.
 */
export async function fetchChannels(
  wsUrl: string,
  token: string
): Promise<ChannelsResponse> {
  // Extract backend HTTP URL from WebSocket URL
  // e.g., wss://api.groupchatty.com/socket -> https://api.groupchatty.com
  const backendUrl = wsUrl
    .replace(/^wss:/, "https:")
    .replace(/^ws:/, "http:")
    .replace(/\/socket$/, "");

  const url = `${backendUrl}/api/channels`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch channels: ${response.status}`);
  }

  return response.json() as Promise<ChannelsResponse>;
}

/**
 * Fetch unread counts for all channels from the backend API.
 */
export async function fetchUnreadCounts(
  wsUrl: string,
  token: string
): Promise<UnreadCounts> {
  const backendUrl = wsUrl
    .replace(/^wss:/, "https:")
    .replace(/^ws:/, "http:")
    .replace(/\/socket$/, "");

  const url = `${backendUrl}/api/unread-counts`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch unread counts: ${response.status}`);
  }

  const data = await response.json() as { unread_counts: UnreadCounts };
  return data.unread_counts || {};
}

/**
 * Update last_seen for a channel via HTTP.
 * (Fallback if WebSocket not available)
 */
export async function updateLastSeen(
  wsUrl: string,
  token: string,
  channelSlug: string,
  seqNo: number
): Promise<void> {
  const backendUrl = wsUrl
    .replace(/^wss:/, "https:")
    .replace(/^ws:/, "http:")
    .replace(/\/socket$/, "");

  const encodedSlug = encodeURIComponent(channelSlug);
  const url = `${backendUrl}/api/last-seen/${encodedSlug}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ seq_no: seqNo }),
  });

  if (!response.ok) {
    throw new Error(`Failed to update last_seen: ${response.status}`);
  }
}

/**
 * Fetch subscribers for a private channel from the backend API.
 * Returns all users who have an active subscription to the channel.
 */
export async function fetchSubscribers(
  wsUrl: string,
  token: string,
  channelSlug: string
): Promise<SubscribersResponse> {
  const backendUrl = wsUrl
    .replace(/^wss:/, "https:")
    .replace(/^ws:/, "http:")
    .replace(/\/socket$/, "");

  const encodedSlug = encodeURIComponent(channelSlug);
  const url = `${backendUrl}/api/channels/${encodedSlug}/subscribers`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch subscribers: ${response.status}`);
  }

  return response.json() as Promise<SubscribersResponse>;
}

/**
 * Search for users by username prefix.
 * When channelSlug is provided, excludes users already subscribed to that channel.
 */
export async function searchUsers(
  wsUrl: string,
  token: string,
  startsWith: string,
  channelSlug?: string,
  limit: number = 20
): Promise<UserSearchResponse> {
  const backendUrl = wsUrl
    .replace(/^wss:/, "https:")
    .replace(/^ws:/, "http:")
    .replace(/\/socket$/, "");

  const encodedStartsWith = encodeURIComponent(startsWith);
  const params = new URLSearchParams({
    startsWith: encodedStartsWith,
    limit: limit.toString(),
  });

  if (channelSlug) {
    params.append("channel_slug", encodeURIComponent(channelSlug));
  }

  const url = `${backendUrl}/api/users/search?${params.toString()}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to search users: ${response.status}`);
  }

  return response.json() as Promise<UserSearchResponse>;
}

/**
 * Create a new private channel.
 * Returns the created channel and updated channel list.
 */
export async function createChannel(
  wsUrl: string,
  token: string,
  name: string,
  description?: string
): Promise<CreateChannelResponse> {
  const backendUrl = wsUrl
    .replace(/^wss:/, "https:")
    .replace(/^ws:/, "http:")
    .replace(/\/socket$/, "");

  const url = `${backendUrl}/api/channels`;

  const body: { name: string; description?: string } = { name };
  if (description) {
    body.description = description;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const data = await response.json() as { error?: string };
    throw new Error(data.error || `Failed to create channel: ${response.status}`);
  }

  return response.json() as Promise<CreateChannelResponse>;
}

// ============================================================================
// Direct Message API Functions
// ============================================================================

/**
 * Fetch DM conversations for the current user.
 */
export async function fetchDmConversations(
  wsUrl: string,
  token: string
): Promise<DmConversationsResponse> {
  const backendUrl = wsUrl
    .replace(/^wss:/, "https:")
    .replace(/^ws:/, "http:")
    .replace(/\/socket$/, "");

  const url = `${backendUrl}/api/dm`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch DM conversations: ${response.status}`);
  }

  return response.json() as Promise<DmConversationsResponse>;
}

/**
 * Create a new DM conversation with another user, or get existing.
 * Can use either other_user_id or other_username.
 */
export async function createOrGetDm(
  wsUrl: string,
  token: string,
  otherUser: { user_id: number } | { username: string }
): Promise<CreateDmResponse> {
  const backendUrl = wsUrl
    .replace(/^wss:/, "https:")
    .replace(/^ws:/, "http:")
    .replace(/\/socket$/, "");

  const url = `${backendUrl}/api/dm`;

  const body = "user_id" in otherUser
    ? { other_user_id: otherUser.user_id }
    : { other_username: otherUser.username };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const data = await response.json() as { error?: string };
    throw new Error(data.error || `Failed to create DM: ${response.status}`);
  }

  return response.json() as Promise<CreateDmResponse>;
}

/**
 * Fetch messages for a specific DM conversation.
 */
export async function fetchDmMessages(
  wsUrl: string,
  token: string,
  dmSlug: string,
  limit: number = 50
): Promise<{ messages: Message[]; dm_slug: string }> {
  const backendUrl = wsUrl
    .replace(/^wss:/, "https:")
    .replace(/^ws:/, "http:")
    .replace(/\/socket$/, "");

  const encodedSlug = encodeURIComponent(dmSlug);
  const url = `${backendUrl}/api/dm/${encodedSlug}/messages?limit=${limit}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch DM messages: ${response.status}`);
  }

  return response.json() as Promise<{ messages: Message[]; dm_slug: string }>;
}

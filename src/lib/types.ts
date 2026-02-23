// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
/**
 * Shared types for the TUI chat application.
 * Adapted from extension/webview/lib/types.ts
 */

export interface MessageAttributes {
  /** Extensible map for message metadata */
  [key: string]: unknown;
  claude?: ClaudeMessageMetadata;
  cc?: CcEventMetadata;
}

export interface CcEventMetadata {
  turn_id: string;
  session_id?: string;
  event: "question" | "tool_call" | "text" | "result";
  tool_name?: string;
  is_error?: boolean;
  events?: CcEventMetadata[];
  contents?: string[];
}

export type ClaudeContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string | ClaudeContentBlock[]; is_error?: boolean }
  | { type: "thinking"; thinking: string; budget_tokens?: number };

export interface ClaudeResultMetadata {
  subtype: string;
  isError: boolean;
  numTurns?: number;
  totalCostUsd?: number;
  durationMs?: number;
}

export interface ClaudePermissionRequest {
  requestId: string;
  toolName: string;
  toolUseId: string;
  agentId?: string;
  description?: string;
  input: Record<string, unknown>;
  /** Set once the user responds or the request is cancelled */
  resolution?: "allowed" | "denied" | "cancelled";
}

export interface ClaudeMessageMetadata {
  parentToolUseId: string | null;
  contentBlocks: ClaudeContentBlock[];
  model?: string;
  stopReason?: string | null;
  streaming?: boolean;
  thinking?: boolean;
  interrupted?: boolean;
  eventType?: "assistant" | "stream_event" | "streamlined_text" | "streamlined_tool_use_summary" | "result";
  result?: ClaudeResultMetadata;
  permissionRequest?: ClaudePermissionRequest;
}

export interface Message {
  id: string;
  username: string;
  content: string;
  timestamp: string;

  /** Message type - defaults to "user" for regular messages */
  type?: "user" | "system" | "claude-response" | "cc";

  /** Optional attributes - only present when message has attributes */
  attributes?: MessageAttributes;
}

export interface User {
  username: string;
  user_id: number;
  online_at: string;
}

export interface Subscriber {
  user_id: number;
  username: string;
  role: "member" | "admin";
}

export interface SubscribersResponse {
  subscribers: Subscriber[];
  count: number;
}

export interface UserSearchResult {
  user_id: number;
  username: string;
}

export interface UserSearchResponse {
  users: UserSearchResult[];
  count: number;
}

export type AgentType = "claude" | "codex" | "cursor" | "windsurf" | null;

export interface PresenceState {
  [username: string]: {
    metas: Array<{
      phx_ref: string;
      username: string;
      user_id: number;
      online_at: string;
      current_agent: AgentType;
    }>;
  };
}

export interface PresenceDiff {
  joins: PresenceState;
  leaves: PresenceState;
}

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export type AuthState = "unauthenticated" | "authenticating" | "authenticated";

export interface Channel {
  id: string;
  slug: string;
  type: "public" | "private";
  name: string;
  description: string | null;
  seqNo?: number;
}

export interface ChannelsResponse {
  channels: {
    public: Channel[];
    private: Channel[];
  };
}

export interface CreateChannelResponse {
  channel: Channel;
  channels: {
    public: Channel[];
    private: Channel[];
  };
}

export interface UnreadCounts {
  [channelSlug: string]: number;
}

/**
 * Internal state for each channel in the ChannelManager.
 * Stores presence, typing indicators, and buffered real-time messages.
 */
export interface ChannelState {
  slug: string;
  presence: PresenceState;
  typingUsers: Set<string>;
  realtimeMessages: Message[];
}

/**
 * Callbacks for the ChannelManager.
 * Each callback includes the channelSlug to identify which channel the event came from.
 */
export interface ChannelManagerCallbacks {
  onMessage?: (channelSlug: string, message: Message) => void;
  onNonActiveChannelMessage?: (channelSlug: string, message: Message) => void;
  onPresenceState?: (channelSlug: string, state: PresenceState) => void;
  onPresenceDiff?: (channelSlug: string, diff: PresenceDiff) => void;
  onUserTyping?: (channelSlug: string, username: string, typing: boolean) => void;
  onConnectionChange?: (status: ConnectionStatus) => void;
  onError?: (error: string) => void;
  onChannelJoined?: (channelSlug: string, username: string) => void;
  onInvitedToChannel?: (channelSlug: string, invitedBy: string) => void;
  onUserInvitedToChannel?: (channelSlug: string, username: string, userId: number, invitedBy: string) => void;
  onRemovedFromChannel?: (channelSlug: string, removedBy: string) => void;
  onUserRemovedFromChannel?: (channelSlug: string, username: string, removedBy: string) => void;
  onChannelListChanged?: () => void;

  // DM callbacks
  onDmMessage?: (message: DmMessage) => void;
  onDmTypingStart?: (dmSlug: string, username: string) => void;
  onDmTypingStop?: (dmSlug: string, username: string) => void;

  // Global presence callbacks (status channel)
  onGlobalPresenceState?: (state: PresenceState) => void;
  onGlobalPresenceDiff?: (diff: PresenceDiff) => void;
}

// ============================================================================
// Direct Message Types
// ============================================================================

export interface DmMessage {
  id: string;
  dm_slug: string;
  username: string;
  content: string;
  sender_id: number;
  attributes?: MessageAttributes;
}

export interface DmConversation {
  channel_id: string;
  slug: string;
  other_user_id: number;
  other_username: string;
  last_activity_at: string;
  last_message_preview: string | null;
  unread_count: number;
}

export interface DmConversationsResponse {
  conversations: DmConversation[];
}

export interface CreateDmResponse {
  channel_id: string;
  slug: string;
  other_user_id: number;
  other_username: string;
}

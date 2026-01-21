/**
 * Shared types for the TUI chat application.
 * Adapted from extension/webview/lib/types.ts
 */

export interface MessageAttributes {
  /** Extensible map for message metadata */
  [key: string]: unknown;
}

export interface Message {
  id: string;
  username: string;
  content: string;
  timestamp: string;

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

export interface PresenceState {
  [username: string]: {
    metas: Array<{
      phx_ref: string;
      username: string;
      user_id: number;
      online_at: string;
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
}

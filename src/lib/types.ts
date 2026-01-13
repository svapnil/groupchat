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
}

export interface ChannelsResponse {
  channels: {
    public: Channel[];
    private: Channel[];
  };
}

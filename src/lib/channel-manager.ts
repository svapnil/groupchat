import { Socket, Channel as PhoenixChannel } from "phoenix";
import type {
  Message,
  PresenceState,
  PresenceDiff,
  ConnectionStatus,
  Channel,
  ChannelManagerCallbacks,
  Subscriber,
} from "./types.js";

/**
 * Internal state for each channel subscription.
 * Includes the Phoenix Channel instance for sending messages.
 */
interface InternalChannelState {
  slug: string;
  channel: PhoenixChannel;
  presence: PresenceState;
  typingUsers: Set<string>;
  realtimeMessages: Message[];
  subscribers: Subscriber[];
}

// Ensure WebSocket is available globally for Phoenix.
// The CLI sets a Node polyfill in src/index.ts.
if (typeof globalThis.WebSocket === "undefined") {
  throw new Error(
    "WebSocket is not available. Load the ws polyfill before ChannelManager."
  );
}

/**
 * Extract timestamp from UUIDv7 (first 48 bits are Unix ms)
 */
function extractTimestampFromUUIDv7(uuid: string): string {
  const hex = uuid.replace(/-/g, "").slice(0, 12);
  const ms = parseInt(hex, 16);
  return new Date(ms).toISOString();
}

/**
 * Limit for buffered real-time messages per channel.
 * Prevents unbounded memory growth when viewing other channels.
 */
const MAX_REALTIME_MESSAGES_PER_CHANNEL = 100;

/**
 * ChannelManager manages a single persistent WebSocket connection
 * with multiple active channel subscriptions.
 *
 * This allows real-time message delivery to all subscribed channels
 * while only fetching history when the user navigates to a specific channel.
 */
export class ChannelManager {
  private socket: Socket | null = null;
  private channelStates: Map<string, InternalChannelState> = new Map();
  private callbacks: ChannelManagerCallbacks;
  private wsUrl: string;
  private token: string;
  private connectionStatus: ConnectionStatus = "disconnected";
  private currentActiveChannel: string | null = null;
  private username: string | null = null;

  constructor(wsUrl: string, token: string, callbacks: ChannelManagerCallbacks = {}) {
    this.wsUrl = wsUrl;
    this.token = token;
    this.callbacks = callbacks;
  }

  /**
   * Connect to the WebSocket and initialize the socket.
   * Does not subscribe to any channels yet - use subscribeToChannels() for that.
   */
  async connect(): Promise<void> {
    this.setConnectionStatus("connecting");

    // Create socket connection
    this.socket = new Socket(this.wsUrl, {
      params: { token: this.token },
      reconnectAfterMs: (tries: number) => {
        return [1000, 2000, 5000, 10000][tries - 1] || 10000;
      },
    });

    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error("Socket not initialized"));
        return;
      }

      // Setup socket event handlers
      this.socket.onOpen(() => {
        this.setConnectionStatus("connected");
        resolve();
      });

      this.socket.onError((error: unknown) => {
        this.setConnectionStatus("error");
        this.callbacks.onError?.("Connection error");
        reject(error);
      });

      this.socket.onClose(() => {
        this.setConnectionStatus("disconnected");
      });

      // Connect to the socket
      this.socket.connect();
    });
  }

  /**
   * Subscribe to multiple channels simultaneously.
   * Each channel will have its own ChannelState for tracking messages, presence, etc.
   */
  async subscribeToChannels(channels: Channel[]): Promise<void> {
    if (!this.socket) {
      throw new Error("Socket not connected. Call connect() first.");
    }

    const subscriptionPromises = channels.map((channel) =>
      this.subscribeToChannel(channel.slug)
    );

    // Wait for all channels to join (or fail)
    const results = await Promise.allSettled(subscriptionPromises);

    // Log any failures but don't throw - partial subscription is ok
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        const channelSlug = channels[index].slug;
        console.error(`Failed to subscribe to ${channelSlug}:`, result.reason);
        this.callbacks.onError?.(`Failed to join channel: ${channelSlug}`);
      }
    });
  }

  /**
   * Subscribe to a single channel and setup event handlers.
   */
  private async subscribeToChannel(channelSlug: string): Promise<void> {
    if (!this.socket) {
      throw new Error("Socket not connected");
    }

    // Create Phoenix channel instance
    const channel = this.socket.channel(channelSlug, {});

    // Initialize channel state with the channel instance
    const channelState: InternalChannelState = {
      slug: channelSlug,
      channel: channel,
      presence: {},
      typingUsers: new Set<string>(),
      realtimeMessages: [],
      subscribers: [],
    };

    // Setup event handlers for this channel
    this.setupChannelHandlers(channel, channelSlug);

    // Join the channel
    return new Promise((resolve, reject) => {
      channel
        .join()
        .receive("ok", (resp: unknown) => {
          const response = resp as { username?: string };

          // Store username (same across all channels)
          if (response.username && !this.username) {
            this.username = response.username;
          }

          // Store channel state
          this.channelStates.set(channelSlug, channelState);

          // Notify callback
          this.callbacks.onChannelJoined?.(channelSlug, response.username || "");

          resolve();
        })
        .receive("error", (error: unknown) => {
          const errorMsg = `Failed to join channel: ${channelSlug}`;
          this.callbacks.onError?.(errorMsg);
          reject(error);
        })
        .receive("timeout", () => {
          const errorMsg = `Timeout joining channel: ${channelSlug}`;
          this.callbacks.onError?.(errorMsg);
          reject(new Error("timeout"));
        });
    });
  }

  /**
   * Setup event handlers for a specific channel.
   * Handlers route events to the correct channel state and callbacks.
   */
  private setupChannelHandlers(channel: PhoenixChannel, channelSlug: string): void {
    // Handle new messages (timestamp extracted from UUIDv7)
    channel.on("new_message", (payload: unknown) => {
      const msg = payload as Omit<Message, "timestamp">;
      const message: Message = {
        ...msg,
        timestamp: extractTimestampFromUUIDv7(msg.id),
      };

      // Route message based on whether this is the active channel
      if (channelSlug === this.currentActiveChannel) {
        // Active channel - notify callback immediately
        this.callbacks.onMessage?.(channelSlug, message);
      } else {
        // Non-active channel - buffer message
        const state = this.channelStates.get(channelSlug);
        if (state) {
          state.realtimeMessages.push(message);

          // Limit buffer size to prevent memory issues
          if (state.realtimeMessages.length > MAX_REALTIME_MESSAGES_PER_CHANNEL) {
            state.realtimeMessages.shift(); // Remove oldest
          }
        }

        // Notify callback for non-active channel messages (for unread count tracking)
        this.callbacks.onNonActiveChannelMessage?.(channelSlug, message);
      }
    });

    // Handle presence state (initial list of online users)
    channel.on("presence_state", (payload: unknown) => {
      const state = payload as PresenceState;
      const channelState = this.channelStates.get(channelSlug);
      if (channelState) {
        channelState.presence = state;
      }
      // Only notify callback for active channel
      if (channelSlug === this.currentActiveChannel) {
        this.callbacks.onPresenceState?.(channelSlug, state);
      }
    });

    // Handle presence diff (users joining/leaving)
    channel.on("presence_diff", (payload: unknown) => {
      const diff = payload as PresenceDiff;
      const channelState = this.channelStates.get(channelSlug);

      if (channelState) {
        // Update presence state
        const next = { ...channelState.presence };

        // Remove leaves first (presence updates send leaves + joins for same user)
        Object.keys(diff.leaves).forEach((username) => {
          delete next[username];
        });

        // Add joins
        Object.entries(diff.joins).forEach(([username, data]) => {
          next[username] = data;
        });

        channelState.presence = next;
      }

      // Only notify callback for active channel
      if (channelSlug === this.currentActiveChannel) {
        this.callbacks.onPresenceDiff?.(channelSlug, diff);
      }
    });

    // Handle typing indicators
    channel.on("user_typing_start", (payload: unknown) => {
      const { username } = payload as { username: string };
      const channelState = this.channelStates.get(channelSlug);
      if (channelState) {
        channelState.typingUsers.add(username);
      }
      // Only notify callback for active channel
      if (channelSlug === this.currentActiveChannel) {
        this.callbacks.onUserTyping?.(channelSlug, username, true);
      }
    });

    channel.on("user_typing_stop", (payload: unknown) => {
      const { username } = payload as { username: string };
      const channelState = this.channelStates.get(channelSlug);
      if (channelState) {
        channelState.typingUsers.delete(username);
      }
      // Only notify callback for active channel
      if (channelSlug === this.currentActiveChannel) {
        this.callbacks.onUserTyping?.(channelSlug, username, false);
      }
    });

    // Handle user invitation to channel
    // TODO: Let's create realtime system messages to render this
    channel.on("user_invited", (payload: unknown) => {
      const { user_id, username, role, invited_by } = payload as {
        user_id: number;
        username: string;
        role: "member" | "admin";
        invited_by: string;
      };

      // If the invited user is the current user, notify them
      if (username === this.username) {
        this.callbacks.onInvitedToChannel?.(channelSlug, invited_by);
      } else {
        // Someone else was invited - update subscribers list
        const channelState = this.channelStates.get(channelSlug);
        if (channelState) {
          // Add to subscribers if not already there
          const exists = channelState.subscribers.some((s) => s.user_id === user_id);
          if (!exists) {
            channelState.subscribers.push({ user_id, username, role });
          }
        }

        // Notify callback for active channel
        if (channelSlug === this.currentActiveChannel) {
          this.callbacks.onUserInvitedToChannel?.(channelSlug, username, user_id, invited_by);
        }
      }
    });

    // Handle user removal from channel
    // TODO: Let's create realtime system messages to render this
    channel.on("user_removed", (payload: unknown) => {
      const { user_id, username, removed_by } = payload as {
        user_id: number;
        username: string;
        removed_by: string;
      };

      // If the removed user is the current user, leave the channel
      if (username === this.username) {
        // Leave the channel
        channel.leave();
        this.channelStates.delete(channelSlug);

        // Notify callback that we were removed
        this.callbacks.onRemovedFromChannel?.(channelSlug, removed_by);
      } else {
        // Someone else was removed - just update subscribers list
        const channelState = this.channelStates.get(channelSlug);
        if (channelState) {
          channelState.subscribers = channelState.subscribers.filter(
            (s) => s.user_id !== user_id
          );
        }

        // Notify callback for active channel
        if (channelSlug === this.currentActiveChannel) {
          this.callbacks.onUserRemovedFromChannel?.(channelSlug, username, removed_by);
        }
      }
    });
  }

  /**
   * Set the currently active channel.
   * This determines whether incoming messages are delivered immediately or buffered.
   */
  setActiveChannel(channelSlug: string): void {
    this.currentActiveChannel = channelSlug;
  }

  /**
   * Fetch message history for a specific channel from the HTTP API.
   */
  async fetchHistory(channelSlug: string, limit: number = 50): Promise<Message[]> {
    // Extract backend HTTP URL from WebSocket URL
    const backendUrl = this.wsUrl
      .replace(/^wss:/, "https:")
      .replace(/^ws:/, "http:")
      .replace(/\/socket$/, "");

    const encodedSlug = encodeURIComponent(channelSlug);
    const url = `${backendUrl}/api/messages/${encodedSlug}?limit=${limit}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch message history: ${response.status}`);
    }

    const data = (await response.json()) as { messages: Message[] };
    return data.messages || [];
  }

  /**
   * Fetch and store subscriber list for a private channel.
   * Only applicable to private channels.
   */
  async fetchSubscribers(channelSlug: string): Promise<Subscriber[]> {
    // Only fetch for private channels
    if (!channelSlug.startsWith("private_room:")) {
      return [];
    }

    const backendUrl = this.wsUrl
      .replace(/^wss:/, "https:")
      .replace(/^ws:/, "http:")
      .replace(/\/socket$/, "");

    const encodedSlug = encodeURIComponent(channelSlug);
    const url = `${backendUrl}/api/channels/${encodedSlug}/subscribers`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch subscribers: ${response.status}`);
    }

    const data = (await response.json()) as { subscribers: Subscriber[] };
    const subscribers = data.subscribers || [];

    // Store in channel state
    const channelState = this.channelStates.get(channelSlug);
    if (channelState) {
      channelState.subscribers = subscribers;
    }

    return subscribers;
  }

  /**
   * Get subscriber list for a specific channel.
   */
  getSubscribers(channelSlug: string): Subscriber[] {
    const channelState = this.channelStates.get(channelSlug);
    return channelState?.subscribers || [];
  }

  /**
   * Send a message to a specific channel.
   */
  async sendMessage(channelSlug: string, content: string): Promise<{ message_id: string }> {
    const channelState = this.channelStates.get(channelSlug);
    if (!channelState) {
      throw new Error(`Not subscribed to channel: ${channelSlug}`);
    }

    if (!this.socket || this.connectionStatus !== "connected") {
      throw new Error("Connection lost");
    }

    // Use the stored channel instance (already joined)
    const channel = channelState.channel;

    return new Promise((resolve, reject) => {
      channel
        .push("new_message", { content })
        .receive("ok", (resp: unknown) => {
          const response = resp as { message_id: string };
          resolve(response);
        })
        .receive("error", (err: unknown) => {
          const error = err as { reason?: string };
          const errorMsg = error.reason || "Failed to send message";
          this.callbacks.onError?.(errorMsg);
          reject(new Error(errorMsg));
        })
        .receive("timeout", () => {
          const errorMsg = "Message send timeout";
          this.callbacks.onError?.(errorMsg);
          reject(new Error("timeout"));
        });
    });
  }

  /**
   * Send a custom command event to a specific channel.
   */
  async sendCommand(
    channelSlug: string,
    eventType: string,
    data: any
  ): Promise<{ message_id: string }> {
    const channelState = this.channelStates.get(channelSlug);
    if (!channelState) {
      throw new Error(`Not subscribed to channel: ${channelSlug}`);
    }

    if (!this.socket || this.connectionStatus !== "connected") {
      throw new Error("Connection lost");
    }

    // Use the stored channel instance (already joined)
    const channel = channelState.channel;

    return new Promise((resolve, reject) => {
      channel
        .push(eventType, data)
        .receive("ok", (resp: unknown) => {
          const response = resp as { message_id: string };
          resolve(response);
        })
        .receive("error", (err: unknown) => {
          const error = err as { reason?: string };
          const errorMsg = error.reason || "Failed to send command";
          this.callbacks.onError?.(errorMsg);
          reject(new Error(errorMsg));
        })
        .receive("timeout", () => {
          const errorMsg = "Command send timeout";
          this.callbacks.onError?.(errorMsg);
          reject(new Error("timeout"));
        });
    });
  }

  /**
   * Send typing:start event to a specific channel.
   */
  startTyping(channelSlug: string): void {
    if (this.connectionStatus !== "connected") return;

    const channelState = this.channelStates.get(channelSlug);
    if (!channelState) return;

    try {
      channelState.channel.push("typing:start", {});
    } catch {
      // Ignore typing indicator errors
    }
  }

  /**
   * Send typing:stop event to a specific channel.
   */
  stopTyping(channelSlug: string): void {
    if (this.connectionStatus !== "connected") return;

    const channelState = this.channelStates.get(channelSlug);
    if (!channelState) return;

    try {
      channelState.channel.push("typing:stop", {});
    } catch {
      // Ignore typing indicator errors
    }
  }

  /**
   * Push an event to all subscribed channels.
   * Used for user-wide state updates like current_agent.
   */
  pushToAllChannels(eventType: string, payload: Record<string, unknown>): void {
    if (this.connectionStatus !== "connected") return;

    this.channelStates.forEach((state) => {
      try {
        state.channel.push(eventType, payload);
      } catch {
        // Ignore errors for individual channels
      }
    });
  }

  /**
   * Get presence state for a specific channel.
   */
  getPresence(channelSlug: string): PresenceState {
    const channelState = this.channelStates.get(channelSlug);
    return channelState?.presence || {};
  }

  /**
   * Get aggregated presence across all channels, deduplicated by user_id.
   * When a user appears in multiple channels, we prefer:
   * 1. Presence with current_agent set (if available)
   * 2. Most recent online_at timestamp
   */
  getAggregatedPresence(): PresenceState {
    // Map of user_id -> presence data for deduplication
    const userMap = new Map<number, {
      username: string;
      metas: PresenceState[string]["metas"];
      online_at: string;
      has_agent: boolean;
    }>();

    // Iterate through all channels and collect presence
    this.channelStates.forEach((channelState) => {
      Object.entries(channelState.presence).forEach(([username, data]) => {
        const meta = data.metas[0];
        if (!meta) return;

        const userId = meta.user_id;
        const hasAgent = !!meta.current_agent;
        const onlineAt = meta.online_at;

        const existing = userMap.get(userId);

        // Decide whether to use this presence data
        if (!existing) {
          // First time seeing this user
          userMap.set(userId, {
            username,
            metas: data.metas,
            online_at: onlineAt,
            has_agent: hasAgent,
          });
        } else {
          // User already exists - prefer presence with agent, or most recent
          const shouldReplace =
            (hasAgent && !existing.has_agent) ||
            (hasAgent === existing.has_agent && onlineAt > existing.online_at);

          if (shouldReplace) {
            userMap.set(userId, {
              username,
              metas: data.metas,
              online_at: onlineAt,
              has_agent: hasAgent,
            });
          }
        }
      });
    });

    // Convert back to PresenceState format
    const aggregated: PresenceState = {};
    userMap.forEach((data) => {
      aggregated[data.username] = {
        metas: data.metas,
      };
    });

    return aggregated;
  }

  /**
   * Get buffered real-time messages for a specific channel.
   * These are messages that arrived while viewing other channels.
   */
  getRealtimeMessages(channelSlug: string): Message[] {
    const channelState = this.channelStates.get(channelSlug);
    return channelState?.realtimeMessages || [];
  }

  /**
   * Clear buffered real-time messages for a specific channel.
   * Called after merging with fetched history.
   */
  clearRealtimeMessages(channelSlug: string): void {
    const channelState = this.channelStates.get(channelSlug);
    if (channelState) {
      channelState.realtimeMessages = [];
    }
  }

  /**
   * Get typing users for a specific channel.
   */
  getTypingUsers(channelSlug: string): string[] {
    const channelState = this.channelStates.get(channelSlug);
    return channelState ? Array.from(channelState.typingUsers) : [];
  }

  /**
   * Get the current connection status.
   */
  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  /**
   * Get the username (same across all channels).
   */
  getUsername(): string | null {
    return this.username;
  }

  /**
   * Check if connected.
   */
  isConnected(): boolean {
    return this.connectionStatus === "connected" && !!this.socket;
  }

  /**
   * Mark current channel as read via WebSocket.
   * Sends "mark_as_read" event to update last_seen to current seq_no.
   * Gracefully handles disconnected channels (returns silently during shutdown).
   */
  async markChannelAsRead(channelSlug: string): Promise<void> {
    const channelState = this.channelStates.get(channelSlug);
    if (!channelState || !channelState.channel) {
      // Channel already disconnected or not subscribed (expected during shutdown)
      return;
    }

    return new Promise((resolve, reject) => {
      channelState.channel.push("mark_as_read", {})
        .receive("ok", (response: unknown) => {
          console.log(`Marked ${channelSlug} as read`, response);
          resolve();
        })
        .receive("error", (err: unknown) => {
          console.error(`Failed to mark ${channelSlug} as read:`, err);
          reject(err);
        })
        .receive("timeout", () => {
          console.error(`Timeout marking ${channelSlug} as read`);
          reject(new Error("timeout"));
        });
    });
  }

  /**
   * Best-effort mark as read without waiting for an ack.
   * Useful during shutdown paths to avoid timeouts.
   */
  markChannelAsReadBestEffort(channelSlug: string): void {
    const channelState = this.channelStates.get(channelSlug);
    if (!channelState || !channelState.channel) {
      return;
    }

    try {
      channelState.channel.push("mark_as_read", {});
    } catch {
      // Ignore errors during shutdown.
    }
  }

  /**
   * Mark all messages in channel as read (used when first joining).
   * Gracefully handles disconnected channels (returns silently during shutdown).
   */
  async markAllMessagesAsRead(channelSlug: string): Promise<void> {
    const channelState = this.channelStates.get(channelSlug);
    if (!channelState || !channelState.channel) {
      // Channel already disconnected or not subscribed (expected during shutdown)
      return;
    }

    return new Promise((resolve, reject) => {
      channelState.channel.push("mark_all_read", {})
        .receive("ok", (response: unknown) => {
          console.log(`Marked all in ${channelSlug} as read`, response);
          resolve();
        })
        .receive("error", (err: unknown) => {
          console.error(`Failed to mark all as read in ${channelSlug}:`, err);
          reject(err);
        })
        .receive("timeout", () => {
          console.error(`Timeout marking all as read in ${channelSlug}`);
          reject(new Error("timeout"));
        });
    });
  }

  /**
   * Disconnect from all channels and close the socket.
   */
  disconnect(): void {
    // Leave all channels using stored channel instances
    this.channelStates.forEach((state) => {
      try {
        state.channel.leave();
      } catch {
        // Ignore errors during cleanup
      }
    });

    // Disconnect socket
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    // Clear all state
    this.channelStates.clear();
    this.currentActiveChannel = null;
    this.username = null;
    this.setConnectionStatus("disconnected");
  }

  /**
   * Set connection status and notify callback.
   */
  private setConnectionStatus(status: ConnectionStatus): void {
    this.connectionStatus = status;
    this.callbacks.onConnectionChange?.(status);
  }
}

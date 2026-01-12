import { Socket, Channel } from "phoenix";
import type {
  Message,
  MessageAttributes,
  PresenceState,
  PresenceDiff,
  ConnectionStatus,
} from "./types.js";

// Ensure WebSocket is available globally for Phoenix
// Bun has native WebSocket support
if (typeof globalThis.WebSocket === "undefined") {
  throw new Error(
    "WebSocket is not available. Please run with Bun: bun run dist/index.js"
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

export interface ChatClientConfig {
  wsUrl: string;
  token: string;
}

export interface ChatClientCallbacks {
  onMessage?: (message: Message) => void;
  onPresenceState?: (state: PresenceState) => void;
  onPresenceDiff?: (diff: PresenceDiff) => void;
  onUserTyping?: (username: string, typing: boolean) => void;
  onConnectionChange?: (status: ConnectionStatus) => void;
  onError?: (error: string) => void;
  onJoined?: (username: string) => void;
}

/**
 * Chat client for the TUI.
 * Adapted from extension/webview/lib/chat-client.ts
 */
export class ChatClient {
  private socket: Socket | null = null;
  private channel: Channel | null = null;
  private callbacks: ChatClientCallbacks;
  private config: ChatClientConfig;
  private connectionStatus: ConnectionStatus = "disconnected";

  constructor(config: ChatClientConfig, callbacks: ChatClientCallbacks = {}) {
    this.config = config;
    this.callbacks = callbacks;
  }

  async connect(): Promise<void> {
    this.setConnectionStatus("connecting");

    // Create socket connection
    this.socket = new Socket(this.config.wsUrl, {
      params: { token: this.config.token },
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

        // Now that socket is open, join the channel
        this.channel = this.socket!.channel("chat_room:global", {});

        // Setup channel event handlers
        this.setupChannelHandlers();

        // Join the channel
        this.channel
          .join()
          .receive("ok", async (resp: unknown) => {
            const response = resp as { username?: string };
            // Notify about successful join with username
            if (response.username) {
              this.callbacks.onJoined?.(response.username);
            }

            // Fetch message history from console API
            try {
              await this.fetchMessageHistory();
            } catch (err) {
              // Don't fail connection if history fetch fails
              console.warn("Failed to fetch message history:", err);
            }

            resolve();
          })
          .receive("error", (error: unknown) => {
            this.callbacks.onError?.("Failed to join chat room");
            reject(error);
          })
          .receive("timeout", () => {
            this.callbacks.onError?.("Connection timeout");
            reject(new Error("timeout"));
          });
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

  private async fetchMessageHistory(): Promise<void> {
    // Extract backend HTTP URL from WebSocket URL
    // e.g., wss://terminal-chat-backend.fly.dev/socket -> https://terminal-chat-backend.fly.dev
    const backendUrl = this.config.wsUrl
      .replace(/^wss:/, 'https:')
      .replace(/^ws:/, 'http:')
      .replace(/\/socket$/, '');

    const url = `${backendUrl}/api/messages/global?limit=50`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.config.token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch message history: ${response.status}`);
    }

    const data = await response.json() as { messages: Message[] };

    // Send historical messages through the callback
    if (data.messages && Array.isArray(data.messages)) {
      data.messages.forEach((msg) => {
        this.callbacks.onMessage?.(msg);
      });
    }
  }

  private setupChannelHandlers() {
    if (!this.channel) return;

    // Handle new messages (timestamp extracted from UUIDv7)
    this.channel.on("new_message", (payload: unknown) => {
      const msg = payload as Omit<Message, "timestamp">;
      const message: Message = {
        ...msg,
        timestamp: extractTimestampFromUUIDv7(msg.id),
      };
      this.callbacks.onMessage?.(message);
    });

    // Handle presence state (initial list of online users)
    this.channel.on("presence_state", (payload: unknown) => {
      const state = payload as PresenceState;
      this.callbacks.onPresenceState?.(state);
    });

    // Handle presence diff (users joining/leaving)
    this.channel.on("presence_diff", (payload: unknown) => {
      const diff = payload as PresenceDiff;
      this.callbacks.onPresenceDiff?.(diff);
    });

    // Handle typing indicators
    this.channel.on("user_typing_start", (payload: unknown) => {
      const { username } = payload as { username: string };
      this.callbacks.onUserTyping?.(username, true);
    });

    this.channel.on("user_typing_stop", (payload: unknown) => {
      const { username } = payload as { username: string };
      this.callbacks.onUserTyping?.(username, false);
    });
  }

  sendMessage(
    content: string,
    attributes?: MessageAttributes
  ): Promise<{ message_id: string }> {
    return new Promise((resolve, reject) => {
      if (!this.channel) {
        const error = "Not connected to chat.";
        this.callbacks.onError?.(error);
        reject(new Error(error));
        return;
      }

      if (!this.socket || this.connectionStatus !== "connected") {
        const error = "Connection lost.";
        this.callbacks.onError?.(error);
        reject(new Error(error));
        return;
      }

      // Build payload - only include attributes if provided and non-empty
      const payload: { content: string; attributes?: MessageAttributes } = { content };
      if (attributes && Object.keys(attributes).length > 0) {
        payload.attributes = attributes;
      }

      // Send the message
      this.channel
        .push("new_message", payload)
        .receive("ok", (resp: unknown) => {
          const response = resp as { message_id: string };
          resolve(response);
        })
        .receive("error", (err: unknown) => {
          const error = err as { reason?: string };
          const errorMsg = error.reason || "Failed to send message.";
          this.callbacks.onError?.(errorMsg);
          reject(new Error(errorMsg));
        })
        .receive("timeout", () => {
          const errorMsg = "Message send timeout.";
          this.callbacks.onError?.(errorMsg);
          reject(new Error("timeout"));
        });
    });
  }

  startTyping() {
    if (!this.channel || this.connectionStatus !== "connected") return;
    try {
      this.channel.push("typing:start", {});
    } catch {
      // Ignore typing indicator errors
    }
  }

  stopTyping() {
    if (!this.channel || this.connectionStatus !== "connected") return;
    try {
      this.channel.push("typing:stop", {});
    } catch {
      // Ignore typing indicator errors
    }
  }

  isConnected(): boolean {
    return this.connectionStatus === "connected" && !!this.socket && !!this.channel;
  }

  disconnect() {
    if (this.channel) {
      this.channel.leave();
      this.channel = null;
    }
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.setConnectionStatus("disconnected");
  }

  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  private setConnectionStatus(status: ConnectionStatus) {
    this.connectionStatus = status;
    this.callbacks.onConnectionChange?.(status);
  }
}

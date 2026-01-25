import { useState, useCallback, useRef, useEffect } from "react";
import { ChatClient } from "../lib/chat-client.js";
import { getConfig } from "../lib/config.js";
import { applyPresenceDiff } from "../lib/presence-utils.js";
import type {
  Message,
  ConnectionStatus,
  PresenceState,
} from "../lib/types.js";

export function useChat(token: string | null, channelSlug: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [username, setUsername] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [presenceState, setPresenceState] = useState<PresenceState>({});

  const clientRef = useRef<ChatClient | null>(null);

  // Connect to chat
  const connect = useCallback(async () => {
    if (!token || clientRef.current) return;

    const config = getConfig();

    const client = new ChatClient(
      {
        wsUrl: config.wsUrl,
        token,
        channelSlug,
      },
      {
        onMessage: (message) => {
          setMessages((prev) => [...prev, message]);
        },
        onPresenceState: (state) => {
          setPresenceState(state);
        },
        onPresenceDiff: (diff) => {
          setPresenceState((prev) => applyPresenceDiff(prev, diff));
        },
        onUserTyping: (user, isTyping) => {
          setTypingUsers((prev) => {
            if (isTyping) {
              return prev.includes(user) ? prev : [...prev, user];
            } else {
              return prev.filter((u) => u !== user);
            }
          });
        },
        onConnectionChange: (status) => {
          setConnectionStatus(status);
          if (status === "disconnected" || status === "error") {
            setError(null);
          }
        },
        onError: (err) => {
          setError(err);
        },
        onJoined: (joinedUsername) => {
          setUsername(joinedUsername);
        },
      }
    );

    clientRef.current = client;

    try {
      await client.connect();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    }
  }, [token, channelSlug]);

  // Disconnect from chat
  const disconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
    }
    setMessages([]);
    setUsername(null);
    setTypingUsers([]);
    setPresenceState({});
  }, []);

  // Send a message
  const sendMessage = useCallback(async (content: string) => {
    if (!clientRef.current) {
      throw new Error("Not connected");
    }
    await clientRef.current.sendMessage(content);
  }, []);

  // Typing indicators
  const startTyping = useCallback(() => {
    clientRef.current?.startTyping();
  }, []);

  const stopTyping = useCallback(() => {
    clientRef.current?.stopTyping();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (clientRef.current) {
        clientRef.current.disconnect();
        clientRef.current = null;
      }
    };
  }, []);

  return {
    messages,
    connectionStatus,
    username,
    error,
    sendMessage,
    startTyping,
    stopTyping,
    typingUsers,
    presenceState,
    connect,
    disconnect,
  };
}

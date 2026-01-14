import { useMemo } from "react";
import type { User, PresenceState, Subscriber } from "../lib/types.js";

/**
 * Extended user type with online status indicator.
 */
export interface UserWithStatus extends User {
  isOnline: boolean;
}

/**
 * Convert presence state to array of users.
 */
function presenceToUsers(presence: PresenceState): User[] {
  return Object.entries(presence).map(([username, data]) => ({
    username,
    user_id: data.metas[0]?.user_id ?? 0,
    online_at: data.metas[0]?.online_at || "",
  }));
}

/**
 * Merge subscribers with presence to create a complete user list.
 *
 * For private channels:
 * - Show all subscribers (from database)
 * - Mark each as online/offline based on presence
 *
 * For public channels:
 * - Show only online users from presence
 * - All are marked as online
 */
function mergeSubscribersWithPresence(
  subscribers: Subscriber[],
  presence: PresenceState,
  isPrivateChannel: boolean
): UserWithStatus[] {
  if (!isPrivateChannel) {
    // Public channel: only show online users
    const onlineUsers = presenceToUsers(presence);
    return onlineUsers.map((user) => ({
      ...user,
      isOnline: true,
    }));
  }

  // Private channel: show all subscribers with online status
  const onlineUsernames = new Set(Object.keys(presence));

  return subscribers.map((subscriber) => {
    const isOnline = onlineUsernames.has(subscriber.username);

    return {
      username: subscriber.username,
      user_id: subscriber.user_id,
      online_at: isOnline ? presence[subscriber.username].metas[0]?.online_at || "" : "",
      isOnline,
    };
  });
}

export function usePresence(
  presenceState: PresenceState,
  subscribers: Subscriber[] = [],
  currentChannel: string = ""
) {
  const isPrivateChannel = currentChannel.startsWith("private_room:");

  const users = useMemo(
    () => mergeSubscribersWithPresence(subscribers, presenceState, isPrivateChannel),
    [presenceState, subscribers, isPrivateChannel]
  );

  return { users };
}

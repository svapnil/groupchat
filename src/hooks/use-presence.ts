import { useMemo } from "react";
import type { User, PresenceState } from "../lib/types.js";

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

export function usePresence(presenceState: PresenceState) {
  const users = useMemo(() => presenceToUsers(presenceState), [presenceState]);

  return { users };
}

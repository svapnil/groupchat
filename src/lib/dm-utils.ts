/**
 * Shared utilities for DM handling.
 * Keeps logic DRY between hooks and components.
 */

import type { DmConversation } from "./types.js";

/**
 * Truncate content to create a message preview.
 * Matches backend logic in backend/lib/backend/chat.ex:873-879
 */
export function truncatePreview(content: string): string {
  if (content.length > 100) {
    return content.slice(0, 97) + "...";
  }
  return content;
}

/**
 * Sort conversations by last_activity_at descending (most recent first).
 * Returns a new sorted array.
 */
export function sortConversationsByActivity(conversations: DmConversation[]): DmConversation[] {
  return [...conversations].sort((a, b) => {
    return new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime();
  });
}

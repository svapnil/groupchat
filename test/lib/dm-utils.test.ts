import { describe, expect, test } from "bun:test"
import type { DmConversation } from "../../src/lib/types"
import { sortConversationsByActivity, truncatePreview } from "../../src/lib/dm-utils"

describe("dm-utils", () => {
  test("truncatePreview keeps short content unchanged", () => {
    const content = "short message"
    expect(truncatePreview(content)).toBe(content)
  })

  test("truncatePreview trims long content to 100 chars with ellipsis", () => {
    const content = "x".repeat(120)
    const preview = truncatePreview(content)

    expect(preview).toHaveLength(100)
    expect(preview.endsWith("...")).toBe(true)
  })

  test("sortConversationsByActivity sorts descending without mutating input", () => {
    const conversations: DmConversation[] = [
      {
        channel_id: "1",
        slug: "dm:alice",
        other_user_id: 10,
        other_username: "alice",
        last_activity_at: "2024-01-01T00:00:00.000Z",
        last_message_preview: "old",
        unread_count: 0,
      },
      {
        channel_id: "2",
        slug: "dm:bob",
        other_user_id: 20,
        other_username: "bob",
        last_activity_at: "2024-01-03T00:00:00.000Z",
        last_message_preview: "new",
        unread_count: 2,
      },
    ]

    const sorted = sortConversationsByActivity(conversations)

    expect(sorted.map((c) => c.slug)).toEqual(["dm:bob", "dm:alice"])
    expect(conversations.map((c) => c.slug)).toEqual(["dm:alice", "dm:bob"])
  })
})

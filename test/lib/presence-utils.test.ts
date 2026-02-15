import { describe, expect, test } from "bun:test"
import type { PresenceDiff, PresenceState } from "../../src/lib/types"
import { applyPresenceDiff } from "../../src/lib/presence-utils"

const createMeta = (phx_ref: string, username: string, user_id: number) => ({
  phx_ref,
  username,
  user_id,
  online_at: "2024-01-01T00:00:00.000Z",
  current_agent: null,
})

describe("applyPresenceDiff", () => {
  test("merges joins and removes leaves by phx_ref", () => {
    const prev: PresenceState = {
      alice: { metas: [createMeta("ref-1", "alice", 1), createMeta("ref-2", "alice", 1)] },
      bob: { metas: [createMeta("ref-3", "bob", 2)] },
    }

    const diff: PresenceDiff = {
      leaves: {
        alice: { metas: [createMeta("ref-1", "alice", 1)] },
      },
      joins: {
        charlie: { metas: [createMeta("ref-4", "charlie", 3)] },
      },
    }

    const next = applyPresenceDiff(prev, diff)

    expect(next.alice?.metas.map((m) => m.phx_ref)).toEqual(["ref-2"])
    expect(next.charlie?.metas.map((m) => m.phx_ref)).toEqual(["ref-4"])
    expect(next.bob?.metas.map((m) => m.phx_ref)).toEqual(["ref-3"])
  })

  test("removes user entirely when all metas leave", () => {
    const prev: PresenceState = {
      alice: { metas: [createMeta("ref-1", "alice", 1)] },
    }

    const diff: PresenceDiff = {
      leaves: {
        alice: { metas: [createMeta("ref-1", "alice", 1)] },
      },
      joins: {},
    }

    const next = applyPresenceDiff(prev, diff)
    expect(next.alice).toBeUndefined()
  })

  test("upserts existing meta on join with same phx_ref", () => {
    const prev: PresenceState = {
      alice: { metas: [createMeta("ref-1", "alice", 1)] },
    }

    const updated = {
      ...createMeta("ref-1", "alice", 1),
      online_at: "2024-01-02T00:00:00.000Z",
    }

    const diff: PresenceDiff = {
      leaves: {},
      joins: {
        alice: { metas: [updated] },
      },
    }

    const next = applyPresenceDiff(prev, diff)
    expect(next.alice?.metas).toHaveLength(1)
    expect(next.alice?.metas[0]?.online_at).toBe("2024-01-02T00:00:00.000Z")
  })
})

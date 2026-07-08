// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { describe, expect, test } from "bun:test"
import { buildDayDividerSet, buildShowHeaderSet } from "../../src/components/MessageList"

function msg(username: string, timestamp: string) {
  return { username, timestamp }
}

describe("buildShowHeaderSet", () => {
  test("empty message list returns empty set", () => {
    expect(buildShowHeaderSet([])).toEqual(new Set())
  })

  test("single message always shows header", () => {
    const result = buildShowHeaderSet([msg("alice", "2024-01-01T10:00:00Z")])
    expect(result).toEqual(new Set([0]))
  })

  test("consecutive messages from different users all show headers", () => {
    const result = buildShowHeaderSet([
      msg("alice", "2024-01-01T10:00:00Z"),
      msg("bob", "2024-01-01T10:01:00Z"),
      msg("alice", "2024-01-01T10:02:00Z"),
    ])
    expect(result).toEqual(new Set([0, 1, 2]))
  })

  test("consecutive messages from the same user within 2 hours group together", () => {
    const result = buildShowHeaderSet([
      msg("alice", "2024-01-01T10:00:00Z"),
      msg("alice", "2024-01-01T10:30:00Z"),
      msg("alice", "2024-01-01T11:59:59Z"),
    ])
    expect(result).toEqual(new Set([0]))
  })

  test("same user with >2 hour gap re-shows header", () => {
    const result = buildShowHeaderSet([
      msg("alice", "2024-01-01T10:00:00Z"),
      msg("alice", "2024-01-01T12:00:01Z"),
    ])
    expect(result).toEqual(new Set([0, 1]))
  })

  test("exactly 2 hours does not re-show header", () => {
    const result = buildShowHeaderSet([
      msg("alice", "2024-01-01T10:00:00Z"),
      msg("alice", "2024-01-01T12:00:00Z"),
    ])
    expect(result).toEqual(new Set([0]))
  })

  test("mixed users and time gaps", () => {
    const result = buildShowHeaderSet([
      msg("alice", "2024-01-01T08:00:00Z"), // 0: first message
      msg("alice", "2024-01-01T09:00:00Z"), // 1: same user, <2h
      msg("bob", "2024-01-01T09:05:00Z"),   // 2: different user
      msg("bob", "2024-01-01T09:10:00Z"),   // 3: same user, <2h
      msg("bob", "2024-01-01T11:10:01Z"),   // 4: same user, >2h gap
      msg("alice", "2024-01-01T11:15:00Z"), // 5: different user
    ])
    expect(result).toEqual(new Set([0, 2, 4, 5]))
  })

  // Noon-UTC timestamps a full day apart stay on different local days under any
  // test-runner timezone, so a date change re-shows the header even for the same
  // user inside the 2-hour window.
  test("same user across a day boundary re-shows header", () => {
    const result = buildShowHeaderSet([
      msg("alice", "2024-01-01T12:00:00Z"),
      msg("alice", "2024-01-02T12:00:00Z"),
    ])
    expect(result).toEqual(new Set([0, 1]))
  })
})

describe("buildDayDividerSet", () => {
  function dmsg(timestamp: string) {
    return { timestamp }
  }

  test("empty message list returns empty set", () => {
    expect(buildDayDividerSet([])).toEqual(new Set())
  })

  test("first message always gets a divider", () => {
    expect(buildDayDividerSet([dmsg("2024-01-01T12:00:00Z")])).toEqual(new Set([0]))
  })

  test("messages on the same day share one divider", () => {
    const result = buildDayDividerSet([
      dmsg("2024-01-01T12:00:00Z"),
      dmsg("2024-01-01T15:00:00Z"),
      dmsg("2024-01-01T18:00:00Z"),
    ])
    expect(result).toEqual(new Set([0]))
  })

  test("each new local day gets a divider", () => {
    const result = buildDayDividerSet([
      dmsg("2024-01-01T12:00:00Z"), // 0: first day
      dmsg("2024-01-01T13:00:00Z"), // 1: same day
      dmsg("2024-01-02T12:00:00Z"), // 2: new day
      dmsg("2024-01-03T12:00:00Z"), // 3: new day
    ])
    expect(result).toEqual(new Set([0, 2, 3]))
  })
})

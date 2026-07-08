// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { describe, expect, test } from "bun:test"
import type { CcEventMetadata, Message } from "../../src/lib/types"
import { isClaudeEventMessage, upsertClaudeEventMessage } from "../../src/agent/claude/claude-event-message-mutations"

const TS = "2024-01-01T00:00:00.000Z"

function makeCcMessage(input: {
  id: string
  username: string
  content: string
  cc: CcEventMetadata
}): Message {
  return {
    id: input.id,
    username: input.username,
    content: input.content,
    timestamp: TS,
    type: "cc",
    attributes: {
      cc: input.cc,
    },
  }
}

function getCc(message: Message): CcEventMetadata {
  return message.attributes?.cc as CcEventMetadata
}

describe("claude-event-message-mutations", () => {
  test("recognizes valid cc event messages", () => {
    const message = makeCcMessage({
      id: "m1",
      username: "alice",
      content: "Question",
      cc: {
        turn_id: "turn-1",
        event: "question",
      },
    })

    expect(isClaudeEventMessage(message)).toBe(true)
  })

  test("initial upsert creates aggregated events and contents arrays", () => {
    const incoming = makeCcMessage({
      id: "m1",
      username: "alice",
      content: "What changed?",
      cc: {
        turn_id: "turn-1",
        event: "question",
      },
    })

    const updated = upsertClaudeEventMessage([], incoming, null)
    expect(updated).toHaveLength(1)
    expect(updated[0].type).toBe("cc")

    const cc = getCc(updated[0])
    expect(cc.events).toHaveLength(1)
    expect(cc.contents).toEqual(["What changed?"])
    expect(cc.events?.[0]).toEqual({
      turn_id: "turn-1",
      session_id: undefined,
      event: "question",
      tool_name: undefined,
      is_error: undefined,
    })
  })

  test("groups by session_id when present even across different turns", () => {
    const first = makeCcMessage({
      id: "m1",
      username: "alice",
      content: "What changed?",
      cc: {
        turn_id: "turn-1",
        session_id: "session-1",
        event: "question",
      },
    })

    const second = makeCcMessage({
      id: "m2",
      username: "alice",
      content: "Read(src/app.ts)",
      cc: {
        turn_id: "turn-2",
        session_id: "session-1",
        event: "tool_call",
        tool_name: "Read",
      },
    })

    const one = upsertClaudeEventMessage([], first, null)
    const two = upsertClaudeEventMessage(one, second, null)

    expect(two).toHaveLength(1)
    expect(two[0].content).toBe("Read(src/app.ts)")

    const cc = getCc(two[0])
    expect(cc.events?.map((event) => event.turn_id)).toEqual(["turn-1", "turn-2"])
    expect(cc.events?.map((event) => event.event)).toEqual(["question", "tool_call"])
    expect(cc.contents).toEqual(["What changed?", "Read(src/app.ts)"])
  })

  test("groups by turn_id when session_id is absent", () => {
    const first = makeCcMessage({
      id: "m1",
      username: "alice",
      content: "Turn one",
      cc: {
        turn_id: "turn-1",
        event: "question",
      },
    })

    const second = makeCcMessage({
      id: "m2",
      username: "alice",
      content: "Turn two",
      cc: {
        turn_id: "turn-2",
        event: "question",
      },
    })

    const one = upsertClaudeEventMessage([], first, null)
    const two = upsertClaudeEventMessage(one, second, null)

    expect(two).toHaveLength(2)
    expect(two[0].content).toBe("Turn one")
    expect(two[1].content).toBe("Turn two")
  })

  test("normalizes whitespace session_id and falls back to turn grouping", () => {
    const first = makeCcMessage({
      id: "m1",
      username: "alice",
      content: "Q1",
      cc: {
        turn_id: "turn-1",
        session_id: "   ",
        event: "question",
      },
    })

    const second = makeCcMessage({
      id: "m2",
      username: "alice",
      content: "A1",
      cc: {
        turn_id: "turn-1",
        event: "text",
      },
    })

    const one = upsertClaudeEventMessage([], first, null)
    const two = upsertClaudeEventMessage(one, second, null)

    expect(two).toHaveLength(1)
    const cc = getCc(two[0])
    expect(cc.events?.map((event) => event.event)).toEqual(["question", "text"])
    expect(cc.events?.[0].session_id).toBeUndefined()
    expect(cc.contents).toEqual(["Q1", "A1"])
  })

  test("does not merge across different usernames", () => {
    const first = makeCcMessage({
      id: "m1",
      username: "alice",
      content: "Q1",
      cc: {
        turn_id: "turn-1",
        session_id: "session-1",
        event: "question",
      },
    })

    const second = makeCcMessage({
      id: "m2",
      username: "bob",
      content: "Q1",
      cc: {
        turn_id: "turn-1",
        session_id: "session-1",
        event: "question",
      },
    })

    const one = upsertClaudeEventMessage([], first, null)
    const two = upsertClaudeEventMessage(one, second, null)

    expect(two).toHaveLength(2)
    expect(two[0].username).toBe("alice")
    expect(two[1].username).toBe("bob")
  })

  test("normalizes mismatched events/contents lengths before appending", () => {
    const existing: Message = {
      id: "m1",
      username: "alice",
      content: "Read(src/app.ts)",
      timestamp: TS,
      type: "cc",
      attributes: {
        cc: {
          turn_id: "turn-1",
          session_id: "session-1",
          event: "tool_call",
          events: [
            { turn_id: "turn-1", session_id: "session-1", event: "question" },
            { turn_id: "turn-1", session_id: "session-1", event: "tool_call", tool_name: "Read" },
          ],
          contents: ["What changed?"], // intentionally short
        },
      },
    }

    const incoming = makeCcMessage({
      id: "m2",
      username: "alice",
      content: "Summary text",
      cc: {
        turn_id: "turn-2",
        session_id: "session-1",
        event: "text",
      },
    })

    const updated = upsertClaudeEventMessage([existing], incoming, null)
    expect(updated).toHaveLength(1)

    const cc = getCc(updated[0])
    expect(cc.events).toHaveLength(3)
    expect(cc.contents).toHaveLength(3)
    expect(cc.contents).toEqual([
      "What changed?",
      "",
      "Summary text",
    ])
  })

  test("replaces live text snapshots and upgrades the tail to final text", () => {
    const question = makeCcMessage({
      id: "m1",
      username: "alice",
      content: "Summarize README",
      cc: {
        turn_id: "turn-1",
        session_id: "session-1",
        event: "question",
      },
    })
    const streamOne = makeCcMessage({
      id: "m2",
      username: "alice",
      content: "Hello",
      cc: {
        turn_id: "turn-1",
        session_id: "session-1",
        event: "text_stream",
      },
    })
    const streamTwo = makeCcMessage({
      id: "m3",
      username: "alice",
      content: "Hello world",
      cc: {
        turn_id: "turn-1",
        session_id: "session-1",
        event: "text_stream",
      },
    })
    const finalText = makeCcMessage({
      id: "m4",
      username: "alice",
      content: "Hello world",
      cc: {
        turn_id: "turn-1",
        session_id: "session-1",
        event: "text",
      },
    })

    const one = upsertClaudeEventMessage([], question, null)
    const two = upsertClaudeEventMessage(one, streamOne, null)
    const three = upsertClaudeEventMessage(two, streamTwo, null)
    const four = upsertClaudeEventMessage(three, finalText, null)

    const cc = getCc(four[0])
    expect(cc.events?.map((event) => event.event)).toEqual(["question", "text"])
    expect(cc.contents).toEqual(["Summarize README", "Hello world"])
  })

  test("replaces consecutive tool progress events for the same tool use", () => {
    const progressOne = makeCcMessage({
      id: "m1",
      username: "alice",
      content: "Read running (1.2s)",
      cc: {
        turn_id: "turn-1",
        session_id: "session-1",
        event: "tool_progress",
        tool_name: "Read",
        tool_use_id: "tool-1",
        elapsed_seconds: 1.2,
      },
    })
    const progressTwo = makeCcMessage({
      id: "m2",
      username: "alice",
      content: "Read running (2.4s)",
      cc: {
        turn_id: "turn-1",
        session_id: "session-1",
        event: "tool_progress",
        tool_name: "Read",
        tool_use_id: "tool-1",
        elapsed_seconds: 2.4,
      },
    })

    const one = upsertClaudeEventMessage([], progressOne, null)
    const two = upsertClaudeEventMessage(one, progressTwo, null)

    const cc = getCc(two[0])
    expect(cc.events?.map((event) => event.event)).toEqual(["tool_progress"])
    expect(cc.events?.[0].elapsed_seconds).toBe(2.4)
    expect(cc.contents).toEqual(["Read running (2.4s)"])
  })

  test("drops echoed inbound cc messages for current username", () => {
    const existing = makeCcMessage({
      id: "m1",
      username: "bob",
      content: "Existing",
      cc: {
        turn_id: "turn-existing",
        event: "text",
      },
    })

    const incomingOwn = makeCcMessage({
      id: "m2",
      username: "alice",
      content: "Echo",
      cc: {
        turn_id: "turn-echo",
        event: "question",
      },
    })

    const updated = upsertClaudeEventMessage([existing], incomingOwn, "alice")
    expect(updated).toHaveLength(1)
    expect(updated[0].id).toBe("m1")
  })

  test("passes through non-cc-shape messages unchanged", () => {
    const incoming: Message = {
      id: "m1",
      username: "alice",
      content: "unknown",
      timestamp: TS,
      type: "cc",
      attributes: {
        cc: {
          turn_id: "turn-1",
          event: "question-ish" as any,
        } as CcEventMetadata,
      },
    }

    const updated = upsertClaudeEventMessage([], incoming, null)
    expect(updated).toHaveLength(1)
    expect(updated[0]).toBe(incoming)
  })
})

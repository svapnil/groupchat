// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { describe, expect, test } from "bun:test"
import { join } from "node:path"

type AnyRecord = Record<string, unknown>

function asRecord(value: unknown): AnyRecord | null {
  if (typeof value === "object" && value !== null) return value as AnyRecord
  return null
}

async function readFixtureLines(path: string): Promise<string[]> {
  const raw = await Bun.file(path).text()
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

describe("claude all-tools fixture", () => {
  test("parses and covers expected message categories and tool names", async () => {
    const fixturePath = join(import.meta.dir, "fixtures", "claude-all-tools.ndjson")
    const lines = await readFixtureLines(fixturePath)
    expect(lines.length).toBeGreaterThan(0)

    const messages = lines.map((line) => JSON.parse(line) as AnyRecord)
    const messageTypes = new Set(
      messages
        .map((msg) => (typeof msg.type === "string" ? msg.type : ""))
        .filter((type) => type.length > 0)
    )

    const expectedTypes = [
      "system",
      "keep_alive",
      "stream_event",
      "streamlined_text",
      "streamlined_tool_use_summary",
      "control_request",
      "control_cancel_request",
      "tool_progress",
      "tool_use_summary",
      "assistant",
      "result",
      "auth_status",
    ]

    for (const expected of expectedTypes) {
      expect(messageTypes.has(expected)).toBe(true)
    }

    const canUseToolRequests = messages
      .filter((msg) => msg.type === "control_request")
      .map((msg) => asRecord(msg.request))
      .filter((request): request is AnyRecord => Boolean(request && request.subtype === "can_use_tool"))

    const toolNames = new Set(
      canUseToolRequests
        .map((request) => (typeof request.tool_name === "string" ? request.tool_name : ""))
        .filter((tool) => tool.length > 0)
    )

    const expectedTools = ["Bash", "Read", "Edit", "Write", "Grep", "Glob", "WebFetch", "WebSearch", "Task"]
    for (const expectedTool of expectedTools) {
      expect(toolNames.has(expectedTool)).toBe(true)
    }

    const streamEvents = messages
      .filter((msg) => msg.type === "stream_event")
      .map((msg) => asRecord(msg.event))
      .filter((event): event is AnyRecord => Boolean(event))

    const streamEventTypes = new Set(
      streamEvents
        .map((event) => (typeof event.type === "string" ? event.type : ""))
        .filter((type) => type.length > 0)
    )
    expect(streamEventTypes.has("message_start")).toBe(true)
    expect(streamEventTypes.has("content_block_delta")).toBe(true)
    expect(streamEventTypes.has("message_delta")).toBe(true)

    const deltaTypes = new Set(
      streamEvents
        .map((event) => asRecord(event.delta))
        .filter((delta): delta is AnyRecord => Boolean(delta))
        .map((delta) => (typeof delta.type === "string" ? delta.type : ""))
        .filter((type) => type.length > 0)
    )
    expect(deltaTypes.has("text_delta")).toBe(true)
    expect(deltaTypes.has("thinking_delta")).toBe(true)

    const controlSubtypes = new Set(
      messages
        .filter((msg) => msg.type === "control_request")
        .map((msg) => asRecord(msg.request))
        .filter((request): request is AnyRecord => Boolean(request))
        .map((request) => (typeof request.subtype === "string" ? request.subtype : ""))
        .filter((subtype) => subtype.length > 0)
    )
    expect(controlSubtypes.has("can_use_tool")).toBe(true)
    expect(controlSubtypes.has("set_model")).toBe(true)
  })
})

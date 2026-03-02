// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { describe, expect, test } from "bun:test"
import {
  isAgentCommand,
  LOCAL_COMMAND_EVENTS,
  getAgentEnterCommandEvent,
  isAgentCommandEvent,
  isAgentExitCommandEvent,
  parseAgentIdFromEnterEvent,
} from "../../src/lib/commands"

describe("agent command helpers", () => {
  test("identifies agent command entries", () => {
    expect(isAgentCommand({ eventType: getAgentEnterCommandEvent("cc") })).toBe(true)
    expect(isAgentCommand({ eventType: LOCAL_COMMAND_EVENTS.agentExit })).toBe(true)
    expect(isAgentCommand({ eventType: "remove_user" })).toBe(false)
  })

  test("parses agent event metadata", () => {
    expect(parseAgentIdFromEnterEvent(getAgentEnterCommandEvent("cc"))).toBe("cc")
    expect(parseAgentIdFromEnterEvent("local_agent_enter:codex")).toBe("codex")
    expect(parseAgentIdFromEnterEvent("invite_user")).toBeNull()
    expect(isAgentCommandEvent("local_agent_enter:cc")).toBe(true)
    expect(isAgentExitCommandEvent(LOCAL_COMMAND_EVENTS.agentExit)).toBe(true)
  })
})

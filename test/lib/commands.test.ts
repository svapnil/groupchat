import { describe, expect, test } from "bun:test"
import { LOCAL_COMMAND_EVENTS, isClaudeCommand, isClaudeCommandEvent } from "../../src/lib/commands"

describe("claude command helpers", () => {
  test("identifies claude command events", () => {
    expect(isClaudeCommandEvent(LOCAL_COMMAND_EVENTS.claudeEnter)).toBe(true)
    expect(isClaudeCommandEvent(LOCAL_COMMAND_EVENTS.claudeExit)).toBe(true)
    expect(isClaudeCommandEvent("invite_user")).toBe(false)
  })

  test("identifies claude command entries", () => {
    expect(isClaudeCommand({ eventType: LOCAL_COMMAND_EVENTS.claudeEnter })).toBe(true)
    expect(isClaudeCommand({ eventType: LOCAL_COMMAND_EVENTS.claudeExit })).toBe(true)
    expect(isClaudeCommand({ eventType: "remove_user" })).toBe(false)
  })
})

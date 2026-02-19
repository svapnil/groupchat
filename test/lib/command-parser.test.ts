import { describe, expect, test } from "bun:test"
import type { Command, ValidationContext } from "../../src/lib/commands"
import {
  extractCommandPayload,
  getSuggestions,
  parseCommandInput,
} from "../../src/lib/command-parser"

const baseCtx: ValidationContext = {
  presentUsers: [
    { username: "alice", user_id: 1 },
    { username: "bob", user_id: 2 },
  ],
  subscribedUsers: [{ username: "alice", user_id: 1 }],
  currentUsername: "alice",
}

const noopCommand: Command = {
  name: "/noop",
  syntax: "/noop",
  description: "No-op",
  privateOnly: false,
  parameters: [],
  eventType: "noop",
}

const inviteSearchCommand: Command = {
  name: "/invite",
  syntax: "/invite username",
  description: "Invite",
  privateOnly: true,
  adminOnly: true,
  parameters: [
    { name: "user", type: "username", required: true, prefix: "", source: "search" },
  ],
  eventType: "invite_user",
}

const modeCommand: Command = {
  name: "/mode",
  syntax: "/mode value",
  description: "Set mode",
  privateOnly: false,
  parameters: [
    { name: "mode", type: "choice", required: true, choices: ["on", "off"] },
  ],
  eventType: "set_mode",
}

const limitCommand: Command = {
  name: "/limit",
  syntax: "/limit number",
  description: "Set limit",
  privateOnly: false,
  parameters: [
    { name: "limit", type: "number", required: true, min: 1 },
  ],
  eventType: "set_limit",
}

describe("parseCommandInput", () => {
  test("returns phase none for non-command input", () => {
    const parsed = parseCommandInput("hello", [noopCommand], baseCtx)
    expect(parsed.phase).toBe("none")
    expect(parsed.command).toBeNull()
    expect(parsed.isValid).toBe(true)
  })

  test("returns command phase for unknown command", () => {
    const parsed = parseCommandInput("/unknown", [noopCommand], baseCtx)
    expect(parsed.phase).toBe("command")
    expect(parsed.command).toBeNull()
  })

  test("marks known no-parameter command as valid", () => {
    const parsed = parseCommandInput("/noop", [noopCommand], baseCtx)
    expect(parsed.phase).toBe("command")
    expect(parsed.command?.name).toBe("/noop")
    expect(parsed.isValid).toBe(true)
  })

  test("marks required parameter command invalid when missing", () => {
    const parsed = parseCommandInput("/mode ", [modeCommand], baseCtx)
    expect(parsed.phase).toBe("parameter")
    expect(parsed.command?.name).toBe("/mode")
    expect(parsed.isValid).toBe(false)
    expect(parsed.error).toBe("mode is required")
  })
})

describe("getSuggestions", () => {
  test("returns command suggestions while typing command name", () => {
    const commands = [noopCommand, modeCommand, inviteSearchCommand]
    const parsed = parseCommandInput("/m", commands, baseCtx)
    const suggestions = getSuggestions("/m", commands, parsed)

    expect(suggestions?.type).toBe("commands")
    expect(suggestions?.commands?.map((c) => c.name)).toEqual(["/mode"])
  })

  test("returns parameter suggestions for choice parameters", () => {
    const parsed = parseCommandInput("/mode o", [modeCommand], baseCtx)
    const suggestions = getSuggestions("/mode o", [modeCommand], parsed)

    expect(suggestions?.type).toBe("parameter")
    expect(suggestions?.parameterSuggestions).toEqual(["on", "off"])
  })
})

describe("extractCommandPayload", () => {
  test("extracts username and user_id using async search results", () => {
    const ctx: ValidationContext = {
      ...baseCtx,
      asyncSearchResults: [{ username: "carol", user_id: 9 }],
    }
    const parsed = parseCommandInput("/invite carol", [inviteSearchCommand], ctx)
    const payload = extractCommandPayload(parsed, ctx)

    expect(payload).toEqual({
      eventType: "invite_user",
      data: { username: "carol", user_id: 9 },
    })
  })

  test("extracts numeric payload values as numbers", () => {
    const parsed = parseCommandInput("/limit 3", [limitCommand], baseCtx)
    const payload = extractCommandPayload(parsed, baseCtx)

    expect(payload).toEqual({
      eventType: "set_limit",
      data: { limit: 3 },
    })
  })
})

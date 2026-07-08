// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { describe, expect, test } from "bun:test"
import type { Command, ValidationContext } from "../../src/lib/commands"
import {
  extractCommandPayload,
  getSuggestions,
  parseCommandInput,
} from "../../src/lib/command-parser"
import {
  buildTooltipState,
  dispatchTooltipSuggestion,
} from "../../src/lib/command-tooltip"

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

const localCommandWithData: Command = {
  name: "/agent",
  syntax: "/agent",
  description: "Agent command",
  privateOnly: false,
  parameters: [],
  eventType: "local_agent_enter:test",
  localData: { agent_type: "test" },
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

  test("merges local command data into payload", () => {
    const parsed = parseCommandInput("/agent", [localCommandWithData], baseCtx)
    const payload = extractCommandPayload(parsed, baseCtx)

    expect(payload).toEqual({
      eventType: "local_agent_enter:test",
      data: { agent_type: "test" },
    })
  })
})

// Helper to compute tab completion from tooltip state, matching use-command-input logic
const getTabCompletion = (input: string, commands: Command[], ctx: ValidationContext = baseCtx, asyncParameterSuggestions: string[] = []): string | null => {
  const parsed = parseCommandInput(input, commands, ctx)
  const suggestion = dispatchTooltipSuggestion({ input, commands, parsed, asyncParameterSuggestions })
  const tip = buildTooltipState(suggestion)
  if (!tip.show || tip.tips.length === 0) return null

  if (tip.type === "Command") {
    const cmd = tip.tips[0] as Command
    const hasParams = cmd.parameters.length > 0
    return cmd.name + (hasParams ? " " : "")
  }

  if (tip.type === "User" && parsed.command) {
    const paramSuggestion = tip.tips[0] as string
    return `${parsed.command.name} ${paramSuggestion}`
  }

  return null
}

describe("tab completion", () => {
  const claudeCommand: Command = {
    name: "/claude",
    syntax: "/claude",
    description: "Enter Claude Code mode",
    privateOnly: false,
    parameters: [],
    eventType: "local_agent_enter:claude",
  }

  const inviteLinkCommand: Command = {
    name: "/invite_link",
    syntax: "/invite_link",
    description: "Create an invite link",
    privateOnly: true,
    parameters: [],
    eventType: "create_invite_link",
  }

  const allCommands = [claudeCommand, noopCommand, inviteSearchCommand, inviteLinkCommand, modeCommand]

  test("completes partial command to first matching command", () => {
    expect(getTabCompletion("/cl", allCommands)).toBe("/claude")
  })

  test("completes /inv to first match in command list order", () => {
    // /invite comes before /invite_link in the array, and has params
    expect(getTabCompletion("/inv", allCommands)).toBe("/invite ")
  })

  test("completes /invite_ to /invite_link (no params, no trailing space)", () => {
    expect(getTabCompletion("/invite_", allCommands)).toBe("/invite_link")
  })

  test("returns null for non-command input", () => {
    expect(getTabCompletion("hello", allCommands)).toBeNull()
  })

  test("returns null for empty input", () => {
    expect(getTabCompletion("", allCommands)).toBeNull()
  })

  test("shows all commands for bare slash", () => {
    const result = getTabCompletion("/", allCommands)
    // First command alphabetically from the list
    expect(result).not.toBeNull()
  })

  test("completes no-param command without trailing space", () => {
    expect(getTabCompletion("/no", [noopCommand])).toBe("/noop")
  })

  test("completes command with params and adds trailing space", () => {
    expect(getTabCompletion("/mo", [modeCommand])).toBe("/mode ")
  })

  test("completes parameter suggestion for choice params", () => {
    const result = getTabCompletion("/mode o", [modeCommand])
    expect(result).toBe("/mode on")
  })

  test("returns null when no commands match prefix", () => {
    expect(getTabCompletion("/zzz", allCommands)).toBeNull()
  })
})

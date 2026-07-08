// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { describe, expect, test } from "bun:test"
import {
  getCommandToken,
  isCommandLikeInput,
  startsWithKnownCommand,
} from "../../src/lib/command-input"

describe("command-input helpers", () => {
  test("detects command-like input by prefix", () => {
    expect(isCommandLikeInput("/invite alice")).toBe(true)
    expect(isCommandLikeInput("?help")).toBe(true)
    expect(isCommandLikeInput("hello")).toBe(false)
  })

  test("extracts command token from slash commands", () => {
    expect(getCommandToken("/invite alice")).toBe("/invite")
    expect(getCommandToken("/invite")).toBe("/invite")
    expect(getCommandToken("?invite")).toBeNull()
  })

  test("checks known command prefixes against command list", () => {
    const commands = ["/invite", "/remove"]

    expect(startsWithKnownCommand("/invite alice", commands)).toBe(true)
    expect(startsWithKnownCommand("/inv alice", commands)).toBe(false)
    expect(startsWithKnownCommand("invite alice", commands)).toBe(false)
  })
})

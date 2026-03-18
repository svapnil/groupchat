// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { describe, expect, test } from "bun:test"
import { shouldSelfUpdate } from "../../src/lib/update-checker"

describe("shouldSelfUpdate", () => {
  test("allows installed production binary names", () => {
    expect(shouldSelfUpdate("/usr/local/bin/groupchat")).toBe(true)
    expect(shouldSelfUpdate("/Users/svapnil/.groupchat/bin/groupchat")).toBe(true)
    expect(shouldSelfUpdate("C:\\Program Files\\Groupchat\\groupchat.exe")).toBe(true)
  })

  test("blocks development runtimes and non-production executable names", () => {
    expect(shouldSelfUpdate("/Users/svapnil/.bun/bin/bun")).toBe(false)
    expect(shouldSelfUpdate("/opt/homebrew/bin/node")).toBe(false)
    expect(shouldSelfUpdate("/tmp/groupchat-dev")).toBe(false)
  })
})

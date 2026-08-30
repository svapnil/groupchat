// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { describe, expect, test } from "bun:test"
import { resolveStorageProfile } from "../../src/lib/storage-profile"

describe("resolveStorageProfile", () => {
  test("keeps the legacy credential name in production", () => {
    expect(resolveStorageProfile(undefined, "production")).toBeNull()
  })

  test("uses separate credentials during development", () => {
    expect(resolveStorageProfile(undefined, "development")).toBe("dev")
    expect(resolveStorageProfile(undefined, undefined)).toBe("dev")
  })

  test("prefers an explicit profile in every environment", () => {
    expect(resolveStorageProfile("user2", "production")).toBe("user2")
    expect(resolveStorageProfile(" user2 ", "development")).toBe("user2")
  })
})

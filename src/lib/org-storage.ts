// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
// Persists the organization the TUI is scoped to. Chosen at login when the
// user belongs to 2+ orgs, cleared on logout. Not a secret, so a plain file
// (unlike the token, which lives in the OS keychain).
import { homedir } from "os"
import { join } from "path"
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "fs"

const PROFILE = process.env.GROUPCHAT_PROFILE
const CONFIG_DIR = join(homedir(), ".config", "groupchat")
const ORG_FILE = join(CONFIG_DIR, PROFILE ? `org-${PROFILE}.json` : "org.json")

export function getStoredOrg(): string | null {
  try {
    const raw = readFileSync(ORG_FILE, "utf8")
    const data = JSON.parse(raw) as { org?: string }
    return typeof data.org === "string" && data.org.length > 0 ? data.org : null
  } catch {
    return null
  }
}

export function storeOrg(slug: string): void {
  try {
    mkdirSync(CONFIG_DIR, { recursive: true })
    writeFileSync(ORG_FILE, JSON.stringify({ org: slug }), "utf8")
  } catch {
    // Best-effort: a failed write just means re-prompting next session.
  }
}

export function clearOrg(): void {
  try {
    rmSync(ORG_FILE, { force: true })
  } catch {
    // Already gone is fine.
  }
}

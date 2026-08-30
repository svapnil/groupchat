// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { homedir } from "os"
import { resolve } from "path"

export type RuntimeCapabilities = {
  claudePath: string | null
  hasClaude: boolean
  codexPath: string | null
  hasCodex: boolean
  /**
   * The directory `groupchat` was launched from — the working directory agent
   * runs execute in. Captured once because the only chdir happens in
   * `applyWorkspaceOverride()`, before this is initialized.
   */
  workspaceDir: string
}

let cachedCapabilities: RuntimeCapabilities | null = null

/**
 * Point agent runs at a directory other than the launch one. Mainly a dev
 * escape hatch — run from `tui/` (so bunfig's preload, `.env` and
 * `node_modules` all resolve) while agents execute against a different repo.
 * Must be called before anything reads `process.cwd()`.
 */
export function applyWorkspaceOverride(): void {
  const override = process.env.GROUPCHAT_WORKSPACE_DIR?.trim()
  if (!override) return

  const target = resolve(
    override.startsWith("~") ? homedir() + override.slice(1) : override
  )
  try {
    process.chdir(target)
  } catch {
    console.error(
      `Error: GROUPCHAT_WORKSPACE_DIR is not a usable directory: ${target}\n`
    )
    process.exit(1)
  }
}

function detectClaudePath(): string | null {
  try {
    return Bun.which("claude") ?? null
  } catch {
    return null
  }
}

function detectCodexPath(): string | null {
  try {
    return Bun.which("codex") ?? null
  } catch {
    return null
  }
}

function detectRuntimeCapabilities(): RuntimeCapabilities {
  const claudePath = detectClaudePath()
  const codexPath = detectCodexPath()
  return {
    claudePath,
    hasClaude: claudePath !== null,
    codexPath,
    hasCodex: codexPath !== null,
    workspaceDir: process.cwd(),
  }
}

export function initializeRuntimeCapabilities(): RuntimeCapabilities {
  if (!cachedCapabilities) {
    cachedCapabilities = detectRuntimeCapabilities()
  }
  return cachedCapabilities
}

export function getRuntimeCapabilities(): RuntimeCapabilities {
  return cachedCapabilities ?? initializeRuntimeCapabilities()
}

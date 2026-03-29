// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
export type RuntimeCapabilities = {
  claudePath: string | null
  hasClaude: boolean
  codexPath: string | null
  hasCodex: boolean
}

let cachedCapabilities: RuntimeCapabilities | null = null

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

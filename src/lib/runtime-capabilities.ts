export type RuntimeCapabilities = {
  claudePath: string | null
  hasClaude: boolean
}

let cachedCapabilities: RuntimeCapabilities | null = null

function detectClaudePath(): string | null {
  try {
    return Bun.which("claude") ?? null
  } catch {
    return null
  }
}

function detectRuntimeCapabilities(): RuntimeCapabilities {
  const claudePath = detectClaudePath()
  return {
    claudePath,
    hasClaude: claudePath !== null,
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

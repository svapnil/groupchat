import type { AgentType } from "./types.js";

/**
 * Agent configuration for UI display
 * Maps agent type to display properties
 */
export const AGENT_CONFIG = {
  claude: {
    type: "claude" as const,
    displayName: "Claude Code",
    color: "redBright" as const,
  },
  codex: {
    type: "codex" as const,
    displayName: "Codex",
    color: "cyan" as const,
  },
} as const;

/**
 * Helper to get agent display name
 */
export function getAgentDisplayName(agent: AgentType): string {
  if (!agent) return "";
  return AGENT_CONFIG[agent].displayName;
}

/**
 * Helper to get agent color
 */
export function getAgentColor(agent: AgentType): "redBright" | "cyan" | undefined {
  if (!agent) return undefined;
  return AGENT_CONFIG[agent].color;
}

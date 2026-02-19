import type { AgentType } from "./types.js";

/**
 * Agent configuration for UI display
 * Maps agent type to display properties
 */
export const AGENT_CONFIG = {
  claude: {
    type: "claude" as const,
    displayName: "Claude Code",
    color: "#FFA500" as const,
  },
  codex: {
    type: "codex" as const,
    displayName: "Codex",
    color: "cyan" as const,
  },
  cursor: {
    type: "cursor" as const,
    displayName: "Cursor",
    color: "blueBright" as const,
  },
  windsurf: {
    type: "windsurf" as const,
    displayName: "Windsurf",
    color: "magenta" as const,
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
export function getAgentColor(agent: AgentType): "#FFA500" | "cyan" | "blueBright" | "magenta" | undefined {
  if (!agent) return undefined;
  return AGENT_CONFIG[agent].color;
}

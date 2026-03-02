// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import type { AgentType } from "./types.js";

/**
 * Agent configuration for UI display
 * Maps agent type to display properties
 */
export const AGENT_CONFIG = {
  claude: {
    type: "cc" as const,
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

export type KnownAgentType = keyof typeof AGENT_CONFIG

/**
 * Helper to get agent display name
 */
export function getAgentDisplayName(agent: AgentType): string {
  if (!agent) return "";
  return AGENT_CONFIG[agent].displayName;
}

export function isKnownAgentType(agent: string): agent is KnownAgentType {
  return Object.prototype.hasOwnProperty.call(AGENT_CONFIG, agent);
}

function findAgentConfig(id: string) {
  if (isKnownAgentType(id)) return AGENT_CONFIG[id];
  return Object.values(AGENT_CONFIG).find((cfg) => cfg.type === id) ?? null;
}

export function getAgentDisplayNameById(agentId: string): string {
  const cfg = findAgentConfig(agentId);
  if (cfg) return cfg.displayName;
  const normalized = agentId.trim();
  if (!normalized) return "Agent";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

/**
 * Helper to get agent color
 */
export function getAgentColor(agent: AgentType): "#FFA500" | "cyan" | "blueBright" | "magenta" | undefined {
  if (!agent) return undefined;
  return AGENT_CONFIG[agent].color;
}

export function getAgentColorById(agentId: string): string | undefined {
  return findAgentConfig(agentId)?.color;
}

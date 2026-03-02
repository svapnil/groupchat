// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
// ============================================
// PARAMETER TYPES & VALIDATORS
// ============================================

import { AGENT_ID as CC_AGENT_ID } from "../agent/claude/claude-event-message-mutations"

export type ParameterType = "username" | "text" | "number" | "choice";

export interface ParameterBase {
  name: string;
  required: boolean;
  description?: string;
}

export type UsernameSource = "all" | "subscribed_without_self" | "not_subscribed" | "search";

export interface UsernameParameter extends ParameterBase {
  type: "username";
  prefix: string; // e.g., "@"
  source: UsernameSource; // Which user list to validate against
}

export interface TextParameter extends ParameterBase {
  type: "text";
  minLength?: number;
  maxLength?: number;
}

export interface NumberParameter extends ParameterBase {
  type: "number";
  min?: number;
  max?: number;
}

export interface ChoiceParameter extends ParameterBase {
  type: "choice";
  choices: string[];
}

export type CommandParameter =
  | UsernameParameter
  | TextParameter
  | NumberParameter
  | ChoiceParameter;

// ============================================
// VALIDATION CONTEXT & RESULTS
// ============================================

export interface ValidationContext {
  presentUsers: Array<{ username: string; user_id: number }>;
  subscribedUsers: Array<{ username: string; user_id: number }>;
  currentUsername: string | null;
  asyncSearchResults?: Array<{ username: string; user_id: number }>;
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  suggestions?: string[]; // For autocomplete
}

const normalizeUsernameValue = (value: string, prefix: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (prefix && trimmed.startsWith(prefix)) {
    return trimmed.substring(prefix.length);
  }

  return trimmed;
};

const formatUsernameSuggestion = (username: string, prefix: string) =>
  prefix ? `${prefix}${username}` : username;

// ============================================
// PARAMETER VALIDATORS
// ============================================

export const parameterValidators: Record<
  ParameterType,
  (value: string, param: CommandParameter, ctx: ValidationContext) => ValidationResult
> = {
  username: (value, param, ctx) => {
    const p = param as UsernameParameter;
    const rawValue = value.trim();

    // For search-backed source, validate against search results
    if (p.source === "search") {
      if (p.prefix && !rawValue.startsWith(p.prefix)) {
        return {
          isValid: false,
          error: `Must start with ${p.prefix}`,
          suggestions: [],
        };
      }

      const username = normalizeUsernameValue(rawValue, p.prefix);
      const results = ctx.asyncSearchResults || [];
      if (!username) {
        return {
          isValid: false,
          error: "Username required",
          suggestions: results.map(r => formatUsernameSuggestion(r.username, p.prefix)),
        };
      }

      const matching = results.filter(r =>
        r.username.toLowerCase().startsWith(username.toLowerCase())
      );
      const exactMatch = results.find(
        r => r.username.toLowerCase() === username.toLowerCase()
      );

      return {
        isValid: results.length > 0 && !!exactMatch,
        error: results.length === 0 ? "User not found" : exactMatch ? undefined : "User not found",
        suggestions: matching.map(r => formatUsernameSuggestion(r.username, p.prefix)),
      };
    }

    // Get the appropriate user list based on source
    const getUserList = () => {
      switch (p.source) {
        case "subscribed_without_self":
          return ctx.subscribedUsers.filter(u => u.username !== ctx.currentUsername);
        case "not_subscribed": {
          const subscribedIds = new Set(ctx.subscribedUsers.map(u => u.user_id));
          return ctx.presentUsers.filter(u => !subscribedIds.has(u.user_id));
        }
        case "all":
        default:
          return ctx.presentUsers;
      }
    };
    const users = getUserList();

    if (p.prefix && !rawValue.startsWith(p.prefix)) {
      return {
        isValid: false,
        error: `Must start with ${p.prefix}`,
        suggestions: users.map(u => formatUsernameSuggestion(u.username, p.prefix)),
      };
    }

    const username = normalizeUsernameValue(rawValue, p.prefix);
    if (!username) {
      return {
        isValid: false,
        error: "Username required",
        suggestions: users.map(u => formatUsernameSuggestion(u.username, p.prefix)),
      };
    }

    const matchingUsers = users.filter(u =>
      u.username.toLowerCase().startsWith(username.toLowerCase())
    );

    const exactMatch = users.find(
      u => u.username.toLowerCase() === username.toLowerCase()
    );

    return {
      isValid: !!exactMatch,
      error: exactMatch ? undefined : "User not found",
      suggestions: matchingUsers.map(u => formatUsernameSuggestion(u.username, p.prefix)),
    };
  },

  text: (value, param) => {
    const p = param as TextParameter;

    if (p.minLength && value.length < p.minLength) {
      return { isValid: false, error: `Minimum ${p.minLength} characters` };
    }
    if (p.maxLength && value.length > p.maxLength) {
      return { isValid: false, error: `Maximum ${p.maxLength} characters` };
    }
    return { isValid: true };
  },

  number: (value, param) => {
    const p = param as NumberParameter;
    const num = Number(value);

    if (isNaN(num)) {
      return { isValid: false, error: "Must be a number" };
    }
    if (p.min !== undefined && num < p.min) {
      return { isValid: false, error: `Minimum value is ${p.min}` };
    }
    if (p.max !== undefined && num > p.max) {
      return { isValid: false, error: `Maximum value is ${p.max}` };
    }
    return { isValid: true };
  },

  choice: (value, param) => {
    const p = param as ChoiceParameter;
    const matching = p.choices.filter(c =>
      c.toLowerCase().startsWith(value.toLowerCase())
    );
    const exactMatch = p.choices.find(
      c => c.toLowerCase() === value.toLowerCase()
    );

    return {
      isValid: !!exactMatch,
      error: exactMatch ? undefined : `Must be one of: ${p.choices.join(", ")}`,
      suggestions: matching,
    };
  },
};

// ============================================
// COMMAND DEFINITION
// ============================================

export interface Command {
  name: string;           // e.g., "/invite"
  syntax: string;         // e.g., "/invite user"
  description: string;
  privateOnly: boolean;
  adminOnly?: boolean;
  /** When true, this command is only available in channel views, not DMs. */
  channelOnly?: boolean;
  parameters: CommandParameter[];
  eventType: string;      // Phoenix event to send
  /** Optional static payload merged into command data for local-only commands. */
  localData?: Record<string, unknown>;
}

const AGENT_ENTER_EVENT_PREFIX = "local_agent_enter:";
const AGENT_EXIT_EVENT = "local_agent_exit";

export const getAgentEnterCommandEvent = (agentId: string) =>
  `${AGENT_ENTER_EVENT_PREFIX}${agentId}`;

export const parseAgentIdFromEnterEvent = (eventType: string): string | null => {
  if (!eventType.startsWith(AGENT_ENTER_EVENT_PREFIX)) return null;
  const agentId = eventType.slice(AGENT_ENTER_EVENT_PREFIX.length).trim();
  return agentId.length > 0 ? agentId : null;
};

export const isAgentEnterCommandEvent = (eventType: string) =>
  parseAgentIdFromEnterEvent(eventType) !== null;

export const isAgentExitCommandEvent = (eventType: string) =>
  eventType === AGENT_EXIT_EVENT;

export const isAgentCommandEvent = (eventType: string) =>
  isAgentEnterCommandEvent(eventType) || isAgentExitCommandEvent(eventType);

export const LOCAL_COMMAND_EVENTS = {
  agentExit: AGENT_EXIT_EVENT,
} as const

export const isAgentCommand = (command: Pick<Command, "eventType">) =>
  isAgentCommandEvent(command.eventType)

export const getCommandAgentId = (command: Pick<Command, "eventType">): string | null =>
  parseAgentIdFromEnterEvent(command.eventType)

// ============================================
// COMMAND REGISTRY
// ============================================

export const COMMANDS: Command[] = [
  {
    name: "/claude",
    syntax: "/claude",
    description: "Enter Claude Code mode",
    privateOnly: false,
    adminOnly: false,
    parameters: [],
    eventType: getAgentEnterCommandEvent(CC_AGENT_ID),
  },
  {
    name: "/exit",
    syntax: "/exit",
    description: "Exit current agent mode",
    privateOnly: false,
    adminOnly: false,
    parameters: [],
    eventType: LOCAL_COMMAND_EVENTS.agentExit,
  },
  {
    name: "/invite",
    syntax: "/invite username",
    description: "Invite a user to join the channel",
    privateOnly: true,
    adminOnly: true,
    channelOnly: true,
    parameters: [
      { name: "user", type: "username", required: true, prefix: "", source: "search" },
    ],
    eventType: "invite_user",
  },
  {
    name: "/remove",
    syntax: "/remove username",
    description: "Remove a user from the channel",
    privateOnly: true,
    adminOnly: true,
    channelOnly: true,
    parameters: [
      { name: "user", type: "username", required: true, prefix: "", source: "subscribed_without_self" },
    ],
    eventType: "remove_user",
  },
  {
    name: "/invite_link",
    syntax: "/invite_link",
    description: "Create an invite link for this channel",
    privateOnly: true,
    adminOnly: false,
    channelOnly: true,
    parameters: [],
    eventType: "create_invite_link",
  },
  // Easy to add more commands:
  // {
  //   name: "/topic",
  //   syntax: "/topic <text>",
  //   description: "Set the channel topic",
  //   privateOnly: false,
  //   parameters: [
  //     { name: "topic", type: "text", required: true, minLength: 1, maxLength: 200 },
  //   ],
  //   eventType: "set_topic",
  // },
];

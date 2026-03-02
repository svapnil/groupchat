// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import type {
  Command,
  CommandParameter,
  ValidationContext,
  ValidationResult,
  UsernameParameter,
} from "./commands.js";
import { parameterValidators } from "./commands.js";

const normalizeUsernameParameterValue = (value: string, prefix: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (prefix && trimmed.startsWith(prefix)) {
    return trimmed.substring(prefix.length);
  }

  return trimmed;
};

// ============================================
// PARSED COMMAND STATE
// ============================================

export interface ParsedCommand {
  command: Command | null;
  phase: "none" | "command" | "parameter";
  parameterValues: Map<string, string>; // param name -> raw value
  parameterResults: Map<string, ValidationResult>; // param name -> validation result
  isValid: boolean;
  error?: string;
}

// ============================================
// COMMAND PARSER
// ============================================

export function parseCommandInput(
  input: string,
  commands: Command[],
  ctx: ValidationContext
): ParsedCommand {
  const empty: ParsedCommand = {
    command: null,
    phase: "none",
    parameterValues: new Map(),
    parameterResults: new Map(),
    isValid: true,
  };

  // Not a command
  if (!input.startsWith("/")) {
    return empty;
  }

  // Parse command name
  const spaceIndex = input.indexOf(" ");
  const commandText = spaceIndex === -1 ? input : input.substring(0, spaceIndex);
  const command = commands.find(cmd => cmd.name === commandText);

  // Still typing command name
  if (!command) {
    return {
      ...empty,
      phase: "command",
    };
  }

  // Command found but no space yet (still typing command)
  if (spaceIndex === -1) {
    const hasRequiredParams = command.parameters.some(p => p.required);
    return {
      command,
      phase: "command",
      parameterValues: new Map(),
      parameterResults: new Map(),
      isValid: !hasRequiredParams, // Valid only if no required params
    };
  }

  // Parse parameters
  const paramInput = input.substring(spaceIndex + 1);
  const parameterValues = new Map<string, string>();
  const parameterResults = new Map<string, ValidationResult>();

  // For now, handle single parameter (can extend to multiple later)
  if (command.parameters.length > 0) {
    const param = command.parameters[0];
    parameterValues.set(param.name, paramInput);

    if (paramInput) {
      const result = parameterValidators[param.type](paramInput, param, ctx);
      parameterResults.set(param.name, result);
    }
  }

  // Determine overall validity
  let isValid = true;
  let error: string | undefined;

  for (const param of command.parameters) {
    const value = parameterValues.get(param.name) || "";
    const result = parameterResults.get(param.name);

    if (param.required && !value) {
      isValid = false;
      error = `${param.name} is required`;
      break;
    }

    if (value && result && !result.isValid) {
      isValid = false;
      error = result.error;
      break;
    }
  }

  return {
    command,
    phase: "parameter",
    parameterValues,
    parameterResults,
    isValid,
    error,
  };
}

// ============================================
// SUGGESTION HELPERS
// ============================================

export interface Suggestions {
  type: "commands" | "parameter";
  commands?: Command[];
  parameterSuggestions?: string[];
  parameterName?: string;
}

export function getSuggestions(
  input: string,
  commands: Command[],
  parsed: ParsedCommand
): Suggestions | null {
  // Show command suggestions
  if (parsed.phase === "command" || (input.startsWith("/") && !parsed.command)) {
    const filtered = commands.filter(cmd => {
      if (input.length > 1) {
        return cmd.name.startsWith(input.split(" ")[0]);
      }
      return true;
    });

    if (filtered.length > 0) {
      return { type: "commands", commands: filtered };
    }
    return null;
  }

  // Show parameter suggestions
  if (parsed.phase === "parameter" && parsed.command) {
    const param = parsed.command.parameters[0];
    if (param) {
      const result = parsed.parameterResults.get(param.name);
      if (result?.suggestions && result.suggestions.length > 0) {
        return {
          type: "parameter",
          parameterSuggestions: result.suggestions,
          parameterName: param.name,
        };
      }
    }
  }

  return null;
}

// ============================================
// COMMAND DATA EXTRACTION
// ============================================

export interface CommandPayload {
  eventType: string;
  data: Record<string, unknown>;
}

export function extractCommandPayload(
  parsed: ParsedCommand,
  ctx: ValidationContext
): CommandPayload | null {
  if (!parsed.command || !parsed.isValid) {
    return null;
  }

  const data: Record<string, unknown> = {};

  for (const param of parsed.command.parameters) {
    const value = parsed.parameterValues.get(param.name);
    if (!value) continue;

    // Extract typed value based on parameter type
    switch (param.type) {
      case "username": {
        const p = param as UsernameParameter;
        const username = normalizeUsernameParameterValue(value, p.prefix);

        // For async source, prefer asyncSearchResults
        let user;
        if (p.source === "search" && ctx.asyncSearchResults) {
          user = ctx.asyncSearchResults.find(
            u => u.username.toLowerCase() === username.toLowerCase()
          );
        }

        // Fallback to local users
        if (!user) {
          const presentUsers = [...ctx.presentUsers, ...ctx.subscribedUsers];
          user = presentUsers.find(
            u => u.username.toLowerCase() === username.toLowerCase()
          );
        }

        data.username = user?.username || username;
        data.user_id = user?.user_id;
        break;
      }
      case "text":
        data[param.name] = value;
        break;
      case "number":
        data[param.name] = Number(value);
        break;
      case "choice":
        data[param.name] = value;
        break;
    }
  }

  return {
    eventType: parsed.command.eventType,
    data: {
      ...(parsed.command.localData ?? {}),
      ...data,
    },
  };
}

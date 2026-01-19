import { useMemo, useState } from "react";
import { COMMANDS, type Command, type ValidationContext } from "../lib/commands.js";
import {
  extractCommandPayload,
  getSuggestions,
  parseCommandInput,
  type ParsedCommand,
} from "../lib/command-parser.js";
import { useUserSearch } from "./use-user-search.js";
import type { ConnectionStatus, Subscriber } from "../lib/types.js";
import type { UserWithStatus } from "./use-presence.js";

type TooltipType = "Command" | "User";

interface TooltipState {
  show: boolean;
  tips: Command[] | string[];
  type: TooltipType;
  height: number;
}

interface UseCommandInputOptions {
  token: string | null;
  currentChannel: string;
  isPrivateChannel: boolean;
  connectionStatus: ConnectionStatus;
  username: string | null;
  users: UserWithStatus[];
  subscribers: Subscriber[];
  onSendMessage: (message: string) => Promise<void>;
  onCommandSend: (eventType: string, data: any) => Promise<void>;
}

export function useCommandInput({
  token,
  currentChannel,
  isPrivateChannel,
  connectionStatus,
  username,
  users,
  subscribers,
  onSendMessage,
  onCommandSend,
}: UseCommandInputOptions) {
  const [inputValue, setInputValue] = useState("");

  const isChannelAdmin = useMemo(
    () => subscribers.some((s) => s.username === username && s.role === "admin"),
    [subscribers, username]
  );

  const availableCommands = useMemo(
    () =>
      COMMANDS.filter((cmd) => {
        if (cmd.privateOnly && !isPrivateChannel) return false;
        if (cmd.adminOnly && !isChannelAdmin) return false;
        return true;
      }),
    [isPrivateChannel, isChannelAdmin]
  );

  const baseContext: ValidationContext = useMemo(
    () => ({
      presentUsers: users.map((u) => ({ username: u.username, user_id: u.user_id })),
      subscribedUsers: subscribers.map((s) => ({ username: s.username, user_id: s.user_id })),
      currentUsername: username,
    }),
    [users, subscribers, username]
  );

  // Parse input without async search to derive query for /invite
  const parsedWithoutAsync: ParsedCommand = useMemo(
    () => parseCommandInput(inputValue, availableCommands, baseContext),
    [inputValue, availableCommands, baseContext]
  );

  const inviteQuery = useMemo(() => {
    if (
      parsedWithoutAsync.command?.name === "/invite" &&
      parsedWithoutAsync.phase === "parameter"
    ) {
      const raw = parsedWithoutAsync.parameterValues.get("user") || "";
      return raw.replace(/^@/, "");
    }
    return null;
  }, [parsedWithoutAsync]);

  const { suggestions: asyncSuggestions, results: asyncResults } = useUserSearch(
    token,
    inviteQuery,
    isPrivateChannel ? currentChannel : null
  );

  const validationContext: ValidationContext = useMemo(
    () => ({
      ...baseContext,
      asyncSearchResults: asyncResults.length > 0 ? asyncResults : undefined,
    }),
    [baseContext, asyncResults]
  );

  const parsed: ParsedCommand = useMemo(
    () => parseCommandInput(inputValue, availableCommands, validationContext),
    [inputValue, availableCommands, validationContext]
  );

  const suggestionResult = useMemo(() => {
    const isCommandLike = inputValue.startsWith("/") || inputValue.startsWith("?");
    if (!isCommandLike) return null;

    // Prefer async suggestions for /invite parameter
    if (parsed.command?.name === "/invite" && parsed.phase === "parameter" && asyncSuggestions.length) {
      return { type: "parameter", parameterSuggestions: asyncSuggestions } as const;
    }

    return getSuggestions(inputValue, availableCommands, parsed);
  }, [inputValue, availableCommands, parsed, asyncSuggestions]);

  const tooltip: TooltipState = useMemo(() => {
    if (!suggestionResult) {
      return { show: false, tips: [], type: "Command", height: 0 };
    }

    if (suggestionResult.type === "commands" && suggestionResult.commands) {
      const tips = suggestionResult.commands;
      return { show: true, tips, type: "Command", height: tips.length + 1 };
    }

    if (suggestionResult.type === "parameter" && suggestionResult.parameterSuggestions) {
      const tips = suggestionResult.parameterSuggestions;
      return { show: true, tips, type: "User", height: tips.length + 1 };
    }

    return { show: false, tips: [], type: "Command", height: 0 };
  }, [suggestionResult]);

  const isInputDisabled =
    connectionStatus !== "connected" ||
    (parsed.command !== null && !parsed.isValid);

  const handleInputChange = (value: string) => {
    setInputValue(value);
  };

  const handleSubmit = async (text: string) => {
    const parsedForSend = parseCommandInput(text, availableCommands, {
      ...validationContext,
      asyncSearchResults: asyncResults.length > 0 ? asyncResults : undefined,
    });

    if (parsedForSend.command && parsedForSend.isValid) {
      const payload = extractCommandPayload(parsedForSend, validationContext);
      if (payload) {
        await onCommandSend(payload.eventType, payload.data);
        setInputValue("");
        return;
      }
    }

    await onSendMessage(text);
    setInputValue("");
  };

  return {
    inputValue,
    parsed,
    tooltip,
    isInputDisabled,
    handleInputChange,
    handleSubmit,
  };
}

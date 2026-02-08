import { createMemo, createSignal } from "solid-js"
import { COMMANDS, type Command, type ValidationContext } from "../lib/commands"
import {
  extractCommandPayload,
  getSuggestions,
  parseCommandInput,
  type ParsedCommand,
} from "../lib/command-parser"
import type { ConnectionStatus, Subscriber } from "../lib/types"
import type { UserWithStatus } from "./presence"
import { useUserSearch } from "./use-user-search"

type TooltipType = "Command" | "User"

export type TooltipState = {
  show: boolean
  tips: Command[] | string[]
  type: TooltipType
  height: number
}

export type UseCommandInputOptions = {
  token: () => string | null
  currentChannel: () => string
  isPrivateChannel: () => boolean
  connectionStatus: () => ConnectionStatus
  username: () => string | null
  users: () => UserWithStatus[]
  subscribers: () => Subscriber[]
  onSendMessage: (message: string) => Promise<void>
  onCommandSend: (eventType: string, data: any) => Promise<void>
}

export const useCommandInput = (options: UseCommandInputOptions) => {
  const [inputValue, setInputValue] = createSignal("")

  const isChannelAdmin = createMemo(() =>
    options.subscribers().some((subscriber) => subscriber.username === options.username() && subscriber.role === "admin")
  )

  const availableCommands = createMemo(() =>
    COMMANDS.filter((cmd) => {
      if (cmd.privateOnly && !options.isPrivateChannel()) return false
      if (cmd.adminOnly && !isChannelAdmin()) return false
      return true
    })
  )

  const baseContext = createMemo<ValidationContext>(() => ({
    presentUsers: options.users().map((user) => ({
      username: user.username,
      user_id: user.user_id,
    })),
    subscribedUsers: options.subscribers().map((subscriber) => ({
      username: subscriber.username,
      user_id: subscriber.user_id,
    })),
    currentUsername: options.username(),
  }))

  const parsedWithoutAsync = createMemo<ParsedCommand>(() =>
    parseCommandInput(inputValue(), availableCommands(), baseContext())
  )

  const inviteQuery = createMemo(() => {
    const parsed = parsedWithoutAsync()
    if (parsed.command?.name === "/invite" && parsed.phase === "parameter") {
      const raw = parsed.parameterValues.get("user") || ""
      return raw.replace(/^@/, "")
    }
    return null
  })

  const userSearch = useUserSearch({
    token: options.token,
    query: inviteQuery,
    channelSlug: () => (options.isPrivateChannel() ? options.currentChannel() : null),
    requireChannelSlug: true,
  })

  const validationContext = createMemo<ValidationContext>(() => ({
    ...baseContext(),
    asyncSearchResults: userSearch.results().length > 0 ? userSearch.results() : undefined,
  }))

  const parsed = createMemo<ParsedCommand>(() =>
    parseCommandInput(inputValue(), availableCommands(), validationContext())
  )

  const suggestionResult = createMemo(() => {
    const isCommandLike = inputValue().startsWith("/") || inputValue().startsWith("?")
    if (!isCommandLike) return null

    if (parsed().command?.name === "/invite" && parsed().phase === "parameter" && userSearch.suggestions().length) {
      return { type: "parameter", parameterSuggestions: userSearch.suggestions() } as const
    }

    return getSuggestions(inputValue(), availableCommands(), parsed())
  })

  const tooltip = createMemo<TooltipState>(() => {
    const suggestion = suggestionResult()
    if (!suggestion) {
      return { show: false, tips: [], type: "Command", height: 0 }
    }

    if (suggestion.type === "commands" && suggestion.commands) {
      const tips = suggestion.commands
      return { show: true, tips, type: "Command", height: tips.length + 1 }
    }

    if (suggestion.type === "parameter" && suggestion.parameterSuggestions) {
      const tips = suggestion.parameterSuggestions
      return { show: true, tips, type: "User", height: tips.length + 1 }
    }

    return { show: false, tips: [], type: "Command", height: 0 }
  })

  const isInputDisabled = createMemo(
    () => options.connectionStatus() !== "connected" || (parsed().command !== null && !parsed().isValid)
  )

  const handleInputChange = (value: string) => {
    setInputValue(value)
  }

  const handleSubmit = async (text: string) => {
    const parsedForSend = parseCommandInput(text, availableCommands(), {
      ...validationContext(),
      asyncSearchResults: userSearch.results().length > 0 ? userSearch.results() : undefined,
    })

    if (parsedForSend.command && parsedForSend.isValid) {
      const payload = extractCommandPayload(parsedForSend, validationContext())
      if (payload) {
        await options.onCommandSend(payload.eventType, payload.data)
        setInputValue("")
        return
      }
    }

    await options.onSendMessage(text)
    setInputValue("")
  }

  return {
    inputValue,
    parsed,
    tooltip,
    isInputDisabled,
    handleInputChange,
    handleSubmit,
  }
}

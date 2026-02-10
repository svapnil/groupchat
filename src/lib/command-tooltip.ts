import type { Command } from "./commands"
import { getSuggestions, type ParsedCommand, type Suggestions } from "./command-parser"
import { isCommandLikeInput } from "./command-input"

export type TooltipType = "Command" | "User"

export type TooltipState = {
  show: boolean
  tips: Command[] | string[]
  type: TooltipType
  height: number
}

type TooltipSuggestionContext = {
  input: string
  commands: Command[]
  parsed: ParsedCommand
  asyncParameterSuggestions: string[]
}

const resolveInviteParameterTooltip = (ctx: TooltipSuggestionContext): Suggestions | null => {
  if (ctx.parsed.command?.name !== "/invite" || ctx.parsed.phase !== "parameter") {
    return null
  }

  if (ctx.asyncParameterSuggestions.length === 0) {
    return null
  }

  return {
    type: "parameter",
    parameterSuggestions: ctx.asyncParameterSuggestions,
  }
}

const resolveDefaultTooltip = (ctx: TooltipSuggestionContext): Suggestions | null =>
  getSuggestions(ctx.input, ctx.commands, ctx.parsed)

const parameterTooltipDispatchers: Record<string, Array<(ctx: TooltipSuggestionContext) => Suggestions | null>> = {
  "/invite": [resolveInviteParameterTooltip],
}

export const dispatchTooltipSuggestion = (ctx: TooltipSuggestionContext): Suggestions | null => {
  if (!isCommandLikeInput(ctx.input)) {
    return null
  }

  if (ctx.parsed.phase === "parameter" && ctx.parsed.command) {
    const dispatchers = parameterTooltipDispatchers[ctx.parsed.command.name] || []
    for (const dispatcher of dispatchers) {
      const suggestion = dispatcher(ctx)
      if (suggestion) return suggestion
    }
  }

  return resolveDefaultTooltip(ctx)
}

export const buildTooltipState = (suggestion: Suggestions | null): TooltipState => {
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
}

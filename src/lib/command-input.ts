export const COMMAND_TRIGGER_PREFIXES = ["/", "?"] as const

export const isCommandLikeInput = (value: string) =>
  COMMAND_TRIGGER_PREFIXES.some((prefix) => value.startsWith(prefix))

export const getCommandToken = (value: string): string | null => {
  if (!value.startsWith("/")) return null
  const spaceIndex = value.indexOf(" ")
  return spaceIndex === -1 ? value : value.substring(0, spaceIndex)
}

export const startsWithKnownCommand = (value: string, commandNames: readonly string[]) => {
  const commandToken = getCommandToken(value)
  if (!commandToken) return false
  return commandNames.includes(commandToken)
}

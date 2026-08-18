// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
// The directory this TUI was launched from, in the form we show it. The same
// label is rendered on the remote control panel and sent to the backend as a
// socket param, so web can show which checkout an @mention will run in.
import { homedir } from "os"
import { getRuntimeCapabilities } from "./runtime-capabilities.js"

/** "/Users/svapnil/code/groupchat" -> "~/code/groupchat". */
export function shortenHome(path: string): string {
  const home = homedir()
  if (!home || (path !== home && !path.startsWith(`${home}/`))) return path
  return `~${path.slice(home.length)}`
}

/**
 * The display label for the working directory. Home-shortened on purpose: it
 * is what the user recognizes, and it keeps the OS account name off the wire.
 */
export function workspaceLabel(): string {
  return shortenHome(getRuntimeCapabilities().workspaceDir)
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { render } from "@opentui/solid"
import App from "./components/App"
import { checkForUpdate, performUpdate } from "./lib/update-checker"
import { initializeRuntimeCapabilities } from "./lib/runtime-capabilities"

async function main() {
  // Check if terminal supports our requirements
  if (!process.stdout.isTTY) {
    console.error("Error: groupchat requires an interactive terminal.\n")
    process.exit(1)
  }

  initializeRuntimeCapabilities()

  // Auto-update silently in the background (takes effect next launch)
  checkForUpdate().then((info) => {
    if (info.updateAvailable) {
      performUpdate(info.latestVersion).catch(() => {})
    }
  }).catch(() => {})

  // Clear terminal and start app
  process.stdout.write('\x1b[2J\x1b[0f')
  render(() => <App />, { exitOnCtrlC: false })
}

main()

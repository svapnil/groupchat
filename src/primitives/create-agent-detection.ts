// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { createEffect, onCleanup, type Accessor } from "solid-js"
import { execSync } from "child_process"
import type { AgentType } from "../lib/types"
import type { ChannelManager } from "../lib/channel-manager"

const POLL_INTERVAL_MS = 2000

function detectCurrentAgent(): AgentType {
  try {
    const result = execSync(
      `ps -p $(pgrep -x -n 'codex|claude|Cursor|Windsurf\\ Helper') -o comm=`,
      { stdio: "pipe", encoding: "utf-8" }
    ).trim()

    if (result.includes("@openai/codex")) return "codex"
    if (result === "claude") return "claude"
    if (result.includes("Cursor.app")) return "cursor"
    if (result.includes("Windsurf.app")) return "windsurf"
    return null
  } catch {
    return null
  }
}

export function createAgentDetection(
  channelManager: Accessor<ChannelManager | null>,
  isConnected: Accessor<boolean>
) {
  let lastSentAgent: AgentType | undefined = undefined

  const broadcastAgentUpdate = (agent: AgentType) => {
    const manager = channelManager()
    if (!manager) return
    manager.pushToAllChannels("update_current_agent", { current_agent: agent })
  }

  createEffect(() => {
    const manager = channelManager()
    const connected = isConnected()

    if (!manager || !connected) {
      lastSentAgent = undefined
      return
    }

    // Initial detection
    const initialAgent = detectCurrentAgent()
    if (lastSentAgent === undefined || lastSentAgent !== initialAgent) {
      lastSentAgent = initialAgent
      broadcastAgentUpdate(initialAgent)
    }

    // Poll every 2 seconds
    const intervalId = setInterval(() => {
      const currentAgent = detectCurrentAgent()
      if (currentAgent !== lastSentAgent) {
        lastSentAgent = currentAgent
        broadcastAgentUpdate(currentAgent)
      }
    }, POLL_INTERVAL_MS)

    onCleanup(() => clearInterval(intervalId))
  })
}

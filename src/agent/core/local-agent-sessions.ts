// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import type { RuntimeCapabilities } from "../../lib/runtime-capabilities"
import { createClaudeSdkSession } from "../claude/session"
import { AGENT_TYPE } from "../claude/claude-event-message-mutations"
import type { LocalAgentSessionEntry } from "./types"

export function createLocalAgentSessions(
  runtimeCapabilities: RuntimeCapabilities
): LocalAgentSessionEntry[] {
  const claude = createClaudeSdkSession()

  const sessions: LocalAgentSessionEntry[] = [
    {
      id: AGENT_TYPE,
      isAvailable: () => runtimeCapabilities.hasClaude,
      session: {
        isActive: claude.isActive,
        isConnecting: claude.isConnecting,
        messages: claude.messages,
        start: claude.start,
        stop: claude.stop,
        sendMessage: claude.sendMessage,
        appendError: claude.appendError,
        interrupt: claude.interrupt,
        pendingAction: claude.pendingPermission,
        pendingActions: claude.pendingPermissions,
        respondToPendingAction: claude.respondToPendingPermission,
        onEvent: claude.onCcEvent,
        findPendingActionMessageId: (requestId: string) => {
          const messages = claude.messages()
          for (let i = messages.length - 1; i >= 0; i -= 1) {
            const permission = messages[i].attributes?.claude?.permissionRequest
            if (permission?.requestId === requestId) return messages[i].id
          }
          return null
        },
        isThinkingMessage: (message) => Boolean(message.attributes?.claude?.thinking),
      },
    },
  ]

  return sessions
}

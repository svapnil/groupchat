// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import type { RuntimeCapabilities } from "../../lib/runtime-capabilities"
import { createClaudeSdkSession } from "../claude/session"
import { AGENT_ID as CLAUDE_AGENT_ID } from "../claude/claude-event-message-mutations"
import { createCodexSession } from "../codex/session"
import { AGENT_ID as CODEX_AGENT_ID } from "../codex/codex-event-message-mutations"
import type { LocalAgentSessionEntry } from "./types"

export function createLocalAgentSessions(
  runtimeCapabilities: RuntimeCapabilities
): LocalAgentSessionEntry[] {
  const claude = createClaudeSdkSession()
  const codex = createCodexSession()

  const sessions: LocalAgentSessionEntry[] = [
    {
      id: CLAUDE_AGENT_ID,
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
        pendingAction: claude.pendingAction,
        pendingActions: claude.pendingActionStack,
        respondToPendingAction: claude.respondToPendingPermission,
        submitPendingActionInput: claude.submitPendingActionInput,
        cancelPendingActionInput: claude.cancelPendingActionInput,
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
    {
      id: CODEX_AGENT_ID,
      isAvailable: () => runtimeCapabilities.hasCodex,
      session: {
        isActive: codex.isActive,
        isConnecting: codex.isConnecting,
        messages: codex.messages,
        start: codex.start,
        stop: codex.stop,
        sendMessage: codex.sendMessage,
        appendError: codex.appendError,
        interrupt: codex.interrupt,
        onEvent: codex.onCxEvent,
        isThinkingMessage: (message) => Boolean(message.attributes?.codex?.thinking),
      },
    },
  ]

  return sessions
}

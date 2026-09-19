// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { getSessionInfo, renameSession } from "@anthropic-ai/claude-agent-sdk"
import { nameThreadOnce } from "../core/thread-title"
import { generateClaudeTitle } from "./title-generator"

/**
 * Resolves a thread title for an owned Claude session by naming it, the same
 * way the Codex session does. Claude Code's own `customTitle` is deliberately
 * not consulted: it only writes one for some sessions (it stopped doing so for
 * sdk-cli runs as of CLI 2.1.278), so reading it first meant Claude and Codex
 * threads were named by different mechanisms and read differently.
 *
 * The generated name is still persisted into the session, so a resume reports
 * it natively and nothing pays for a second naming turn.
 *
 * One resolver per remote session: it holds the single-flight for that session.
 */
export function createClaudeTitleResolver(dir: string) {
  const name = nameThreadOnce(async (sessionId: string, prompt: string) => {
    const title = await generateClaudeTitle(prompt)
    if (!title) return null
    await renameSession(sessionId, title, { dir }).catch(() => {})
    return title
  })

  return async (sessionId: string): Promise<string | null> => {
    const info = await getSessionInfo(sessionId, { dir })
    const prompt = info?.firstPrompt?.trim()
    // The opening prompt may not be on disk yet; stay retryable until it is so
    // an early poll can't memoize a permanent null.
    if (!prompt) return null
    return name(sessionId, prompt)
  }
}

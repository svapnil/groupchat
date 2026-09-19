// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { mkdtemp, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { query } from "@anthropic-ai/claude-agent-sdk"
import {
  TITLE_FORMAT_INSTRUCTIONS,
  TITLE_ROLE_INSTRUCTIONS,
  TITLE_TASK_INSTRUCTIONS,
  buildTitleRequest,
  parseTitleOutput,
} from "../core/thread-title"
import { getRuntimeCapabilities } from "../../lib/runtime-capabilities"

/**
 * Naming is a one-shot summary: use the cheapest model, never the run's.
 *
 * Aliases, not dated snapshots. The CLI resolves `haiku`/`sonnet` to whatever
 * the current model in that tier is and remaps them per provider, so this can't
 * rot the way a pinned `claude-haiku-4-5-20251001` would once that snapshot is
 * retired — the naming turn would just start failing, and because naming
 * swallows every failure, titles would disappear with no error anywhere.
 *
 * The fallback covers the primary being unavailable rather than gone: an org
 * that restricts models, a provider without that tier, or a transient overload.
 * `GROUPCHAT_NAMING_MODEL` is the escape hatch when neither alias is usable.
 */
const NAMING_MODEL = "haiku"
const NAMING_FALLBACK_MODEL = "sonnet"

/**
 * One isolated naming turn in a throwaway directory: no repo access, no project
 * settings, no MCP, and failures are always null so naming can never break the
 * run it is naming. The Codex namer isolates the same way, with an ephemeral
 * thread standing in for the separate process.
 */
export async function generateClaudeTitle(prompt: string, timeoutMs = 60000): Promise<string | null> {
  let directory: string | undefined
  const abortController = new AbortController()
  const timer = setTimeout(() => abortController.abort(), timeoutMs)
  try {
    // The same executable the run itself uses; the SDK's bundled binary is not
    // installed when Claude Code came from a global install.
    const claudePath = getRuntimeCapabilities().claudePath
    if (!claudePath) return null

    // CLAUDECODE in the child environment triggers the nested-session refusal.
    const env = { ...process.env }
    delete env.CLAUDECODE

    directory = await realpath(await mkdtemp(join(tmpdir(), "groupchat-title-")))
    const session = query({
      prompt: buildTitleRequest(prompt),
      options: {
        model: process.env.GROUPCHAT_NAMING_MODEL?.trim() || NAMING_MODEL,
        fallbackModel: NAMING_FALLBACK_MODEL,
        cwd: directory,
        abortController,
        pathToClaudeCodeExecutable: claudePath,
        env,
        systemPrompt: {
          type: "custom",
          prompt: [TITLE_ROLE_INSTRUCTIONS, TITLE_TASK_INSTRUCTIONS, TITLE_FORMAT_INSTRUCTIONS],
        },
        settingSources: [],
        mcpServers: {},
        allowedTools: [],
        permissionMode: "dontAsk",
        persistSession: false,
        maxTurns: 1,
      },
    })

    let assistantText = ""
    let resultText: string | null = null
    for await (const message of session) {
      if (message.type === "assistant") {
        for (const block of message.message.content) {
          if (block.type === "text") assistantText += block.text
        }
      }
      if (message.type === "result") {
        if (message.subtype !== "success") return null
        resultText = typeof message.result === "string" ? message.result : null
      }
    }
    return parseTitleOutput(resultText?.trim() ? resultText : assistantText)
  } catch {
    // Naming must not fail or interrupt the user's working turn.
    return null
  } finally {
    clearTimeout(timer)
    if (directory) await rm(directory, { recursive: true, force: true }).catch(() => {})
  }
}

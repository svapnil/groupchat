// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { mkdtemp, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  TITLE_OUTPUT_SCHEMA,
  TITLE_ROLE_INSTRUCTIONS,
  TITLE_TASK_INSTRUCTIONS,
  buildTitleRequest,
  nameThreadOnce,
  parseTitleOutput,
} from "../core/thread-title"

type Transport = { call(method: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<unknown> }
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? value as Record<string, unknown> : {}

/**
 * One isolated naming turn, matching the Claude namer. Claude gets isolation
 * free from a separate process; here the turn shares the working run's
 * transport, so it has to earn it: an ephemeral read-only thread in a throwaway
 * directory with features and servers disabled, and its notifications filtered
 * out of the run by thread id so they can never enter the working turn.
 */
export function createCodexTitleGenerator(transport: Transport) {
  const threadIds = new Set<string>()
  let cancelled = false
  let finish: ((title: string | null) => void) | undefined
  let output = ""
  let titleDirectory: string | undefined

  const generate = async (_threadId: string, prompt: string): Promise<string | null> => {
    let directory: string | undefined
    let threadId: string | undefined
    let turnId: string | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    const completed = new Promise<string | null>(resolve => { finish = resolve })
    try {
      directory = await realpath(await mkdtemp(join(tmpdir(), "groupchat-title-")))
      titleDirectory = directory
      const response = record(await transport.call("config/read", { includeLayers: false }, 10000))
      const config = record(response.config)
      const overrides: Record<string, unknown> = {
        "features.shell_tool": false,
        "features.unified_exec": false,
        "features.multi_agent": false,
        "web_search": "disabled",
        "project_doc_max_bytes": 0,
        "apps._default.enabled": false,
      }
      for (const name of Object.keys(record(config.mcp_servers))) {
        overrides[`mcp_servers.${name}.enabled`] = false
        overrides[`mcp_servers.${name}.required`] = false
      }
      for (const name of Object.keys(record(config.apps))) overrides[`apps.${name}.enabled`] = false
      for (const name of Object.keys(record(config.plugins))) overrides[`plugins.${name}.enabled`] = false
      if (cancelled) return null
      const started = record(await transport.call("thread/start", {
        ephemeral: true,
        cwd: directory,
        approvalPolicy: "never",
        sandbox: "read-only",
        config: overrides,
        baseInstructions: TITLE_ROLE_INSTRUCTIONS,
        developerInstructions: TITLE_TASK_INSTRUCTIONS,
      }, 10000))
      const id = record(started.thread).id
      if (typeof id !== "string") return null
      threadId = id
      threadIds.add(id)
      if (cancelled) return null
      timer = setTimeout(() => finish?.(null), 60000)
      const turn = record(await transport.call("turn/start", {
        threadId,
        input: [{ type: "text", text: buildTitleRequest(prompt), text_elements: [] }],
        outputSchema: TITLE_OUTPUT_SCHEMA,
      }, 10000))
      const returnedTurnId = record(turn.turn).id
      if (typeof returnedTurnId === "string") turnId = returnedTurnId
      return await completed
    } catch {
      // Naming must not fail or interrupt the user's working turn.
      return null
    } finally {
      if (timer) clearTimeout(timer)
      finish = undefined
      if (threadId) {
        if (turnId) await transport.call("turn/interrupt", { threadId, turnId }, 5000).catch(() => {})
        await transport.call("thread/unsubscribe", { threadId }, 5000).catch(() => {})
      }
      if (directory) await rm(directory, { recursive: true, force: true }).catch(() => {})
    }
  }

  return {
    generate: nameThreadOnce(generate),
    cancel: () => { cancelled = true; finish?.(null) },
    handleNotification: (method: string, params: Record<string, unknown>): boolean => {
      // thread/started can precede the response to thread/start.
      if (method === "thread/started" && titleDirectory && record(params.thread).cwd === titleDirectory && record(params.thread).ephemeral === true) {
        const id = record(params.thread).id
        if (typeof id === "string") threadIds.add(id)
        return true
      }
      if (typeof params.threadId !== "string" || !threadIds.has(params.threadId)) return false
      if (method === "item/completed") {
        const item = record(params.item)
        if (item.type === "agentMessage" && typeof item.text === "string") output = item.text
      }
      if (method === "turn/completed") {
        finish?.(record(params.turn).status === "completed" ? parseTitleOutput(output) : null)
      }
      return true
    },
  }
}

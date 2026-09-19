// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { expect, test, mock } from "bun:test"
import { mkdtemp, mkdir, writeFile, appendFile, rm, realpath } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

let generated: string[] = []
let nextTitle: string | null = "Generated title"
mock.module("../../src/agent/claude/title-generator", () => ({
  generateClaudeTitle: async (prompt: string) => {
    generated.push(prompt)
    return nextTitle
  },
}))

const { createClaudeTitleResolver } = await import("../../src/agent/claude/session-title")

async function withSession(
  run: (context: { project: string; sessionId: string; path: string }) => Promise<void>,
) {
  // Match the SDK's canonical project path on macOS (/var -> /private/var).
  const dir = await realpath(await mkdtemp(join(tmpdir(), "groupchat-title-")))
  const previous = process.env.CLAUDE_CONFIG_DIR
  generated = []
  nextTitle = "Generated title"
  try {
    process.env.CLAUDE_CONFIG_DIR = join(dir, "config")
    const project = join(dir, "workspace")
    await mkdir(project)
    const storage = join(process.env.CLAUDE_CONFIG_DIR, "projects", project.replace(/[^a-zA-Z0-9]/g, "-"))
    await mkdir(storage, { recursive: true })
    const sessionId = crypto.randomUUID()
    const path = join(storage, `${sessionId}.jsonl`)
    await run({ project, sessionId, path })
  } finally {
    if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR
    else process.env.CLAUDE_CONFIG_DIR = previous
    await rm(dir, { recursive: true, force: true })
  }
}

const userLine = (sessionId: string, project: string, text: string) =>
  JSON.stringify({ type: "user", sessionId, cwd: project, message: { role: "user", content: text } }) + "\n"

test("names the thread itself rather than reusing a harness-written title", async () => {
  // Claude Code writes a title for only some sessions, so deferring to one
  // would name Claude and Codex threads by different mechanisms.
  await withSession(async ({ project, sessionId, path }) => {
    await writeFile(
      path,
      userLine(sessionId, project, "Please implement conversation titles") +
        JSON.stringify({ type: "ai-title", aiTitle: "Harness written title", sessionId }) + "\n",
    )
    expect(await createClaudeTitleResolver(project)(sessionId)).toBe("Generated title")
    expect(generated).toEqual(["Please implement conversation titles"])
  })
})

test("an empty session stays retryable, then names and persists once the prompt lands", async () => {
  await withSession(async ({ project, sessionId, path }) => {
    const resolve = createClaudeTitleResolver(project)
    await writeFile(path, "")
    // Nothing to name yet: must not memoize a permanent null.
    expect(await resolve(sessionId)).toBeNull()
    expect(generated).toEqual([])

    await appendFile(path, userLine(sessionId, project, "Please implement conversation titles"))
    expect(await resolve(sessionId)).toBe("Generated title")
    expect(generated).toEqual(["Please implement conversation titles"])

    // Persisted into the session, so a later read finds it natively.
    const { getSessionInfo } = await import("@anthropic-ai/claude-agent-sdk")
    expect((await getSessionInfo(sessionId, { dir: project }))?.customTitle).toBe("Generated title")
  })
})

test("concurrent polls name a session at most once", async () => {
  await withSession(async ({ project, sessionId, path }) => {
    const resolve = createClaudeTitleResolver(project)
    await writeFile(path, userLine(sessionId, project, "Please implement conversation titles"))
    const results = await Promise.all([resolve(sessionId), resolve(sessionId), resolve(sessionId)])
    expect(results).toEqual(["Generated title", "Generated title", "Generated title"])
    expect(generated.length).toBe(1)
  })
})

test("a failed naming turn yields null instead of a bogus title", async () => {
  await withSession(async ({ project, sessionId, path }) => {
    nextTitle = null
    await writeFile(path, userLine(sessionId, project, "Please implement conversation titles"))
    expect(await createClaudeTitleResolver(project)(sessionId)).toBeNull()
    expect(generated.length).toBe(1)
  })
})

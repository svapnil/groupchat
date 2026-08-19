// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { afterEach, describe, expect, mock, test } from "bun:test"
import type { RemoteHarnessSession, RemoteSessionOptions } from "../../src/agent/core/harness-session"

function closedStream(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.close()
    },
  })
}

type MockProc = {
  command: string[]
  env: Record<string, string | undefined>
  writtenLines: () => Array<Record<string, unknown>>
  emit: (event: Record<string, unknown>) => void
  exit: (code: number) => void
}

class MockClaudeSpawner {
  procs: MockProc[] = []
  private originalSpawn: typeof Bun.spawn | null = null

  install() {
    this.originalSpawn = Bun.spawn

    Bun.spawn = (((command: string[], options?: { env?: Record<string, string | undefined> }) => {
      let stdoutController: ReadableStreamDefaultController<Uint8Array> | null = null
      const rawLines: string[] = []
      let inputBuffer = ""

      const stdin = new WritableStream<Uint8Array>({
        write: (chunk) => {
          inputBuffer += new TextDecoder().decode(chunk)
          const lines = inputBuffer.split("\n")
          inputBuffer = lines.pop() || ""
          for (const line of lines) {
            if (line.trim()) rawLines.push(line.trim())
          }
        },
      })

      const stdout = new ReadableStream<Uint8Array>({
        start: (controller) => {
          stdoutController = controller
        },
      })

      let exited = false
      let resolveExit: ((code: number) => void) | null = null
      const exitPromise = new Promise<number>((resolve) => {
        resolveExit = (code: number) => {
          if (exited) return
          exited = true
          try {
            stdoutController?.close()
          } catch {
            // already closed
          }
          resolve(code)
        }
      })

      const mockProc: MockProc = {
        command: [...command],
        env: options?.env ?? {},
        writtenLines: () => rawLines.map((line) => JSON.parse(line) as Record<string, unknown>),
        emit: (event) => {
          stdoutController?.enqueue(new TextEncoder().encode(`${JSON.stringify(event)}\n`))
        },
        exit: (code) => resolveExit?.(code),
      }
      this.procs.push(mockProc)

      return {
        pid: 4242,
        stdin,
        stdout,
        stderr: closedStream(),
        exited: exitPromise,
        kill: () => {
          resolveExit?.(0)
          return true
        },
      } as any
    }) as typeof Bun.spawn)
  }

  teardown() {
    for (const proc of this.procs) proc.exit(0)
    if (this.originalSpawn) {
      Bun.spawn = this.originalSpawn
    }
  }
}

async function waitForQueue() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

type Recorded = { method: string; params: Record<string, unknown> }

let activeSpawner: MockClaudeSpawner | null = null
let activeSession: RemoteHarnessSession | null = null

async function createStartedSession(overrides: Partial<RemoteSessionOptions> = {}): Promise<{
  session: RemoteHarnessSession
  spawner: MockClaudeSpawner
  notifications: Recorded[]
  threadIds: string[]
  fatals: string[]
}> {
  mock.module("../../src/lib/runtime-capabilities", () => ({
    getRuntimeCapabilities: () => ({
      hasCodex: false,
      codexPath: null,
      hasClaude: true,
      claudePath: "claude",
      workspaceDir: process.cwd(),
    }),
  }))

  const spawner = new MockClaudeSpawner()
  spawner.install()

  const notifications: Recorded[] = []
  const threadIds: string[] = []
  const fatals: string[] = []

  const { createClaudeSession } = await import("../../src/agent/claude/remote-session")
  const session = createClaudeSession({
    instructions: "Groupchat instructions",
    onNotification: (method, params) => notifications.push({ method, params }),
    onThreadStarted: (id) => threadIds.push(id),
    onFatal: (message) => fatals.push(message),
    ...overrides,
  })

  await session.start()

  activeSpawner = spawner
  activeSession = session

  return { session, spawner, notifications, threadIds, fatals }
}

afterEach(() => {
  activeSession?.stop()
  activeSession = null
  activeSpawner?.teardown()
  activeSpawner = null
  mock.restore()
})

describe("createClaudeSession", () => {
  test("spawns the stream-json protocol with no prompt argument and a scrubbed env", async () => {
    const { spawner } = await createStartedSession()

    const [proc] = spawner.procs
    expect(proc.command[0]).toBe("claude")
    expect(proc.command).toContain("--print")
    expect(proc.command).toContain("--include-partial-messages")
    expect(proc.command).toContain("--verbose")
    const joined = proc.command.join(" ")
    expect(joined).toContain("--input-format stream-json")
    expect(joined).toContain("--output-format stream-json")
    expect(joined).toContain("--permission-mode acceptEdits")
    expect(joined).toContain("--append-system-prompt Groupchat instructions")
    expect(joined).not.toContain("--sdk-url")
    expect(joined).not.toContain("--resume")
    // All prompts ride stdin — the last arg is a flag value, never a prompt.
    expect(proc.command).not.toContain("Groupchat instructions\n")
    expect(proc.env.CLAUDECODE).toBeUndefined()
    expect(proc.env.CLAUDE_CODE_ENTRYPOINT).toBeUndefined()
  })

  test("passes --resume for a continuation", async () => {
    const { spawner } = await createStartedSession({ resumeThreadId: "sess-123" })

    const joined = spawner.procs[0].command.join(" ")
    expect(joined).toContain("--resume sess-123")
  })

  test("sends prompts as NDJSON user messages on stdin", async () => {
    const { session, spawner } = await createStartedSession()

    await session.sendMessage("Hello Claude")
    await waitForQueue()

    const lines = spawner.procs[0].writtenLines()
    expect(lines).toHaveLength(1)
    expect(lines[0]).toEqual({
      type: "user",
      message: { role: "user", content: [{ type: "text", text: "Hello Claude" }] },
    })
  })

  test("reports the session id and model from system/init", async () => {
    const { session, spawner, threadIds } = await createStartedSession()

    spawner.procs[0].emit({
      type: "system",
      subtype: "init",
      session_id: "sess-abc",
      model: "claude-fable-5",
    })
    await waitForQueue()

    expect(threadIds).toEqual(["sess-abc"])
    expect(session.getActiveModel()).toBe("claude-fable-5")

    // init recurs across top-level inputs; the callback fires once.
    spawner.procs[0].emit({ type: "system", subtype: "init", session_id: "sess-abc" })
    await waitForQueue()
    expect(threadIds).toEqual(["sess-abc"])
  })

  test("forwards whitelisted events true-to-source, stripping thinking signatures", async () => {
    const { spawner, notifications } = await createStartedSession()

    spawner.procs[0].emit({
      type: "assistant",
      message: {
        id: "msg_1",
        content: [
          { type: "thinking", thinking: "let me think", signature: "SECRETSIG" },
          { type: "text", text: "hello" },
        ],
      },
      parent_tool_use_id: null,
      session_id: "sess-abc",
    })
    spawner.procs[0].emit({ type: "keep_alive" })
    await waitForQueue()

    expect(notifications).toHaveLength(1)
    expect(notifications[0].method).toBe("assistant")
    const message = notifications[0].params.message as {
      content: Array<Record<string, unknown>>
    }
    expect(message.content[0].thinking).toBe("let me think")
    expect(message.content[0].signature).toBeUndefined()
    expect(message.content[1].text).toBe("hello")
  })

  test("forwards tool-result user echoes but not plain prompt echoes", async () => {
    const { spawner, notifications } = await createStartedSession()

    spawner.procs[0].emit({
      type: "user",
      message: { role: "user", content: [{ type: "text", text: "echoed prompt" }] },
    })
    spawner.procs[0].emit({
      type: "user",
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "tool-1", content: "ok" }],
      },
    })
    await waitForQueue()

    expect(notifications).toHaveLength(1)
    expect(notifications[0].method).toBe("user")
  })

  test("steers only while a turn is active", async () => {
    const { session, spawner } = await createStartedSession()

    expect(await session.steer("too early")).toBe(false)

    await session.sendMessage("Do a thing")
    expect(await session.steer("also do this")).toBe(true)

    spawner.procs[0].emit({ type: "result", subtype: "success", is_error: false })
    await waitForQueue()
    expect(await session.steer("too late")).toBe(false)

    const lines = spawner.procs[0].writtenLines()
    expect(lines).toHaveLength(2)
  })

  test("falls back to a fresh session when a resumed process dies before init", async () => {
    const { session, spawner, threadIds } = await createStartedSession({
      resumeThreadId: "sess-gone",
    })

    await session.sendMessage("Continue please")
    spawner.procs[0].exit(1)
    await waitForQueue()
    await waitForQueue()

    expect(spawner.procs).toHaveLength(2)
    expect(spawner.procs[1].command.join(" ")).not.toContain("--resume")
    const replayed = spawner.procs[1].writtenLines()
    expect(replayed).toHaveLength(1)
    expect((replayed[0].message as { content: Array<{ text: string }> }).content[0].text).toBe(
      "Continue please",
    )
    expect(session.didFallbackToFreshThread()).toBe(true)

    spawner.procs[1].emit({ type: "system", subtype: "init", session_id: "sess-new" })
    await waitForQueue()
    expect(threadIds).toEqual(["sess-new"])
  })

  test("falls back to a fresh session when a resume errors out before init", async () => {
    const { session, spawner, notifications } = await createStartedSession({
      resumeThreadId: "sess-gone",
    })

    await session.sendMessage("Continue please")
    // Observed live: an unknown --resume id emits an error result, never inits.
    spawner.procs[0].emit({ type: "result", subtype: "error_during_execution", is_error: true })
    await waitForQueue()
    await waitForQueue()

    expect(spawner.procs).toHaveLength(2)
    expect(spawner.procs[1].command.join(" ")).not.toContain("--resume")
    expect(spawner.procs[1].writtenLines()).toHaveLength(1)
    expect(session.didFallbackToFreshThread()).toBe(true)
    // The pre-init error result is swallowed, not forwarded.
    expect(notifications.filter((n) => n.method === "result")).toHaveLength(0)
  })

  test("reports an unexpected exit through onFatal", async () => {
    const { session, spawner, fatals } = await createStartedSession()

    spawner.procs[0].emit({ type: "system", subtype: "init", session_id: "sess-abc" })
    await waitForQueue()
    spawner.procs[0].exit(1)
    await waitForQueue()
    await waitForQueue()

    expect(fatals).toHaveLength(1)
    expect(fatals[0]).toContain("exited")
    expect(session.isActive()).toBe(false)
  })
})

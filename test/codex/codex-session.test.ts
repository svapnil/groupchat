// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { afterEach, describe, expect, mock, test } from "bun:test"
import { createRoot } from "solid-js"
import type { Message } from "../../src/lib/types"
import type { CreateCodexSessionOptions } from "../../src/agent/codex/session"

type CodexSessionHandle = {
  start: () => Promise<void>
  stop: (reason?: string) => void
  sendMessage: (content: string, username: string) => Promise<void>
  messages: () => Message[]
  getActiveModel: () => string | null
  steer: (content: string) => Promise<boolean>
  isActive: () => boolean
}

function closedStream(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.close()
    },
  })
}

class MockCodexTransport {
  private originalSpawn: typeof Bun.spawn | null = null
  private stdoutController: ReadableStreamDefaultController<Uint8Array> | null = null
  private resolveExit: ((code: number) => void) | null = null
  private inputBuffer = ""
  spawnCommand: string[] | null = null
  turnStartCount = 0
  completeBeforeResponse = false
  threadStartParams: Record<string, unknown> | null = null
  threadResumeParams: Record<string, unknown> | null = null

  install() {
    this.originalSpawn = Bun.spawn

    Bun.spawn = (((command: string[]) => {
      this.spawnCommand = [...command]

      const stdout = new ReadableStream<Uint8Array>({
        start: (controller) => {
          this.stdoutController = controller
        },
      })

      const stdin = new WritableStream<Uint8Array>({
        write: (chunk) => {
          this.handleClientChunk(chunk)
        },
      })

      let exited = false
      const exitPromise = new Promise<number>((resolve) => {
        this.resolveExit = (code: number) => {
          if (exited) return
          exited = true
          resolve(code)
        }
      })

      return {
        pid: 99998,
        stdin,
        stdout,
        stderr: closedStream(),
        exited: exitPromise,
        kill: () => {
          this.resolveExit?.(0)
          return true
        },
      } as any
    }) as typeof Bun.spawn)
  }

  private handleClientChunk(chunk: Uint8Array) {
    this.inputBuffer += new TextDecoder().decode(chunk)

    const lines = this.inputBuffer.split("\n")
    this.inputBuffer = lines.pop() || ""

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      this.handleClientLine(trimmed)
    }
  }

  private handleClientLine(line: string) {
    const payload = JSON.parse(line) as {
      id?: number
      method?: string
      params?: Record<string, unknown>
    }

    if (typeof payload.id !== "number" || typeof payload.method !== "string") {
      return
    }

    switch (payload.method) {
      case "initialize":
        this.pushServerMessage({ id: payload.id, result: {} })
        break
      case "thread/start":
        this.threadStartParams = payload.params ?? {}
        this.pushServerMessage({
          id: payload.id,
          result: { thread: { id: "thread-1" }, model: "gpt-5.4-codex" },
        })
        break
      case "thread/resume":
        this.threadResumeParams = payload.params ?? {}
        this.pushServerMessage({
          id: payload.id,
          result: { thread: { id: "thread-1" }, model: "gpt-5.4-codex" },
        })
        break
      case "turn/start":
        this.turnStartCount += 1
        if (this.completeBeforeResponse) {
          this.emitNotification("turn/completed", {
            threadId: "thread-1",
            turn: { id: `turn-${this.turnStartCount}`, status: "completed" },
          })
        }
        this.pushServerMessage({ id: payload.id, result: { turn: { id: `turn-${this.turnStartCount}` } } })
        break
      case "turn/interrupt":
        this.pushServerMessage({ id: payload.id, result: {} })
        break
      default:
        this.pushServerMessage({ id: payload.id, result: {} })
        break
    }
  }

  emitNotification(method: string, params: Record<string, unknown>) {
    this.pushServerMessage({ method, params })
  }

  closeOutput() {
    this.stdoutController?.close()
    this.stdoutController = null
  }

  private pushServerMessage(payload: unknown) {
    this.stdoutController?.enqueue(
      new TextEncoder().encode(`${JSON.stringify(payload)}\n`)
    )
  }

  teardown() {
    this.resolveExit?.(0)
    this.stdoutController?.close()
    if (this.originalSpawn) {
      Bun.spawn = this.originalSpawn
    }
  }
}

let activeSession: CodexSessionHandle | null = null
let disposeRoot: (() => void) | null = null
let activeTransport: MockCodexTransport | null = null

async function waitForQueue() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

async function createStartedSession(
  options?: CreateCodexSessionOptions,
): Promise<{ session: CodexSessionHandle; transport: MockCodexTransport }> {
  mock.module("../../src/lib/runtime-capabilities", () => ({
    getRuntimeCapabilities: () => ({
      hasCodex: true,
      codexPath: "codex",
      hasClaude: false,
      claudePath: null,
      workspaceDir: process.cwd(),
    }),
  }))

  const transport = new MockCodexTransport()
  transport.install()

  const { createCodexSession } = await import("../../src/agent/codex/session")
  let session!: CodexSessionHandle
  let dispose = () => {}

  createRoot((rootDispose) => {
    dispose = rootDispose
    session = createCodexSession(options) as unknown as CodexSessionHandle
  })

  await session.start()

  activeSession = session
  disposeRoot = dispose
  activeTransport = transport

  return { session, transport }
}

afterEach(() => {
  if (activeSession) {
    activeSession.stop()
    activeSession = null
  }
  if (disposeRoot) {
    disposeRoot()
    disposeRoot = null
  }
  if (activeTransport) {
    activeTransport.teardown()
    activeTransport = null
  }
  mock.restore()
})

describe("createCodexSession", () => {
  test("headless sessions support repeated turns without retaining UI history or stale completions", async () => {
    const notifications: string[] = []
    const { session, transport } = await createStartedSession({
      headless: true,
      onNotification: (method) => notifications.push(method),
    })
    await session.sendMessage("first", "remote")
    transport.emitNotification("turn/completed", { threadId: "child", turn: { id: "child-turn", status: "completed" } })
    await waitForQueue()
    expect(notifications).toEqual([])
    expect(await session.steer("still working")).toBe(true)
    transport.emitNotification("turn/completed", { threadId: "thread-1", turn: { id: "turn-1", status: "completed" } })
    await waitForQueue()
    expect(await session.steer("too late")).toBe(false)
    await session.sendMessage("second", "remote")
    transport.emitNotification("turn/completed", { threadId: "thread-1", turn: { id: "turn-1", status: "completed" } })
    transport.emitNotification("item/agentMessage/delta", { threadId: "thread-1", turnId: "turn-1", delta: "stale" })
    await waitForQueue()
    expect(notifications).toEqual(["turn/completed"])
    expect(await session.steer("second turn")).toBe(true)
    transport.emitNotification("turn/completed", { threadId: "thread-1", turn: { id: "turn-2", status: "completed" } })
    await waitForQueue()
    expect(notifications).toEqual(["turn/completed", "turn/completed"])
    expect(transport.turnStartCount).toBe(2)
    expect(session.messages()).toEqual([])
    expect(session.isActive()).toBe(true)
  })

  test("a late turn/start response cannot resurrect a completed turn", async () => {
    const { session, transport } = await createStartedSession({ headless: true })
    transport.completeBeforeResponse = true
    await session.sendMessage("first", "remote")
    expect(await session.steer("too late")).toBe(false)
    await session.sendMessage("second", "remote")
    expect(await session.steer("also too late")).toBe(false)
    expect(transport.turnStartCount).toBe(2)
  })

  test("a broken output stream reports a fatal error and deactivates the session", async () => {
    const fatals: string[] = []
    const { session, transport } = await createStartedSession({ headless: true, onFatal: message => fatals.push(message) })
    transport.closeOutput()
    await waitForQueue()
    expect(fatals).toEqual(["Codex output stream closed unexpectedly."])
    expect(session.isActive()).toBe(false)
  })

  // app-server silently ignores params it doesn't know, so a wrong key here
  // fails open: the agent runs with no prompt at all and nothing reports it.
  test("sends the agent prompt as developerInstructions on thread/start", async () => {
    const { transport } = await createStartedSession({ instructions: "Be a pirate." })

    expect(transport.threadStartParams?.developerInstructions).toBe("Be a pirate.")
  })

  test("carries the agent prompt into a resumed thread", async () => {
    const { transport } = await createStartedSession({
      instructions: "Be a pirate.",
      resumeThreadId: "thread-0",
    })

    expect(transport.threadResumeParams?.developerInstructions).toBe("Be a pirate.")
  })

  test("retains the model resolved by thread/start", async () => {
    const { session } = await createStartedSession()

    expect(session.getActiveModel()).toBe("gpt-5.4-codex")
  })

  test("clears the empty thinking placeholder when a turn completes without output", async () => {
    const { session, transport } = await createStartedSession()

    await session.sendMessage("Ping", "alice")

    expect(session.messages().some((message) => Boolean(message.attributes?.codex?.thinking))).toBe(true)

    transport.emitNotification("turn/completed", {
      turn: {
        id: "turn-1",
        status: "completed",
      },
    })
    await waitForQueue()

    const messages = session.messages()
    expect(messages.some((message) => Boolean(message.attributes?.codex?.thinking))).toBe(false)

    const resultMessage = messages.find((message) => Boolean(message.attributes?.codex?.result))
    expect(resultMessage?.attributes?.codex?.result?.subtype).toBe("success")
    expect(resultMessage?.attributes?.codex?.result?.isError).toBe(false)
  })
})

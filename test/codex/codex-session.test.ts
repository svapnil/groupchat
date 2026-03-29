// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { afterEach, describe, expect, mock, test } from "bun:test"
import { createRoot } from "solid-js"
import type { Message } from "../../src/lib/types"

type CodexSessionHandle = {
  start: () => Promise<void>
  stop: (reason?: string) => void
  sendMessage: (content: string, username: string) => Promise<void>
  messages: () => Message[]
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
        this.pushServerMessage({ id: payload.id, result: { thread: { id: "thread-1" } } })
        break
      case "turn/start":
        this.turnStartCount += 1
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

async function createStartedSession(): Promise<{ session: CodexSessionHandle; transport: MockCodexTransport }> {
  mock.module("../../src/lib/runtime-capabilities", () => ({
    getRuntimeCapabilities: () => ({
      hasCodex: true,
      codexPath: "codex",
    }),
  }))

  const transport = new MockCodexTransport()
  transport.install()

  const { createCodexSession } = await import("../../src/agent/codex/session")
  let session!: CodexSessionHandle
  let dispose = () => {}

  createRoot((rootDispose) => {
    dispose = rootDispose
    session = createCodexSession() as unknown as CodexSessionHandle
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

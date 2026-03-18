// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { afterEach, describe, expect, mock, test } from "bun:test"
import { join } from "node:path"
import { createRoot } from "solid-js"
import { testRender } from "@opentui/solid"
import type { Message } from "../../src/lib/types"
import { MessageList } from "../../src/components/MessageList"

type CapturedCcEvent = {
  agentId: string
  turnId: string
  sessionId?: string
  event: "question" | "thinking" | "tool_call" | "tool_progress" | "tool_result" | "text_stream" | "text" | "result"
  content: string
  toolName?: string
  toolUseId?: string
  isError?: boolean
  outputTokens?: number
  elapsedSeconds?: number
  stopReason?: string | null
}

type ClaudeSessionHandle = {
  start: () => Promise<void>
  stop: (reason?: string) => void
  sendMessage: (content: string, username: string) => Promise<void>
  respondToPendingPermission: (selectedIndex: number) => Promise<void>
  submitPendingActionInput: (value: string) => Promise<void>
  cancelPendingActionInput: () => void
  onCcEvent: (callback: (event: CapturedCcEvent) => void) => void
  messages: () => Message[]
  pendingPermissions: () => Array<{ toolName: string }>
}

function closedStream(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.close()
    },
  })
}

class MockClaudeTransport {
  private serveOptions: any = null
  private socket: any = null
  private resolveExit: ((code: number) => void) | null = null
  private originalServe: typeof Bun.serve | null = null
  private originalSpawn: typeof Bun.spawn | null = null
  spawnCommand: string[] | null = null
  sentLines: string[] = []

  install() {
    this.originalServe = Bun.serve
    this.originalSpawn = Bun.spawn

    Bun.serve = ((options: any) => {
      this.serveOptions = options
      return {
        port: 43210,
        stop: () => {},
        upgrade: () => true,
      } as any
    }) as typeof Bun.serve

    Bun.spawn = (((command: string[]) => {
      this.spawnCommand = [...command]
      let exited = false
      const exitPromise = new Promise<number>((resolve) => {
        this.resolveExit = (code: number) => {
          if (exited) return
          exited = true
          resolve(code)
        }
      })

      return {
        pid: 99999,
        stdout: closedStream(),
        stderr: closedStream(),
        exited: exitPromise,
        kill: () => {
          this.resolveExit?.(0)
          return true
        },
      } as any
    }) as typeof Bun.spawn)
  }

  openSocket() {
    const handlers = this.serveOptions?.websocket
    if (!handlers) {
      throw new Error("Mock server websocket handlers were not initialized")
    }
    if (this.socket) return

    const socket: any = {
      send: (line: string) => {
        this.sentLines.push(String(line))
        return true
      },
      close: () => {
        handlers.close?.(socket)
      },
    }

    this.socket = socket
    handlers.open?.(socket)
  }

  sendLine(line: string) {
    const handlers = this.serveOptions?.websocket
    if (!handlers || !this.socket) {
      throw new Error("Mock websocket is not open")
    }
    handlers.message(this.socket, `${line}\n`)
  }

  sendJson(payload: unknown) {
    this.sendLine(JSON.stringify(payload))
  }

  async replayNdjsonFile(path: string) {
    const raw = await Bun.file(path).text()
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    for (const line of lines) {
      this.sendLine(line)
    }
  }

  teardown() {
    this.resolveExit?.(0)
    if (this.originalServe) {
      Bun.serve = this.originalServe
    }
    if (this.originalSpawn) {
      Bun.spawn = this.originalSpawn
    }
  }
}

let activeSession: ClaudeSessionHandle | null = null
let disposeRoot: (() => void) | null = null
let activeTransport: MockClaudeTransport | null = null
let testSetup: Awaited<ReturnType<typeof testRender>> | null = null

async function createStartedSession(): Promise<{ session: ClaudeSessionHandle; transport: MockClaudeTransport }> {
  mock.module("../../src/lib/runtime-capabilities", () => ({
    getRuntimeCapabilities: () => ({
      hasClaude: true,
      claudePath: "claude",
    }),
  }))

  const transport = new MockClaudeTransport()
  transport.install()

  const { createClaudeSdkSession } = await import("../../src/agent/claude/session")
  let session!: ClaudeSessionHandle
  let dispose = () => {}
  createRoot((rootDispose) => {
    dispose = rootDispose
    session = createClaudeSdkSession() as unknown as ClaudeSessionHandle
  })

  await session.start()
  transport.openSocket()

  activeSession = session
  disposeRoot = dispose
  activeTransport = transport

  return { session, transport }
}

afterEach(() => {
  if (testSetup) {
    testSetup.renderer.destroy()
    testSetup = null
  }
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

describe("createClaudeSdkSession stream ingestion", () => {
  test("starts Claude with include-partial-messages enabled", async () => {
    const { transport } = await createStartedSession()

    expect(transport.spawnCommand).toBeTruthy()
    expect(transport.spawnCommand).toContain("--include-partial-messages")
  })

  test("ingests stream deltas, finalizes assistant output, and emits cc text/result events", async () => {
    const { session, transport } = await createStartedSession()
    const events: CapturedCcEvent[] = []
    session.onCcEvent((event) => events.push(event))

    transport.sendJson({
      type: "system",
      subtype: "init",
      session_id: "sdk-session-1",
      model: "claude-opus-4-6",
    })

    await session.sendMessage("Summarize status", "alice")

    transport.sendJson({
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 0,
        delta: {
          type: "text_delta",
          text: "Hello",
        },
      },
      parent_tool_use_id: null,
    })

    let messages = session.messages()
    const firstStreaming = messages.find((message) => message.attributes?.claude?.eventType === "stream_event")
    expect(firstStreaming?.content).toBe("Hello")
    expect(firstStreaming?.attributes?.claude?.eventType).toBe("stream_event")

    transport.sendJson({
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 0,
        delta: {
          type: "text_delta",
          text: " world",
        },
      },
      parent_tool_use_id: null,
    })

    messages = session.messages()
    const secondStreaming = messages.find((message) => message.id === firstStreaming?.id)
    expect(secondStreaming?.content).toBe("Hello world")

    transport.sendJson({
      type: "assistant",
      parent_tool_use_id: null,
      message: {
        id: "msg-assistant-1",
        model: "claude-opus-4-6",
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Hello world" }],
      },
    })

    messages = session.messages()
    expect(messages.some((message) => message.id === firstStreaming?.id)).toBe(false)
    const assistantMessage = messages.find((message) => message.id === "msg-assistant-1")
    expect(assistantMessage?.content).toBe("Hello world")
    expect(assistantMessage?.attributes?.claude?.eventType).toBe("assistant")

    transport.sendJson({
      type: "result",
      subtype: "success",
      is_error: false,
      num_turns: 1,
      duration_ms: 111,
      total_cost_usd: 0.001,
      result: "ok",
    })

    messages = session.messages()
    const finalized = messages.find((message) => message.id === "msg-assistant-1")
    expect(finalized?.attributes?.claude?.result?.subtype).toBe("success")
    expect(finalized?.attributes?.claude?.result?.isError).toBe(false)
    expect(messages.some((message) => Boolean(message.attributes?.claude?.thinking))).toBe(false)

    expect(events.map((event) => event.event)).toEqual([
      "question",
      "text_stream",
      "text_stream",
      "text",
      "result",
    ])
    expect(events[0]?.content).toBe("Summarize status")
    expect(events[1]?.content).toBe("Hello")
    expect(events[2]?.content).toBe("Hello world")
    expect(events[3]?.content).toContain("Hello world")
    expect(events[4]?.isError).toBe(false)
    expect(new Set(events.map((event) => event.turnId)).size).toBe(1)
    expect(new Set(events.map((event) => event.sessionId)).size).toBe(1)
  })

  test("emits thinking, tool progress, and tool summary cc events from live sdk messages", async () => {
    const { session, transport } = await createStartedSession()
    const events: CapturedCcEvent[] = []
    session.onCcEvent((event) => events.push(event))

    await session.sendMessage("Inspect repo", "alice")

    transport.sendJson({
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 0,
        delta: {
          type: "thinking_delta",
          thinking: "Planning tool calls",
        },
      },
      parent_tool_use_id: null,
    })
    transport.sendJson({
      type: "stream_event",
      event: {
        type: "message_delta",
        delta: { stop_reason: null },
        usage: { output_tokens: 128 },
      },
      parent_tool_use_id: null,
    })
    transport.sendJson({
      type: "tool_progress",
      tool_use_id: "tool-read-1",
      tool_name: "Read",
      elapsed_time_seconds: 1.2,
    })
    transport.sendJson({
      type: "tool_use_summary",
      summary: "Read(/repo/README.md)",
      preceding_tool_use_ids: ["tool-read-1"],
    })

    expect(events.map((event) => event.event)).toEqual([
      "question",
      "thinking",
      "thinking",
      "tool_progress",
      "tool_result",
    ])
    expect(events[1]?.content).toBe("Planning tool calls")
    expect(events[2]?.outputTokens).toBe(128)
    expect(events[3]?.content).toBe("Read running (1.2s)")
    expect(events[4]?.content).toBe("Read(/repo/README.md)")

    const thinkingMessage = session.messages().find((message) => Boolean(message.attributes?.claude?.thinking))
    expect(thinkingMessage?.content).toBe("Planning tool calls")
    expect(thinkingMessage?.attributes?.claude?.outputTokens).toBe(128)
  })

  test("emits tool_call cc events from assistant tool_use blocks without relying on permission requests", async () => {
    const { session, transport } = await createStartedSession()
    const events: CapturedCcEvent[] = []
    session.onCcEvent((event) => events.push(event))

    await session.sendMessage("Inspect repo", "alice")

    transport.sendJson({
      type: "assistant",
      parent_tool_use_id: null,
      message: {
        id: "msg-assistant-tool-use",
        model: "claude-opus-4-6",
        stop_reason: null,
        usage: { output_tokens: 12 },
        content: [
          {
            type: "tool_use",
            id: "tool-read-1",
            name: "Read",
            input: { file_path: "/repo/README.md" },
          },
          {
            type: "tool_use",
            id: "tool-bash-1",
            name: "Bash",
            input: { command: "pwd" },
          },
        ],
      },
    })

    const toolCalls = events.filter((event) => event.event === "tool_call")
    expect(toolCalls).toHaveLength(2)
    expect(toolCalls.map((event) => [event.toolName, event.toolUseId, event.content])).toEqual([
      ["Read", "tool-read-1", "Read(/repo/README.md)"],
      ["Bash", "tool-bash-1", "Bash(pwd)"],
    ])
  })

  test("does not emit duplicate tool_call events when assistant tool_use and can_use_tool reference the same tool", async () => {
    const { session, transport } = await createStartedSession()
    const events: CapturedCcEvent[] = []
    session.onCcEvent((event) => events.push(event))

    await session.sendMessage("Inspect repo", "alice")

    transport.sendJson({
      type: "assistant",
      parent_tool_use_id: null,
      message: {
        id: "msg-assistant-tool-use-dedupe",
        model: "claude-opus-4-6",
        stop_reason: null,
        content: [
          {
            type: "tool_use",
            id: "tool-bash-1",
            name: "Bash",
            input: { command: "pwd" },
          },
        ],
      },
    })

    transport.sendJson({
      type: "control_request",
      request_id: "req-bash-1",
      request: {
        subtype: "can_use_tool",
        tool_name: "Bash",
        tool_use_id: "tool-bash-1",
        input: { command: "pwd" },
      },
    })

    const toolCalls = events.filter((event) => event.event === "tool_call")
    expect(toolCalls).toHaveLength(1)
    expect(toolCalls[0]?.toolUseId).toBe("tool-bash-1")
  })

  test("replays real WebSearch fixture and emits expected cc tool/text/result events", async () => {
    const { session, transport } = await createStartedSession()
    const events: CapturedCcEvent[] = []
    session.onCcEvent((event) => events.push(event))

    await session.sendMessage("Find latest updates", "alice")
    await transport.replayNdjsonFile(join(import.meta.dir, "fixtures", "real-websearch-and-bash.ndjson"))

    expect(events[0]?.event).toBe("question")

    const toolCalls = events.filter((event) => event.event === "tool_call")
    expect(toolCalls.map((event) => event.toolName)).toEqual(["WebSearch", "WebSearch", "Bash"])

    const textEvents = events.filter((event) => event.event === "text")
    expect(textEvents.length).toBeGreaterThanOrEqual(1)
    expect(textEvents[textEvents.length - 1]?.content).toContain("Here's a quick summary")

    const finalEvent = events[events.length - 1]
    expect(finalEvent?.event).toBe("result")
    expect(finalEvent?.isError).toBe(false)
    expect(new Set(events.map((event) => event.turnId)).size).toBe(1)
    expect(new Set(events.map((event) => event.sessionId)).size).toBe(1)

    const pending = session.pendingPermissions()
    expect(pending).toHaveLength(2)
    expect(new Set(pending.map((permission) => permission.toolName))).toEqual(new Set(["WebSearch"]))

    const messages = session.messages()
    expect(messages.some((message) => message.type === "cc" && message.content === "Find latest updates")).toBe(true)

    const summaryMessage = messages.find(
      (message) => message.type === "claude-response" && message.content.includes("Here's a quick summary")
    )
    expect(summaryMessage).toBeTruthy()
    expect(summaryMessage?.attributes?.claude?.result?.subtype).toBe("success")
  })

  test("forwards updatedPermissions when selecting a permission suggestion", async () => {
    const { session, transport } = await createStartedSession()

    transport.sendJson({
      type: "control_request",
      request_id: "req-perm-update",
      request: {
        subtype: "can_use_tool",
        tool_name: "Bash",
        input: { command: "echo hello" },
        tool_use_id: "tool-bash-update",
        permission_suggestions: [
          {
            type: "addRules",
            rules: [{ toolName: "Bash", ruleContent: "echo *" }],
            behavior: "allow",
            destination: "session",
          },
        ],
      },
    })

    transport.sentLines.length = 0
    await session.respondToPendingPermission(1)

    expect(transport.sentLines).toHaveLength(1)
    const response = JSON.parse(transport.sentLines[0].trim())
    expect(response.type).toBe("control_response")
    expect(response.response.response.behavior).toBe("allow")
    expect(response.response.response.updatedInput).toEqual({ command: "echo hello" })
    expect(response.response.response.updatedPermissions).toEqual([
      {
        type: "addRules",
        rules: [{ toolName: "Bash", ruleContent: "echo *" }],
        behavior: "allow",
        destination: "session",
      },
    ])
  })

  test("steps through ask-user-question choices and submits merged answers", async () => {
    const { session, transport } = await createStartedSession()

    transport.sendJson({
      type: "control_request",
      request_id: "req-ask-user",
      request: {
        subtype: "can_use_tool",
        tool_name: "AskUserQuestion",
        input: {
          questions: [
            {
              header: "Database",
              question: "Which database should we use?",
              options: [
                { label: "SQLite", description: "Simple local setup" },
                { label: "Postgres", description: "Shared database" },
              ],
            },
            {
              header: "Cache",
              question: "Should we add caching?",
              options: [
                { label: "Yes", description: "Add caching" },
                { label: "No", description: "Keep it simple" },
              ],
            },
          ],
        },
        tool_use_id: "tool-ask-user",
      },
    })

    transport.sentLines.length = 0
    await session.respondToPendingPermission(0)

    expect(transport.sentLines).toHaveLength(0)
    const permissionMessage = session.messages().find(
      (message) => message.attributes?.claude?.permissionRequest?.requestId === "req-ask-user"
    )
    expect(permissionMessage?.attributes?.claude?.permissionRequest?.askUserQuestion?.answers).toEqual({
      "0": "SQLite",
    })
    expect(permissionMessage?.attributes?.claude?.permissionRequest?.askUserQuestion?.activeQuestionIndex).toBe(1)

    await session.respondToPendingPermission(1)

    expect(transport.sentLines).toHaveLength(1)
    const response = JSON.parse(transport.sentLines[0].trim())
    expect(response.type).toBe("control_response")
    expect(response.response.response.behavior).toBe("allow")
    expect(response.response.response.updatedInput.answers).toEqual({
      "0": "SQLite",
      "1": "No",
    })
  })

  test("supports ask-user-question custom input and simple question input", async () => {
    const { session, transport } = await createStartedSession()

    transport.sendJson({
      type: "control_request",
      request_id: "req-ask-custom",
      request: {
        subtype: "can_use_tool",
        tool_name: "AskUserQuestion",
        input: {
          questions: [
            {
              header: "Context",
              question: "Add extra context",
              options: [{ label: "None", description: "No extra context" }],
            },
          ],
        },
        tool_use_id: "tool-ask-custom",
      },
    })

    await session.respondToPendingPermission(1)
    let permissionMessage = session.messages().find(
      (message) => message.attributes?.claude?.permissionRequest?.requestId === "req-ask-custom"
    )
    expect(permissionMessage?.attributes?.claude?.permissionRequest?.askUserQuestion?.customInputQuestionIndex).toBe(0)

    session.cancelPendingActionInput()
    permissionMessage = session.messages().find(
      (message) => message.attributes?.claude?.permissionRequest?.requestId === "req-ask-custom"
    )
    expect(permissionMessage?.attributes?.claude?.permissionRequest?.askUserQuestion?.customInputQuestionIndex).toBe(null)

    await session.respondToPendingPermission(1)
    await session.submitPendingActionInput("Custom response")

    expect(transport.sentLines).toHaveLength(1)
    let response = JSON.parse(transport.sentLines[0].trim())
    expect(response.response.response.updatedInput.answers).toEqual({
      "0": "Custom response",
    })

    transport.sentLines.length = 0
    transport.sendJson({
      type: "control_request",
      request_id: "req-simple-question",
      request: {
        subtype: "can_use_tool",
        tool_name: "AskUserQuestion",
        input: { question: "What do you want?" },
        tool_use_id: "tool-simple-question",
      },
    })

    await session.submitPendingActionInput("Ship it")

    expect(transport.sentLines).toHaveLength(1)
    response = JSON.parse(transport.sentLines[0].trim())
    expect(response.response.response.updatedInput.answers).toEqual({
      "0": "Ship it",
    })
  })

  test("keeps and renders all own Claude prompt messages in message list", async () => {
    const { session, transport } = await createStartedSession()
    const events: CapturedCcEvent[] = []
    session.onCcEvent((event) => events.push(event))

    transport.sendJson({
      type: "system",
      subtype: "init",
      session_id: "sdk-session-2",
      model: "claude-opus-4-6",
    })

    await session.sendMessage("First own Claude prompt", "alice")
    transport.sendJson({ type: "result", subtype: "success", is_error: false, result: "ok" })

    await session.sendMessage("Second own Claude prompt", "alice")
    transport.sendJson({ type: "result", subtype: "success", is_error: false, result: "ok" })

    const ownPrompts = session.messages().filter((message) => message.type === "cc" && message.username === "alice")
    expect(ownPrompts.map((message) => message.content)).toEqual([
      "First own Claude prompt",
      "Second own Claude prompt",
    ])

    testSetup = await testRender(
      () => (
        <MessageList
          messages={session.messages()}
          currentUsername="alice"
          typingUsers={[]}
          messagePaneWidth={110}
          height={16}
          isDetached={false}
        />
      ),
      { width: 140, height: 24 },
    )

    await testSetup.renderOnce()
    const frame = testSetup.captureCharFrame()
    expect(frame).toContain("First own Claude prompt")
    expect(frame).toContain("Second own Claude prompt")

    expect(events.map((event) => event.event)).toEqual([
      "question",
      "result",
      "question",
      "result",
    ])
  })
})

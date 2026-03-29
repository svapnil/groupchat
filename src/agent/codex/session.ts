// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { randomBytes, randomUUID } from "node:crypto"
import { createSignal, onCleanup } from "solid-js"
import type {
  AgentEventType,
  ClaudeResultMetadata,
  CodexContentBlock,
  CodexMessageMetadata,
  Message,
} from "../../lib/types"
import { getRuntimeCapabilities } from "../../lib/runtime-capabilities"
import { getToolOneLiner } from "./helpers"
import { AGENT_ID, CX_WIRE_TYPE } from "./codex-event-message-mutations"

type JsonRpcRequest = {
  method: string
  id: number
  params: Record<string, unknown>
}

type JsonRpcNotification = {
  method: string
  params: Record<string, unknown>
}

type JsonRpcResponse = {
  id: number
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse

type CodexItem = {
  type: string
  id: string
  [key: string]: unknown
}

type CodexAgentMessageItem = CodexItem & {
  type: "agentMessage"
  text?: string
}

type CodexCommandExecutionItem = CodexItem & {
  type: "commandExecution"
  command: string | string[]
  status: "inProgress" | "completed" | "failed" | "declined"
  exitCode?: number
  durationMs?: number
  stdout?: string
  stderr?: string
}

type CodexFileChangeItem = CodexItem & {
  type: "fileChange"
  changes?: Array<{ path?: string; kind?: unknown }>
  status: "inProgress" | "completed" | "failed" | "declined"
}

type CodexMcpToolCallItem = CodexItem & {
  type: "mcpToolCall"
  server: string
  tool: string
  status: "inProgress" | "completed" | "failed"
  arguments?: Record<string, unknown>
  result?: string
  error?: string
}

type CodexWebSearchItem = CodexItem & {
  type: "webSearch"
  query?: string
  action?: { type: string; url?: string; pattern?: string }
}

type CodexReasoningItem = CodexItem & {
  type: "reasoning"
  summary?: string
  content?: string
}

type CodexCollabAgentToolCallItem = CodexItem & {
  type: "collabAgentToolCall"
  tool: string
  status: "inProgress" | "completed" | "failed"
  senderThreadId?: string
  receiverThreadIds?: string[]
  prompt?: string | null
}

type PlanTodo = {
  content: string
  status: "pending" | "in_progress" | "completed"
  activeForm?: string
}

export type CxBroadcast = {
  agentId: typeof AGENT_ID
  wireType: typeof CX_WIRE_TYPE
  turnId: string
  sessionId?: string
  event: AgentEventType
  content: string
  toolName?: string
  toolUseId?: string
  isError?: boolean
  outputTokens?: number
  elapsedSeconds?: number
  stopReason?: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function nowIso() {
  return new Date().toISOString()
}

function generateUuidV7(): string {
  const bytes = randomBytes(16)
  const timestampMs = BigInt(Date.now())

  bytes[0] = Number((timestampMs >> 40n) & 0xffn)
  bytes[1] = Number((timestampMs >> 32n) & 0xffn)
  bytes[2] = Number((timestampMs >> 24n) & 0xffn)
  bytes[3] = Number((timestampMs >> 16n) & 0xffn)
  bytes[4] = Number((timestampMs >> 8n) & 0xffn)
  bytes[5] = Number(timestampMs & 0xffn)
  bytes[6] = (bytes[6] & 0x0f) | 0x70
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const hex = bytes.toString("hex")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

let messageCounter = 0
function nextId(prefix: string): string {
  messageCounter += 1
  return `${prefix}-${Date.now()}-${messageCounter}`
}

function mergeStreamingText(existingText: string, nextChunk: string): string {
  if (!nextChunk) return existingText
  if (nextChunk.startsWith(existingText)) return nextChunk
  return `${existingText}${nextChunk}`
}

function appendTail(previous: string, chunk: string, maxChars = 4000): string {
  const merged = previous + chunk
  if (merged.length <= maxChars) return merged
  return merged.slice(merged.length - maxChars)
}

function extractLastNonEmptyLine(text: string): string | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  if (lines.length === 0) return null
  return lines[lines.length - 1]
}

function sanitizeProcessLine(line: string): string {
  return line.replace(/\s+/g, " ").trim()
}

function previewForLog(value: string, maxChars = 160): string {
  const normalized = sanitizeProcessLine(value)
  if (normalized.length <= maxChars) return normalized
  return `${normalized.slice(0, maxChars)}...`
}

function safeKind(kind: unknown): string {
  if (typeof kind === "string") return kind
  if (kind && typeof kind === "object" && "type" in kind) {
    const inner = (kind as Record<string, unknown>).type
    if (typeof inner === "string") return inner
  }
  return "modify"
}

function formatElapsedSeconds(seconds?: number): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) return "0.0s"
  return `${seconds.toFixed(1)}s`
}

function getToolProgressContent(toolName: string, elapsedSeconds?: number): string {
  return `${toolName} running (${formatElapsedSeconds(elapsedSeconds)})`
}

function consumeProcessStream(
  stream: ReadableStream<Uint8Array> | number | null | undefined,
  onChunk: (chunk: string) => void,
) {
  if (!stream || typeof stream === "number") return

  void (async () => {
    const reader = stream.getReader()
    const decoder = new TextDecoder()

    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        if (!value) continue
        onChunk(decoder.decode(value, { stream: true }))
      }

      const trailing = decoder.decode()
      if (trailing) onChunk(trailing)
    } catch {
      // ignore read failures during shutdown
    } finally {
      reader.releaseLock()
    }
  })()
}

class StdioJsonRpcTransport {
  private nextId = 1
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  private pendingTimers = new Map<number, ReturnType<typeof setTimeout>>()
  private notificationHandler: ((method: string, params: Record<string, unknown>) => void) | null = null
  private requestHandler: ((method: string, id: number, params: Record<string, unknown>) => void) | null = null
  private rawIncomingHandler: ((chunk: string) => void) | null = null
  private writer: WritableStreamDefaultWriter<Uint8Array>
  private connected = true
  private buffer = ""

  constructor(
    stdin: WritableStream<Uint8Array> | { write(data: Uint8Array): number },
    stdout: ReadableStream<Uint8Array>,
  ) {
    let writable: WritableStream<Uint8Array>
    if ("write" in stdin && typeof stdin.write === "function") {
      writable = new WritableStream({
        write(chunk) {
          ;(stdin as { write(data: Uint8Array): number }).write(chunk)
        },
      })
    } else {
      writable = stdin as WritableStream<Uint8Array>
    }

    this.writer = writable.getWriter()
    this.readStdout(stdout)
  }

  private async readStdout(stdout: ReadableStream<Uint8Array>) {
    const reader = stdout.getReader()
    const decoder = new TextDecoder()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        if (!chunk) continue
        this.rawIncomingHandler?.(chunk)
        this.buffer += chunk
        this.processBuffer()
      }

      const trailing = decoder.decode()
      if (trailing) {
        this.rawIncomingHandler?.(trailing)
        this.buffer += trailing
        this.processBuffer()
      }
    } finally {
      this.dispose()
      reader.releaseLock()
    }
  }

  private processBuffer() {
    const lines = this.buffer.split("\n")
    this.buffer = lines.pop() || ""

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      let msg: JsonRpcMessage
      try {
        msg = JSON.parse(trimmed)
      } catch {
        continue
      }

      this.dispatch(msg)
    }
  }

  private dispatch(msg: JsonRpcMessage) {
    if ("id" in msg && msg.id !== undefined) {
      if ("method" in msg && msg.method) {
        this.requestHandler?.(msg.method, msg.id as number, (msg as JsonRpcRequest).params || {})
        return
      }

      const pending = this.pending.get(msg.id as number)
      if (!pending) return

      this.pending.delete(msg.id as number)
      const timer = this.pendingTimers.get(msg.id as number)
      if (timer) {
        clearTimeout(timer)
        this.pendingTimers.delete(msg.id as number)
      }

      const response = msg as JsonRpcResponse
      if (response.error) {
        const rpcError = new Error(response.error.message)
        ;(rpcError as unknown as Record<string, unknown>).code = response.error.code
        pending.reject(rpcError)
      } else {
        pending.resolve(response.result)
      }
      return
    }

    if ("method" in msg) {
      this.notificationHandler?.(msg.method, (msg as JsonRpcNotification).params || {})
    }
  }

  async call(method: string, params: Record<string, unknown> = {}, timeoutMs = 60_000): Promise<unknown> {
    if (!this.connected) {
      throw new Error("Transport closed")
    }

    const id = this.nextId++
    return new Promise(async (resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        this.pendingTimers.delete(id)
        reject(new Error(`RPC timeout: ${method}`))
      }, timeoutMs)

      this.pending.set(id, { resolve, reject })
      this.pendingTimers.set(id, timer)

      try {
        await this.writer.write(new TextEncoder().encode(`${JSON.stringify({ method, id, params })}\n`))
      } catch (error) {
        clearTimeout(timer)
        this.pending.delete(id)
        this.pendingTimers.delete(id)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  async notify(method: string, params: Record<string, unknown> = {}) {
    if (!this.connected) throw new Error("Transport closed")
    await this.writer.write(new TextEncoder().encode(`${JSON.stringify({ method, params })}\n`))
  }

  async respond(id: number, result: unknown) {
    if (!this.connected) throw new Error("Transport closed")
    await this.writer.write(new TextEncoder().encode(`${JSON.stringify({ id, result })}\n`))
  }

  onNotification(handler: (method: string, params: Record<string, unknown>) => void) {
    this.notificationHandler = handler
  }

  onRequest(handler: (method: string, id: number, params: Record<string, unknown>) => void) {
    this.requestHandler = handler
  }

  onRawIncoming(handler: (chunk: string) => void) {
    this.rawIncomingHandler = handler
  }

  isConnected() {
    return this.connected
  }

  dispose() {
    if (!this.connected) return
    this.connected = false
    for (const [, timer] of this.pendingTimers) {
      clearTimeout(timer)
    }
    this.pendingTimers.clear()
    for (const [, { reject }] of this.pending) {
      reject(new Error("Transport closed"))
    }
    this.pending.clear()
  }
}

function buildWorkspaceWriteSandboxPolicy(cwd: string) {
  return {
    type: "workspaceWrite" as const,
    writableRoots: [cwd],
    readOnlyAccess: { type: "fullAccess" as const },
    networkAccess: true,
    excludeTmpdirEnvVar: false,
    excludeSlashTmp: false,
  }
}

export const createCodexSession = () => {
  const [isActive, setIsActive] = createSignal(false)
  const [isConnecting, setIsConnecting] = createSignal(false)
  const [messages, setMessages] = createSignal<Message[]>([])
  const [lastError, setLastError] = createSignal<string | null>(null)

  let codexProcess: Bun.Subprocess | null = null
  let transport: StdioJsonRpcTransport | null = null
  let isTearingDown = false
  let threadId: string | null = null
  let currentTurnId: string | null = null
  let currentRpcTurnId: string | null = null
  let streamingMessageId: string | null = null
  let thinkingMessageId: string | null = null
  let liveThinkingText = ""
  let liveStreamingText = ""
  let latestOutputTokens: number | undefined
  let latestStopReason: string | null = null
  let processStdoutTail = ""
  let processStderrTail = ""

  const reasoningTextByItemId = new Map<string, string>()
  const commandStartTimes = new Map<string, number>()
  const emittedToolCallIds = new Set<string>()
  const planDeltaByTurnId = new Map<string, string>()
  const planUpdateCountByTurnId = new Map<string, number>()
  const parentToolUseByThreadId = new Map<string, string>()
  const cxEventCallbacks = new Set<(event: CxBroadcast) => void>()

  const appendMessage = (message: Message) => {
    setMessages((prev) => [...prev, message])
  }

  const appendSystemMessage = (content: string) => {
    appendMessage({
      id: nextId("codex-system"),
      username: "system",
      content,
      timestamp: nowIso(),
      type: "system",
    })
  }

  const emitCxEvent = (event: Omit<CxBroadcast, "agentId" | "wireType" | "turnId">) => {
    if (!currentTurnId) return
    const payload: CxBroadcast = {
      agentId: AGENT_ID,
      wireType: CX_WIRE_TYPE,
      turnId: currentTurnId,
      sessionId: threadId || undefined,
      ...event,
    }

    cxEventCallbacks.forEach((callback) => {
      try {
        callback(payload)
      } catch {
        // ignore event callback failures
      }
    })
  }

  const emitToolCallEvent = (toolName: string, toolUseId: string, input: Record<string, unknown>) => {
    if (emittedToolCallIds.has(toolUseId)) return
    emittedToolCallIds.add(toolUseId)
    emitCxEvent({
      event: "tool_call",
      toolName,
      toolUseId,
      content: getToolOneLiner(toolName, [{ id: toolUseId, input }]),
      outputTokens: latestOutputTokens,
      stopReason: latestStopReason,
    })
  }

  const appendCodexResponse = (input: {
    id?: string
    content: string
    contentBlocks: CodexContentBlock[]
    parentToolUseId: string | null
    model?: string
    stopReason?: string | null
    streaming?: boolean
    thinking?: boolean
    interrupted?: boolean
    outputTokens?: number
    eventType?: CodexMessageMetadata["eventType"]
    result?: ClaudeResultMetadata
  }): string => {
    const messageId = input.id || nextId("codex-response")
    appendMessage({
      id: messageId,
      username: "codex",
      content: input.content,
      timestamp: nowIso(),
      type: "codex-response",
      attributes: {
        codex: {
          parentToolUseId: input.parentToolUseId,
          contentBlocks: input.contentBlocks,
          model: input.model,
          stopReason: input.stopReason,
          streaming: input.streaming,
          thinking: input.thinking,
          interrupted: input.interrupted,
          outputTokens: input.outputTokens,
          eventType: input.eventType,
          result: input.result,
        } satisfies CodexMessageMetadata,
      },
    })
    return messageId
  }

  const removeThinkingMessage = () => {
    if (!thinkingMessageId) return
    const staleId = thinkingMessageId
    thinkingMessageId = null
    liveThinkingText = ""
    setMessages((prev) => prev.filter((message) => message.id !== staleId))
  }

  const removeStreamingMessage = () => {
    if (!streamingMessageId) return
    const staleId = streamingMessageId
    streamingMessageId = null
    liveStreamingText = ""
    setMessages((prev) => prev.filter((message) => message.id !== staleId))
  }

  const appendThinkingMessage = (thinking = "", parentToolUseId: string | null = null) => {
    removeThinkingMessage()
    liveThinkingText = thinking
    const id = nextId("codex-thinking")
    thinkingMessageId = id
    appendMessage({
      id,
      username: "codex",
      content: thinking,
      timestamp: nowIso(),
      type: "codex-response",
      attributes: {
        codex: {
          parentToolUseId,
          contentBlocks: thinking ? [{ type: "thinking", thinking }] : [],
          streaming: true,
          thinking: true,
          outputTokens: latestOutputTokens,
          eventType: "reasoning",
        } satisfies CodexMessageMetadata,
      },
    })
  }

  const upsertThinkingMessage = (thinkingChunk: string, parentToolUseId: string | null) => {
    liveThinkingText = mergeStreamingText(liveThinkingText, thinkingChunk)

    if (!thinkingMessageId) {
      appendThinkingMessage(liveThinkingText, parentToolUseId)
    }

    const targetId = thinkingMessageId
    if (!targetId) return

    setMessages((prev) =>
      prev.map((message) => {
        if (message.id !== targetId) return message
        return {
          ...message,
          content: liveThinkingText,
          attributes: {
            ...message.attributes,
            codex: {
              parentToolUseId,
              contentBlocks: liveThinkingText ? [{ type: "thinking", thinking: liveThinkingText }] : [],
              streaming: true,
              thinking: true,
              outputTokens: latestOutputTokens,
              eventType: "reasoning",
            } satisfies CodexMessageMetadata,
          },
        }
      })
    )

    emitCxEvent({
      event: "thinking",
      content: liveThinkingText,
      outputTokens: latestOutputTokens,
      stopReason: latestStopReason,
    })
  }

  const finalizeThinkingMessage = () => {
    const targetId = thinkingMessageId
    if (!targetId) return
    if (!liveThinkingText.trim()) {
      removeThinkingMessage()
      return
    }

    thinkingMessageId = null
    setMessages((prev) =>
      prev.map((message) => {
        if (message.id !== targetId || !message.attributes?.codex) return message
        return {
          ...message,
          attributes: {
            ...message.attributes,
            codex: {
              ...message.attributes.codex,
              contentBlocks: [{ type: "thinking", thinking: liveThinkingText }],
              streaming: false,
              thinking: false,
              outputTokens: latestOutputTokens,
            } satisfies CodexMessageMetadata,
          },
        }
      })
    )
  }

  const upsertStreamingText = (textChunk: string, parentToolUseId: string | null) => {
    if (!textChunk) return
    liveStreamingText = mergeStreamingText(liveStreamingText, textChunk)

    if (thinkingMessageId && !liveThinkingText.trim()) {
      removeThinkingMessage()
    }

    if (!streamingMessageId) {
      const id = nextId("codex-stream")
      streamingMessageId = id
      appendMessage({
        id,
        username: "codex",
        content: liveStreamingText,
        timestamp: nowIso(),
        type: "codex-response",
        attributes: {
          codex: {
            parentToolUseId,
            contentBlocks: [{ type: "text", text: liveStreamingText }],
            streaming: true,
            outputTokens: latestOutputTokens,
            stopReason: latestStopReason,
            eventType: "stream_event",
          } satisfies CodexMessageMetadata,
        },
      })
    }

    const targetId = streamingMessageId
    if (!targetId) return

    setMessages((prev) =>
      prev.map((message) => {
        if (message.id !== targetId) return message
        return {
          ...message,
          content: liveStreamingText,
          attributes: {
            ...message.attributes,
            codex: {
              parentToolUseId,
              contentBlocks: [{ type: "text", text: liveStreamingText }],
              streaming: true,
              outputTokens: latestOutputTokens,
              stopReason: latestStopReason,
              eventType: "stream_event",
            } satisfies CodexMessageMetadata,
          },
        }
      })
    )

    emitCxEvent({
      event: "text_stream",
      content: liveStreamingText,
      outputTokens: latestOutputTokens,
      stopReason: latestStopReason,
    })
  }

  const finalizeStreamingMessage = () => {
    const targetId = streamingMessageId
    if (!targetId) return false

    streamingMessageId = null
    setMessages((prev) =>
      prev.map((message) => {
        if (message.id !== targetId || !message.attributes?.codex) return message
        return {
          ...message,
          attributes: {
            ...message.attributes,
            codex: {
              ...message.attributes.codex,
              contentBlocks: liveStreamingText ? [{ type: "text", text: liveStreamingText }] : [],
              streaming: false,
              outputTokens: latestOutputTokens,
              stopReason: latestStopReason,
            } satisfies CodexMessageMetadata,
          },
        }
      })
    )

    if (liveStreamingText.trim().length > 0) {
      emitCxEvent({
        event: "text",
        content: liveStreamingText,
        outputTokens: latestOutputTokens,
        stopReason: latestStopReason,
      })
    }

    liveStreamingText = ""
    return true
  }

  const attachResultToLatestCodexMessage = (result: ClaudeResultMetadata): boolean => {
    let attached = false

    setMessages((prev) => {
      let targetId: string | null = null

      for (let i = prev.length - 1; i >= 0; i -= 1) {
        const message = prev[i]
        if (message.type !== "codex-response") continue

        const metadata = message.attributes?.codex
        if (!metadata || metadata.result || metadata.interrupted) continue
        if (metadata.thinking || metadata.streaming) continue

        targetId = message.id
        break
      }

      if (!targetId) return prev
      attached = true

      return prev.map((message) => {
        if (message.id !== targetId || !message.attributes?.codex) return message
        return {
          ...message,
          attributes: {
            ...message.attributes,
            codex: {
              ...message.attributes.codex,
              result,
            } satisfies CodexMessageMetadata,
          },
        }
      })
    })

    return attached
  }

  const updateActiveMessageOutputTokens = () => {
    setMessages((prev) =>
      prev.map((message) => {
        if (!message.attributes?.codex) return message
        if (message.id !== thinkingMessageId && message.id !== streamingMessageId) return message
        return {
          ...message,
          attributes: {
            ...message.attributes,
            codex: {
              ...message.attributes.codex,
              outputTokens: latestOutputTokens,
              stopReason: latestStopReason,
            } satisfies CodexMessageMetadata,
          },
        }
      })
    )
  }

  const appendToolUse = (
    toolUseId: string,
    toolName: string,
    input: Record<string, unknown>,
    parentToolUseId: string | null = null,
  ) => {
    emitToolCallEvent(toolName, toolUseId, input)
    appendCodexResponse({
      id: nextId(`codex-tool-${toolUseId}`),
      content: "",
      contentBlocks: [{ type: "tool_use", id: toolUseId, name: toolName, input }],
      parentToolUseId,
      outputTokens: latestOutputTokens,
      eventType: "tool_use",
    })
  }

  const ensureToolUseEmitted = (
    toolUseId: string,
    toolName: string,
    input: Record<string, unknown>,
    parentToolUseId: string | null = null,
  ) => {
    if (emittedToolCallIds.has(toolUseId)) return
    appendToolUse(toolUseId, toolName, input, parentToolUseId)
  }

  const appendToolResult = (
    toolUseId: string,
    content: string,
    isError: boolean,
    parentToolUseId: string | null = null,
  ) => {
    appendCodexResponse({
      id: nextId(`codex-result-${toolUseId}`),
      content,
      contentBlocks: [{ type: "tool_result", tool_use_id: toolUseId, content, is_error: isError }],
      parentToolUseId,
      outputTokens: latestOutputTokens,
      eventType: "tool_result",
    })
    emitCxEvent({
      event: "tool_result",
      toolUseId,
      isError,
      content,
      outputTokens: latestOutputTokens,
      stopReason: latestStopReason,
    })
  }

  const appendAssistantText = (content: string, parentToolUseId: string | null = null) => {
    appendCodexResponse({
      content,
      contentBlocks: [{ type: "text", text: content }],
      parentToolUseId,
      outputTokens: latestOutputTokens,
      eventType: "assistant",
    })
  }

  const getParentToolUseIdForThread = (eventThreadId?: string) => {
    if (!eventThreadId) return null
    return parentToolUseByThreadId.get(eventThreadId) || null
  }

  const setSubagentThreadMappings = (parentToolUseId: string, collab: CodexCollabAgentToolCallItem) => {
    const receiverThreadIds = Array.isArray(collab.receiverThreadIds) ? collab.receiverThreadIds : []
    for (const receiverThreadId of receiverThreadIds) {
      if (typeof receiverThreadId === "string" && receiverThreadId.length > 0) {
        parentToolUseByThreadId.set(receiverThreadId, parentToolUseId)
      }
    }
  }

  const clearSubagentThreadMappings = (collab: CodexCollabAgentToolCallItem) => {
    const receiverThreadIds = Array.isArray(collab.receiverThreadIds) ? collab.receiverThreadIds : []
    for (const receiverThreadId of receiverThreadIds) {
      if (typeof receiverThreadId === "string" && receiverThreadId.length > 0) {
        parentToolUseByThreadId.delete(receiverThreadId)
      }
    }
  }

  const summarizeCollabCall = (collab: CodexCollabAgentToolCallItem): string => {
    const receiverCount = Array.isArray(collab.receiverThreadIds)
      ? collab.receiverThreadIds.filter((id): id is string => typeof id === "string" && id.length > 0).length
      : 0
    const statusText = collab.status === "completed"
      ? "completed"
      : collab.status === "failed"
        ? "failed"
        : "running"
    const tool = collab.tool || "collab"
    const count = receiverCount || 1
    return `${tool} ${statusText} for ${count} agent${count === 1 ? "" : "s"}`
  }

  const handleReasoningDelta = (params: Record<string, unknown>) => {
    const itemId = typeof params.itemId === "string" ? params.itemId : null
    if (!itemId) return

    if (!reasoningTextByItemId.has(itemId)) {
      reasoningTextByItemId.set(itemId, "")
    }

    const delta = typeof params.delta === "string" ? params.delta : null
    if (!delta) return

    const current = reasoningTextByItemId.get(itemId) || ""
    const next = current + delta
    reasoningTextByItemId.set(itemId, next)
    upsertThinkingMessage(next, null)
  }

  const handlePlanDelta = (params: Record<string, unknown>) => {
    const turnId = typeof params.turnId === "string" ? params.turnId : null
    const delta = typeof params.delta === "string" ? params.delta : null
    if (!turnId || !delta) return
    const current = planDeltaByTurnId.get(turnId) || ""
    planDeltaByTurnId.set(turnId, current + delta)
  }

  const firstString = (obj: Record<string, unknown>, keys: string[]): string | null => {
    for (const key of keys) {
      const value = obj[key]
      if (typeof value === "string" && value.trim()) {
        return value.trim()
      }
    }
    return null
  }

  const normalizePlanStatus = (statusRaw: string | null): "pending" | "in_progress" | "completed" => {
    const status = (statusRaw || "").toLowerCase()
    if (["completed", "done", "complete", "success", "succeeded"].includes(status)) {
      return "completed"
    }
    if (["in_progress", "inprogress", "active", "running", "current"].includes(status)) {
      return "in_progress"
    }
    return "pending"
  }

  const extractPlanTodosFromMarkdown = (markdown: string): PlanTodo[] => {
    const todos: PlanTodo[] = []
    for (const rawLine of markdown.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line) continue

      let match = line.match(/^[-*]\s+\[(x|X|~|>| )\]\s+(.+)$/)
      if (match) {
        const marker = match[1].toLowerCase()
        const status = marker === "x" ? "completed" : (marker === "~" || marker === ">") ? "in_progress" : "pending"
        todos.push({ content: match[2].trim(), status })
        continue
      }

      match = line.match(/^[-*]\s+(.+)$/)
      if (match) {
        todos.push({ content: match[1].trim(), status: "pending" })
        continue
      }

      match = line.match(/^\d+\.\s+(.+)$/)
      if (match) {
        todos.push({ content: match[1].trim(), status: "pending" })
      }
    }
    return todos
  }

  const extractPlanTodosFromUnknown = (input: unknown): PlanTodo[] => {
    if (typeof input === "string") {
      return extractPlanTodosFromMarkdown(input)
    }

    if (!input || typeof input !== "object") {
      return []
    }

    const obj = input as Record<string, unknown>
    const stepArrayCandidates = [
      obj.steps,
      obj.items,
      obj.planSteps,
      (obj.plan as Record<string, unknown> | undefined)?.steps,
      (obj.plan as Record<string, unknown> | undefined)?.items,
    ]

    for (const candidate of stepArrayCandidates) {
      if (!Array.isArray(candidate)) continue
      const todos: PlanTodo[] = []
      for (const step of candidate) {
        if (typeof step === "string") {
          const trimmed = step.trim()
          if (trimmed) todos.push({ content: trimmed, status: "pending" })
          continue
        }
        if (!step || typeof step !== "object") continue
        const stepObj = step as Record<string, unknown>
        const content = firstString(stepObj, ["content", "text", "title", "description", "step", "name"])
        if (!content) continue
        const status = normalizePlanStatus(firstString(stepObj, ["status", "state", "phase"]))
        const activeForm = firstString(stepObj, ["activeForm", "active_form", "inProgressText", "in_progress_text"])
        todos.push({
          content,
          status,
          ...(activeForm ? { activeForm } : {}),
        })
      }
      if (todos.length > 0) return todos
    }

    const markdown = firstString(obj, ["markdown", "text", "content"])
    if (markdown) {
      return extractPlanTodosFromMarkdown(markdown)
    }

    return []
  }

  const extractPlanTodos = (params: Record<string, unknown>, turnId: string): PlanTodo[] => {
    const directPlan = params.plan
    const turnObj = params.turn as Record<string, unknown> | undefined
    const nestedPlan = turnObj?.plan

    const fromPlanObject = extractPlanTodosFromUnknown(directPlan !== undefined ? directPlan : nestedPlan)
    if (fromPlanObject.length > 0) return fromPlanObject

    const fallbackDelta = planDeltaByTurnId.get(turnId)
    if (!fallbackDelta) return []
    return extractPlanTodosFromMarkdown(fallbackDelta)
  }

  const handleTurnPlanUpdated = (params: Record<string, unknown>) => {
    const turnObj = params.turn as Record<string, unknown> | undefined
    const turnId = typeof params.turnId === "string"
      ? params.turnId
      : (typeof turnObj?.id === "string" ? turnObj.id : currentRpcTurnId)
    if (!turnId) return

    const todos = extractPlanTodos(params, turnId)
    if (todos.length === 0) return

    const nextCount = (planUpdateCountByTurnId.get(turnId) || 0) + 1
    planUpdateCountByTurnId.set(turnId, nextCount)
    const toolUseId = `codex-plan-${turnId}-${nextCount}`
    appendToolUse(toolUseId, "TodoWrite", { todos }, getParentToolUseIdForThread(typeof params.threadId === "string" ? params.threadId : undefined))
  }

  const handleCommandProgress = (toolUseId: string, toolName: string) => {
    const startTime = commandStartTimes.get(toolUseId)
    const elapsedSeconds = startTime ? Math.round((Date.now() - startTime) / 1000) : 0
    emitCxEvent({
      event: "tool_progress",
      toolUseId,
      toolName,
      content: getToolProgressContent(toolName, elapsedSeconds),
      elapsedSeconds,
      outputTokens: latestOutputTokens,
      stopReason: latestStopReason,
    })
  }

  const handleItemStarted = (params: Record<string, unknown>) => {
    const item = params.item as CodexItem | undefined
    if (!item) return
    const eventThreadId = typeof params.threadId === "string" ? params.threadId : undefined
    const parentToolUseId = getParentToolUseIdForThread(eventThreadId)

    switch (item.type) {
      case "agentMessage":
        liveStreamingText = ""
        streamingMessageId = null
        break

      case "commandExecution": {
        const command = item as CodexCommandExecutionItem
        const commandStr = Array.isArray(command.command) ? command.command.join(" ") : command.command || ""
        commandStartTimes.set(item.id, Date.now())
        appendToolUse(item.id, "Bash", { command: commandStr }, parentToolUseId)
        break
      }

      case "fileChange": {
        const fileChange = item as CodexFileChangeItem
        const changes = fileChange.changes || []
        const firstChange = changes[0]
        const toolName = safeKind(firstChange?.kind) === "create" ? "Write" : "Edit"
        appendToolUse(item.id, toolName, {
          file_path: firstChange?.path || "",
          changes: changes.map((change) => ({ path: change.path, kind: safeKind(change.kind) })),
        }, parentToolUseId)
        break
      }

      case "mcpToolCall": {
        const mcp = item as CodexMcpToolCallItem
        appendToolUse(item.id, `mcp:${mcp.server}:${mcp.tool}`, mcp.arguments || {}, parentToolUseId)
        break
      }

      case "webSearch": {
        const webSearch = item as CodexWebSearchItem
        appendToolUse(item.id, "WebSearch", { query: webSearch.query || "" }, parentToolUseId)
        break
      }

      case "reasoning": {
        const reasoning = item as CodexReasoningItem
        const initialThinking = typeof reasoning.summary === "string"
          ? reasoning.summary
          : typeof reasoning.content === "string"
            ? reasoning.content
            : ""
        reasoningTextByItemId.set(item.id, initialThinking)
        if (initialThinking) {
          upsertThinkingMessage(initialThinking, null)
        }
        break
      }

      case "collabAgentToolCall": {
        const collab = item as CodexCollabAgentToolCallItem
        const receiverThreadIds = Array.isArray(collab.receiverThreadIds)
          ? collab.receiverThreadIds.filter((id): id is string => typeof id === "string" && id.length > 0)
          : []
        const prompt = typeof collab.prompt === "string" ? collab.prompt.trim() : ""
        const description = prompt || `${collab.tool || "agent"} (${receiverThreadIds.length || 1} agent${(receiverThreadIds.length || 1) === 1 ? "" : "s"})`
        appendToolUse(item.id, "Task", {
          description,
          subagent_type: collab.tool || "codex-collab",
          codex_status: collab.status,
          sender_thread_id: collab.senderThreadId || null,
          receiver_thread_ids: receiverThreadIds,
        }, parentToolUseId)
        setSubagentThreadMappings(item.id, collab)
        appendAssistantText(
          `Started ${collab.tool || "collab"} for ${receiverThreadIds.length || 1} agent${(receiverThreadIds.length || 1) === 1 ? "" : "s"}.`,
          parentToolUseId,
        )
        break
      }

      default:
        break
    }
  }

  const handleItemCompleted = (params: Record<string, unknown>) => {
    const item = params.item as CodexItem | undefined
    if (!item) return
    const eventThreadId = typeof params.threadId === "string" ? params.threadId : undefined
    const parentToolUseId = getParentToolUseIdForThread(eventThreadId)

    switch (item.type) {
      case "agentMessage": {
        const agentMessage = item as CodexAgentMessageItem
        if (!streamingMessageId && agentMessage.text) {
          upsertStreamingText(agentMessage.text, parentToolUseId)
        }
        finalizeStreamingMessage()
        break
      }

      case "commandExecution": {
        const command = item as CodexCommandExecutionItem
        const commandStr = Array.isArray(command.command) ? command.command.join(" ") : command.command || ""
        ensureToolUseEmitted(item.id, "Bash", { command: commandStr }, parentToolUseId)
        commandStartTimes.delete(item.id)

        const combinedOutput = [command.stdout || "", command.stderr || ""].filter(Boolean).join("\n").trim()
        const exitCode = typeof command.exitCode === "number" ? command.exitCode : 0
        const failed = command.status === "failed" || command.status === "declined" || exitCode !== 0

        let resultText = combinedOutput
        if (!resultText) {
          resultText = failed ? `Exit code: ${exitCode}` : "Bash completed"
        } else if (exitCode !== 0) {
          resultText = `${resultText}\nExit code: ${exitCode}`
        }
        if (typeof command.durationMs === "number" && command.durationMs >= 100) {
          const durationStr = command.durationMs >= 1000
            ? `${(command.durationMs / 1000).toFixed(1)}s`
            : `${command.durationMs}ms`
          resultText = `${resultText}\n(${durationStr})`
        }

        if (combinedOutput || failed) {
          appendToolResult(item.id, resultText, failed, parentToolUseId)
        } else {
          emitCxEvent({
            event: "tool_result",
            toolUseId: item.id,
            toolName: "Bash",
            content: resultText,
            isError: false,
            outputTokens: latestOutputTokens,
            stopReason: latestStopReason,
          })
        }
        break
      }

      case "fileChange": {
        const fileChange = item as CodexFileChangeItem
        const changes = fileChange.changes || []
        const firstChange = changes[0]
        const toolName = safeKind(firstChange?.kind) === "create" ? "Write" : "Edit"
        ensureToolUseEmitted(item.id, toolName, {
          file_path: firstChange?.path || "",
          changes: changes.map((change) => ({ path: change.path, kind: safeKind(change.kind) })),
        }, parentToolUseId)
        const summary = changes.map((change) => `${safeKind(change.kind)}: ${change.path || ""}`).join("\n") || "File changes applied"
        appendToolResult(item.id, summary, fileChange.status === "failed", parentToolUseId)
        break
      }

      case "mcpToolCall": {
        const mcp = item as CodexMcpToolCallItem
        ensureToolUseEmitted(item.id, `mcp:${mcp.server}:${mcp.tool}`, mcp.arguments || {}, parentToolUseId)
        appendToolResult(item.id, mcp.result || mcp.error || "MCP tool call completed", mcp.status === "failed", parentToolUseId)
        break
      }

      case "webSearch": {
        const webSearch = item as CodexWebSearchItem
        ensureToolUseEmitted(item.id, "WebSearch", { query: webSearch.query || "" }, parentToolUseId)
        appendToolResult(item.id, webSearch.action?.url || webSearch.query || "Web search completed", false, parentToolUseId)
        break
      }

      case "reasoning":
        finalizeThinkingMessage()
        reasoningTextByItemId.delete(item.id)
        break

      case "collabAgentToolCall": {
        const collab = item as CodexCollabAgentToolCallItem
        const receiverThreadIds = Array.isArray(collab.receiverThreadIds)
          ? collab.receiverThreadIds.filter((id): id is string => typeof id === "string" && id.length > 0)
          : []
        ensureToolUseEmitted(item.id, "Task", {
          description: (typeof collab.prompt === "string" && collab.prompt.trim())
            || `${collab.tool || "agent"} (${receiverThreadIds.length || 1} agent${(receiverThreadIds.length || 1) === 1 ? "" : "s"})`,
          subagent_type: collab.tool || "codex-collab",
          codex_status: collab.status,
          sender_thread_id: collab.senderThreadId || null,
          receiver_thread_ids: receiverThreadIds,
        }, parentToolUseId)
        const summary = summarizeCollabCall(collab)
        appendToolResult(item.id, summary, collab.status === "failed", parentToolUseId)
        appendAssistantText(summary, parentToolUseId)
        clearSubagentThreadMappings(collab)
        break
      }

      default:
        break
    }
  }

  const handleTurnCompleted = (params: Record<string, unknown>) => {
    const turn = params.turn as { id?: string; status?: string; error?: { message?: string } } | undefined
    const status = turn?.status || "completed"
    latestStopReason = status

    finalizeStreamingMessage()
    finalizeThinkingMessage()

    const resultMetadata: ClaudeResultMetadata = {
      subtype: status === "completed" ? "success" : "error_during_execution",
      isError: status !== "completed",
      numTurns: 1,
      durationMs: 0,
      totalCostUsd: 0,
    }

    const attached = attachResultToLatestCodexMessage(resultMetadata)
    if (!attached) {
      appendCodexResponse({
        content: typeof turn?.error?.message === "string" ? turn.error.message : "",
        contentBlocks: [],
        parentToolUseId: null,
        result: resultMetadata,
        eventType: "result",
      })
    }

    emitCxEvent({
      event: "result",
      content: typeof turn?.error?.message === "string"
        ? turn.error.message
        : status === "completed"
          ? "Codex finished"
          : status,
      isError: resultMetadata.isError,
      outputTokens: latestOutputTokens,
      stopReason: latestStopReason,
    })

    if (turn?.id) {
      planDeltaByTurnId.delete(turn.id)
      planUpdateCountByTurnId.delete(turn.id)
    }
    currentTurnId = null
    currentRpcTurnId = null
    latestStopReason = null
  }

  const handleTokenUsageUpdated = (params: Record<string, unknown>) => {
    const tokenUsage = isRecord(params.tokenUsage) ? params.tokenUsage : null
    const last = tokenUsage && isRecord(tokenUsage.last) ? tokenUsage.last : null
    if (last && typeof last.outputTokens === "number") {
      latestOutputTokens = last.outputTokens
      updateActiveMessageOutputTokens()
    }
  }

  const handleNotification = (method: string, params: Record<string, unknown>) => {
    switch (method) {
      case "item/started":
        handleItemStarted(params)
        break
      case "item/agentMessage/delta":
        if (typeof params.delta === "string") {
          upsertStreamingText(
            params.delta,
            getParentToolUseIdForThread(typeof params.threadId === "string" ? params.threadId : undefined),
          )
        }
        break
      case "item/reasoning/textDelta":
      case "item/reasoning/delta":
      case "item/reasoning/summaryTextDelta":
      case "item/reasoning/summaryPartAdded":
        handleReasoningDelta(params)
        break
      case "item/commandExecution/outputDelta":
      case "item/commandExecution/terminalInteraction":
        if (typeof params.itemId === "string") {
          handleCommandProgress(params.itemId, "Bash")
        }
        break
      case "item/mcpToolCall/progress":
        if (typeof params.itemId === "string") {
          handleCommandProgress(params.itemId, "mcp_tool_call")
        }
        break
      case "item/plan/delta":
        handlePlanDelta(params)
        break
      case "item/completed":
        handleItemCompleted(params)
        break
      case "turn/started":
        break
      case "turn/completed":
        handleTurnCompleted(params)
        break
      case "turn/plan/updated":
        handleTurnPlanUpdated(params)
        break
      case "thread/tokenUsage/updated":
        handleTokenUsageUpdated(params)
        break
      default:
        break
    }
  }

  const handleRequest = (method: string, id: number, _params: Record<string, unknown>) => {
    appendSystemMessage(`Codex requested unsupported operation: ${method}`)
    void transport?.respond(id, { error: `Unsupported Codex request: ${method}` })
  }

  const start = async () => {
    if (isActive() || isConnecting()) return

    const runtimeCapabilities = getRuntimeCapabilities()
    if (!runtimeCapabilities.hasCodex || !runtimeCapabilities.codexPath) {
      const errorMessage = "Codex executable not found in PATH. Install Codex to use /codex."
      setLastError(errorMessage)
      appendSystemMessage(errorMessage)
      return
    }

    setIsConnecting(true)
    setLastError(null)
    threadId = null
    currentTurnId = null
    currentRpcTurnId = null
    latestOutputTokens = undefined
    latestStopReason = null
    reasoningTextByItemId.clear()
    commandStartTimes.clear()
    emittedToolCallIds.clear()
    planDeltaByTurnId.clear()
    planUpdateCountByTurnId.clear()
    parentToolUseByThreadId.clear()
    processStdoutTail = ""
    processStderrTail = ""

    try {
      codexProcess = Bun.spawn([
        runtimeCapabilities.codexPath,
        "app-server",
        "--enable",
        "multi_agent",
        "-c",
        "tools.webSearch=true",
      ], {
        cwd: process.cwd(),
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
        },
      })

      if (!codexProcess.stdin || typeof codexProcess.stdin === "number" || !codexProcess.stdout || typeof codexProcess.stdout === "number") {
        throw new Error("Codex process must expose stdio pipes")
      }

      transport = new StdioJsonRpcTransport(
        codexProcess.stdin as WritableStream<Uint8Array> | { write(data: Uint8Array): number },
        codexProcess.stdout as ReadableStream<Uint8Array>,
      )
      transport.onNotification(handleNotification)
      transport.onRequest(handleRequest)
      transport.onRawIncoming((chunk) => {
        processStdoutTail = appendTail(processStdoutTail, chunk)
      })

      consumeProcessStream(codexProcess.stderr, (chunk) => {
        processStderrTail = appendTail(processStderrTail, chunk)
      })

      codexProcess.exited.then((exitCode) => {
        if (isTearingDown) return
        const detailRaw = extractLastNonEmptyLine(processStderrTail) || extractLastNonEmptyLine(processStdoutTail)
        const detail = detailRaw ? sanitizeProcessLine(detailRaw) : null
        stop(
          detail
            ? `Codex process exited (code ${exitCode}). ${detail}`
            : `Codex process exited (code ${exitCode}).`,
        )
      })

      await transport.call("initialize", {
        clientInfo: {
          name: "groupchat",
          title: "Groupchat TUI",
          version: "0.1.10",
        },
        capabilities: {
          experimentalApi: true,
        },
      })
      await transport.notify("initialized", {})

      const threadResult = await transport.call("thread/start", {
        cwd: process.cwd(),
        approvalPolicy: "never",
        sandbox: "workspace-write",
      }) as { thread?: { id?: string } }

      threadId = typeof threadResult?.thread?.id === "string" ? threadResult.thread.id : null
      if (!threadId) {
        throw new Error("Codex did not return a thread id")
      }

      setIsActive(true)
      setIsConnecting(false)
      appendSystemMessage("Codex mode enabled. Type /exit to return to normal mode. Ctrl+C to interrupt.")
    } catch (error) {
      setLastError(error instanceof Error ? error.message : String(error))
      stop(`Failed to start Codex mode. ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const stop = (reason?: string) => {
    if (!isActive() && !isConnecting() && !codexProcess && !transport) return

    isTearingDown = true
    setIsActive(false)
    setIsConnecting(false)

    removeThinkingMessage()
    removeStreamingMessage()

    if (transport) {
      transport.dispose()
      transport = null
    }

    if (codexProcess) {
      try {
        codexProcess.kill("SIGTERM")
      } catch {
        // ignore cleanup failures
      }
      codexProcess = null
    }

    threadId = null
    currentTurnId = null
    currentRpcTurnId = null
    latestOutputTokens = undefined
    latestStopReason = null
    liveThinkingText = ""
    liveStreamingText = ""
    reasoningTextByItemId.clear()
    commandStartTimes.clear()
    emittedToolCallIds.clear()
    planDeltaByTurnId.clear()
    planUpdateCountByTurnId.clear()
    parentToolUseByThreadId.clear()
    isTearingDown = false

    if (reason) {
      appendSystemMessage(reason)
    }
  }

  const sendMessage = async (content: string, username: string) => {
    const trimmed = content.trim()
    if (!trimmed || !transport || !threadId || !isActive()) return

    try {
      liveThinkingText = ""
      liveStreamingText = ""
      latestStopReason = null
      currentTurnId = generateUuidV7()
      currentRpcTurnId = null
      emittedToolCallIds.clear()

      emitCxEvent({
        event: "question",
        content: trimmed,
      })

      appendMessage({
        id: nextId("codex-user"),
        username,
        content: trimmed,
        timestamp: nowIso(),
        type: CX_WIRE_TYPE,
      })

      appendThinkingMessage()

      const result = await transport.call("turn/start", {
        threadId,
        input: [{ type: "text", text: trimmed }],
        cwd: process.cwd(),
        approvalPolicy: "never",
        sandboxPolicy: buildWorkspaceWriteSandboxPolicy(process.cwd()),
      }) as { turn?: { id?: string } }

      currentRpcTurnId = typeof result?.turn?.id === "string" ? result.turn.id : null
    } catch (error) {
      removeThinkingMessage()
      const message = error instanceof Error ? error.message : String(error)
      setLastError(message)
      appendSystemMessage(`Failed to send message to Codex: ${message}`)
      currentTurnId = null
      currentRpcTurnId = null
    }
  }

  const interrupt = () => {
    if (!transport || !threadId || !currentRpcTurnId) return

    finalizeStreamingMessage()
    removeThinkingMessage()
    appendCodexResponse({
      content: "Interrupted",
      contentBlocks: [],
      parentToolUseId: null,
      interrupted: true,
    })

    void transport.call("turn/interrupt", {
      threadId,
      turnId: currentRpcTurnId,
    }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      appendSystemMessage(`Failed to interrupt Codex: ${previewForLog(message, 220)}`)
    })
  }

  const appendError = (message: string) => {
    appendSystemMessage(message)
  }

  const onCxEvent = (callback: (event: CxBroadcast) => void) => {
    cxEventCallbacks.add(callback)
  }

  onCleanup(() => {
    stop()
  })

  return {
    isActive,
    isConnecting,
    messages,
    lastError,
    start,
    stop,
    sendMessage,
    interrupt,
    appendError,
    onCxEvent,
  }
}

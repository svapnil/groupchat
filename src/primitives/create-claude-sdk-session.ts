import { randomUUID } from "node:crypto"
import { createSignal, onCleanup } from "solid-js"
import type { ServerWebSocket } from "bun"
import type { ClaudeContentBlock, ClaudeMessageMetadata, ClaudePermissionRequest, Message } from "../lib/types"
import { debugLog } from "../lib/debug.js"

/**
 * Claude Code control_request subtypes from companion/WEBSOCKET_PROTOCOL_REVERSED.md (section 7).
 *
 * Current implementation coverage:
 * - Incoming handled: can_use_tool
 * - Outgoing sent: interrupt
 * - All other subtypes are currently unhandled in the TUI session bridge.
 */
const KNOWN_CONTROL_REQUEST_SUBTYPES = [
  "initialize",
  "can_use_tool",
  "interrupt",
  "set_permission_mode",
  "set_model",
  "set_max_thinking_tokens",
  "mcp_status",
  "mcp_message",
  "mcp_reconnect",
  "mcp_toggle",
  "mcp_set_servers",
  "rewind_files",
  "hook_callback",
] as const

type KnownControlRequestSubtype = (typeof KNOWN_CONTROL_REQUEST_SUBTYPES)[number]

type CLISocketData = {
  kind: "cli"
  routeId: string
}

type ClaudeControlRequest = {
  type: "control_request"
  request_id: string
  request: {
    subtype: KnownControlRequestSubtype | (string & {})
    tool_name?: string
    input?: Record<string, unknown>
    description?: string
    permission_suggestions?: unknown[]
    tool_use_id?: string
    agent_id?: string
  }
}

type ClaudeControlCancelRequest = {
  type: "control_cancel_request"
  request_id: string
}

type ClaudeAssistantMessage = {
  type: "assistant"
  message?: {
    id?: string
    model?: string
    stop_reason?: string | null
    content?: unknown
  }
  parent_tool_use_id?: string | null
}

type ClaudeStreamEventMessage = {
  type: "stream_event"
  event?: unknown
  parent_tool_use_id?: string | null
}

type ClaudeStreamlinedTextMessage = {
  type: "streamlined_text"
  text?: string
}

type ClaudeStreamlinedToolUseSummaryMessage = {
  type: "streamlined_tool_use_summary"
  tool_summary?: string
}

type ClaudeResultMessage = {
  type: "result"
  subtype?: string
  is_error?: boolean
  result?: string
  errors?: string[]
  num_turns?: number
  total_cost_usd?: number
  duration_ms?: number
}

type ClaudeSystemInitMessage = {
  type: "system"
  subtype: "init"
  session_id?: string
  model?: string
}

type ClaudeAuthStatusMessage = {
  type: "auth_status"
  error?: string
}

type ClaudeToolProgressMessage = {
  type: "tool_progress"
}

type ClaudeToolSummaryMessage = {
  type: "tool_use_summary"
}

type ClaudeKeepAliveMessage = {
  type: "keep_alive"
}

type ClaudeIncomingMessage =
  | ClaudeControlRequest
  | ClaudeControlCancelRequest
  | ClaudeAssistantMessage
  | ClaudeStreamEventMessage
  | ClaudeStreamlinedTextMessage
  | ClaudeStreamlinedToolUseSummaryMessage
  | ClaudeResultMessage
  | ClaudeSystemInitMessage
  | ClaudeAuthStatusMessage
  | ClaudeToolProgressMessage
  | ClaudeToolSummaryMessage
  | ClaudeKeepAliveMessage

export type ClaudePendingPermission = {
  requestId: string
  toolName: string
  toolUseId: string
  agentId?: string
  description?: string
  input: Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function normalizeToolResultContent(value: unknown): string | ClaudeContentBlock[] {
  if (typeof value === "string") return value
  if (Array.isArray(value)) {
    return normalizeContentBlocks(value)
  }
  if (value === null || value === undefined) {
    return ""
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function normalizeContentBlocks(content: unknown): ClaudeContentBlock[] {
  if (!Array.isArray(content)) return []

  const normalized: ClaudeContentBlock[] = []

  for (const candidate of content) {
    if (!isRecord(candidate)) continue

    if (candidate.type === "text" && typeof candidate.text === "string") {
      normalized.push({ type: "text", text: candidate.text })
      continue
    }

    if (candidate.type === "thinking" && typeof candidate.thinking === "string") {
      normalized.push({
        type: "thinking",
        thinking: candidate.thinking,
        budget_tokens: typeof candidate.budget_tokens === "number" ? candidate.budget_tokens : undefined,
      })
      continue
    }

    if (
      candidate.type === "tool_use" &&
      typeof candidate.id === "string" &&
      typeof candidate.name === "string" &&
      isRecord(candidate.input)
    ) {
      normalized.push({
        type: "tool_use",
        id: candidate.id,
        name: candidate.name,
        input: candidate.input,
      })
      continue
    }

    if (candidate.type === "tool_result" && typeof candidate.tool_use_id === "string") {
      normalized.push({
        type: "tool_result",
        tool_use_id: candidate.tool_use_id,
        content: normalizeToolResultContent(candidate.content),
        is_error: typeof candidate.is_error === "boolean" ? candidate.is_error : undefined,
      })
    }
  }

  return normalized
}

function extractTextFromBlocks(blocks: ClaudeContentBlock[]): string {
  return blocks
    .map((block) => {
      if (block.type === "text") return block.text
      if (block.type === "thinking") return block.thinking
      if (block.type === "tool_result") {
        if (typeof block.content === "string") return block.content
        return ""
      }
      return ""
    })
    .filter((text) => text.length > 0)
    .join("\n")
}

function nowIso() {
  return new Date().toISOString()
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

function summarizeIncomingMessageForLog(msg: ClaudeIncomingMessage): string {
  if (msg.type === "assistant") {
    const blocks = normalizeContentBlocks(msg.message?.content)
    const text = extractTextFromBlocks(blocks)
    return [
      "type=assistant",
      `messageId=${msg.message?.id || "none"}`,
      `model=${msg.message?.model || "unknown"}`,
      `stopReason=${msg.message?.stop_reason ?? "none"}`,
      `preview="${previewForLog(text, 220)}"`,
    ].join(" ")
  }

  if (msg.type === "stream_event") {
    if (
      isRecord(msg.event) &&
      msg.event.type === "content_block_delta" &&
      isRecord(msg.event.delta) &&
      msg.event.delta.type === "text_delta" &&
      typeof msg.event.delta.text === "string"
    ) {
      return [
        "type=stream_event",
        "delta=text_delta",
        `chars=${msg.event.delta.text.length}`,
        `preview="${previewForLog(msg.event.delta.text, 140)}"`,
      ].join(" ")
    }

    const eventType = isRecord(msg.event) && typeof msg.event.type === "string" ? msg.event.type : "unknown"
    return `type=stream_event eventType=${eventType}`
  }

  if (msg.type === "streamlined_text") {
    const text = typeof msg.text === "string" ? msg.text : ""
    return `type=streamlined_text chars=${text.length} preview="${previewForLog(text, 220)}"`
  }

  if (msg.type === "streamlined_tool_use_summary") {
    const summary = typeof msg.tool_summary === "string" ? msg.tool_summary : ""
    return `type=streamlined_tool_use_summary chars=${summary.length} preview="${previewForLog(summary, 220)}"`
  }

  if (msg.type === "result") {
    return [
      "type=result",
      `subtype=${msg.subtype || "success"}`,
      `isError=${Boolean(msg.is_error)}`,
      `numTurns=${msg.num_turns ?? "n/a"}`,
      `durationMs=${msg.duration_ms ?? "n/a"}`,
      `errorPreview="${previewForLog((msg.errors || []).join(", "), 180)}"`,
    ].join(" ")
  }

  if (msg.type === "system" && msg.subtype === "init") {
    return `type=system subtype=init sessionId=${msg.session_id || "none"} model=${msg.model || "unknown"}`
  }

  if (msg.type === "auth_status") {
    return `type=auth_status error="${previewForLog(msg.error || "", 180)}"`
  }

  if (msg.type === "control_request") {
    return [
      "type=control_request",
      `requestId=${msg.request_id}`,
      `subtype=${msg.request?.subtype || "unknown"}`,
      `tool=${msg.request?.tool_name || "n/a"}`,
      `toolUseId=${msg.request?.tool_use_id || "n/a"}`,
    ].join(" ")
  }

  if (msg.type === "control_cancel_request") {
    return `type=control_cancel_request requestId=${msg.request_id}`
  }

  if (msg.type === "tool_progress" || msg.type === "tool_use_summary") {
    return `type=${msg.type}`
  }

  return `type=${msg.type}`
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
      // ignore stream read errors during process teardown
    } finally {
      reader.releaseLock()
    }
  })()
}

export const createClaudeSdkSession = () => {
  const [isActive, setIsActive] = createSignal(false)
  const [isConnecting, setIsConnecting] = createSignal(false)
  const [messages, setMessages] = createSignal<Message[]>([])
  const [pendingPermission, setPendingPermission] = createSignal<ClaudePendingPermission | null>(null)
  const [lastError, setLastError] = createSignal<string | null>(null)

  let server: Bun.Server<CLISocketData> | null = null
  let cliSocket: ServerWebSocket<CLISocketData> | null = null
  let claudeProcess: Bun.Subprocess | null = null
  let sdkSessionId = ""
  let wsBuffer = ""
  let isTearingDown = false
  let streamingMessageId: string | null = null
  let thinkingMessageId: string | null = null
  let permissionMessageId: string | null = null
  const queuedOutgoing: string[] = []
  let processStdoutTail = ""
  let processStderrTail = ""
  let streamEventChunkCount = 0
  let streamEventCharCount = 0
  let streamlinedTextChunkCount = 0
  let streamlinedTextCharCount = 0
  let stdoutChunkCount = 0
  let stderrChunkCount = 0
  let incomingStreamEventLogCount = 0
  let incomingStreamlinedTextLogCount = 0

  const log = (...args: unknown[]) => {
    debugLog("claude-sdk-session", ...args)
  }

  const resetStreamCounters = () => {
    streamEventChunkCount = 0
    streamEventCharCount = 0
    streamlinedTextChunkCount = 0
    streamlinedTextCharCount = 0
    incomingStreamEventLogCount = 0
    incomingStreamlinedTextLogCount = 0
  }

  const shouldLogIncomingPayload = (msg: ClaudeIncomingMessage): boolean => {
    if (msg.type === "keep_alive") return false
    if (msg.type === "stream_event") {
      incomingStreamEventLogCount += 1
      return incomingStreamEventLogCount <= 5 || incomingStreamEventLogCount % 25 === 0
    }
    if (msg.type === "streamlined_text") {
      incomingStreamlinedTextLogCount += 1
      return incomingStreamlinedTextLogCount <= 5 || incomingStreamlinedTextLogCount % 25 === 0
    }
    return true
  }

  const summarizeOutgoingPayload = (payload: unknown): string => {
    if (!isRecord(payload)) return `non-object payload type=${typeof payload}`
    const type = typeof payload.type === "string" ? payload.type : "unknown"

    if (type === "user" && isRecord(payload.message)) {
      const content = typeof payload.message.content === "string" ? payload.message.content : ""
      const sessionId = typeof payload.session_id === "string" ? payload.session_id : ""
      return `type=user contentChars=${content.length} hasSession=${sessionId.length > 0}`
    }

    if (type === "control_request" && isRecord(payload.request)) {
      const subtype = typeof payload.request.subtype === "string" ? payload.request.subtype : "unknown"
      const requestId = typeof payload.request_id === "string" ? payload.request_id : "unknown"
      return `type=control_request subtype=${subtype} requestId=${requestId}`
    }

    if (type === "control_response" && isRecord(payload.response)) {
      const requestId = typeof payload.response.request_id === "string" ? payload.response.request_id : "unknown"
      const response = isRecord(payload.response.response) ? payload.response.response : null
      const behavior = response && typeof response.behavior === "string" ? response.behavior : "unknown"
      return `type=control_response requestId=${requestId} behavior=${behavior}`
    }

    return `type=${type}`
  }

  const appendMessage = (message: Message) => {
    setMessages((prev) => [...prev, message])
  }

  const appendSystemMessage = (content: string) => {
    appendMessage({
      id: nextId("claude-system"),
      username: "system",
      content,
      timestamp: nowIso(),
      type: "system",
    })
  }

  const appendThinkingMessage = () => {
    log("appendThinkingMessage")
    removeThinkingMessage()
    const id = nextId("claude-thinking")
    thinkingMessageId = id
    appendMessage({
      id,
      username: "claude",
      content: "",
      timestamp: nowIso(),
      type: "claude-response",
      attributes: {
        claude: {
          parentToolUseId: null,
          contentBlocks: [],
          streaming: true,
          thinking: true,
        } satisfies ClaudeMessageMetadata,
      },
    })
  }

  const removeThinkingMessage = () => {
    if (!thinkingMessageId) return
    const staleId = thinkingMessageId
    thinkingMessageId = null
    log("removeThinkingMessage", `id=${staleId}`)
    setMessages((prev) => prev.filter((msg) => msg.id !== staleId))
  }

  const removeStreamingMessage = () => {
    if (!streamingMessageId) return
    const staleId = streamingMessageId
    streamingMessageId = null
    log("removeStreamingMessage", `id=${staleId}`)
    resetStreamCounters()
    setMessages((prev) => prev.filter((msg) => msg.id !== staleId))
  }

  const finalizeStreamingMessage = (result?: ClaudeMessageMetadata["result"]) => {
    if (!streamingMessageId) return false
    const targetId = streamingMessageId
    streamingMessageId = null
    log(
      "finalizeStreamingMessage",
      `id=${targetId}`,
      `streamEventChunks=${streamEventChunkCount}`,
      `streamEventChars=${streamEventCharCount}`,
      `streamlinedChunks=${streamlinedTextChunkCount}`,
      `streamlinedChars=${streamlinedTextCharCount}`,
      result ?? "no-result-metadata",
    )

    setMessages((prev) =>
      prev.flatMap((message) => {
        if (message.id !== targetId) return [message]
        if (message.content.trim().length === 0) return []
        if (!message.attributes?.claude) return [message]
        return [
          {
            ...message,
            attributes: {
              ...message.attributes,
              claude: {
                ...message.attributes.claude,
                streaming: false,
                result,
              } satisfies ClaudeMessageMetadata,
            },
          },
        ]
      })
    )

    resetStreamCounters()
    return true
  }

  const upsertStreamingText = (
    textChunk: string,
    parentToolUseId: string | null,
    eventType: "stream_event" | "streamlined_text",
  ) => {
    if (!textChunk) return

    if (eventType === "stream_event") {
      streamEventChunkCount += 1
      streamEventCharCount += textChunk.length
      if (streamEventChunkCount === 1 || streamEventChunkCount % 25 === 0) {
        log(
          "stream_event_chunk",
          `count=${streamEventChunkCount}`,
          `totalChars=${streamEventCharCount}`,
          `chunkChars=${textChunk.length}`,
        )
      }
    } else {
      streamlinedTextChunkCount += 1
      streamlinedTextCharCount += textChunk.length
      if (streamlinedTextChunkCount === 1 || streamlinedTextChunkCount % 25 === 0) {
        log(
          "streamlined_text_chunk",
          `count=${streamlinedTextChunkCount}`,
          `totalChars=${streamlinedTextCharCount}`,
          `chunkChars=${textChunk.length}`,
        )
      }
    }

    if (!streamingMessageId) {
      resetStreamCounters()
      if (eventType === "stream_event") {
        streamEventChunkCount = 1
        streamEventCharCount = textChunk.length
      } else {
        streamlinedTextChunkCount = 1
        streamlinedTextCharCount = textChunk.length
      }
      const id = nextId("claude-stream")
      streamingMessageId = id
      log("createStreamingMessage", `id=${id}`, `eventType=${eventType}`, `parentToolUseId=${parentToolUseId ?? "none"}`)
      appendMessage({
        id,
        username: "claude",
        content: "",
        timestamp: nowIso(),
        type: "claude-response",
        attributes: {
          claude: {
            parentToolUseId,
            contentBlocks: [{ type: "text", text: "" }],
            streaming: true,
            eventType,
          } satisfies ClaudeMessageMetadata,
        },
      })
    }

    const targetId = streamingMessageId
    if (!targetId) return

    setMessages((prev) =>
      prev.map((message) => {
        if (message.id !== targetId) return message

        const nextText = mergeStreamingText(message.content, textChunk)
        return {
          ...message,
          content: nextText,
          attributes: {
            ...message.attributes,
            claude: {
              parentToolUseId,
              contentBlocks: [{ type: "text", text: nextText }],
              streaming: true,
              eventType,
            } satisfies ClaudeMessageMetadata,
          },
        }
      })
    )
  }

  const appendClaudeResponse = (input: {
    id?: string
    content: string
    contentBlocks: ClaudeContentBlock[]
    parentToolUseId: string | null
    model?: string
    stopReason?: string | null
    streaming?: boolean
    interrupted?: boolean
    eventType?: ClaudeMessageMetadata["eventType"]
    result?: ClaudeMessageMetadata["result"]
  }) => {
    log(
      "appendClaudeResponse",
      `eventType=${input.eventType ?? "unknown"}`,
      `contentChars=${input.content.length}`,
      `streaming=${Boolean(input.streaming)}`,
      `interrupted=${Boolean(input.interrupted)}`,
      `parentToolUseId=${input.parentToolUseId ?? "none"}`,
    )
    appendMessage({
      id: input.id || nextId("claude-response"),
      username: "claude",
      content: input.content,
      timestamp: nowIso(),
      type: "claude-response",
      attributes: {
        claude: {
          parentToolUseId: input.parentToolUseId,
          contentBlocks: input.contentBlocks,
          model: input.model,
          stopReason: input.stopReason,
          streaming: input.streaming,
          interrupted: input.interrupted,
          eventType: input.eventType,
          result: input.result,
        } satisfies ClaudeMessageMetadata,
      },
    })
  }

  const appendPermissionMessage = (permission: ClaudePermissionRequest) => {
    const id = nextId("claude-permission")
    permissionMessageId = id
    log(
      "appendPermissionMessage",
      `id=${id}`,
      `requestId=${permission.requestId}`,
      `tool=${permission.toolName}`,
      `toolUseId=${permission.toolUseId}`,
    )
    appendMessage({
      id,
      username: "claude",
      content: "",
      timestamp: nowIso(),
      type: "claude-response",
      attributes: {
        claude: {
          parentToolUseId: null,
          contentBlocks: [],
          permissionRequest: permission,
        } satisfies ClaudeMessageMetadata,
      },
    })
  }

  const resolvePermissionMessage = (resolution: ClaudePermissionRequest["resolution"]) => {
    if (!permissionMessageId) return
    const targetId = permissionMessageId
    permissionMessageId = null
    log("resolvePermissionMessage", `id=${targetId}`, `resolution=${resolution}`)

    setMessages((prev) =>
      prev.map((message) => {
        if (message.id !== targetId) return message
        if (!message.attributes?.claude?.permissionRequest) return message
        return {
          ...message,
          attributes: {
            ...message.attributes,
            claude: {
              ...message.attributes.claude,
              permissionRequest: {
                ...message.attributes.claude.permissionRequest,
                resolution,
              },
            },
          },
        }
      })
    )
  }

  const sendLineToClaude = (line: string) => {
    if (!cliSocket) {
      queuedOutgoing.push(line)
      log("queueOutgoingLine", `reason=no_socket`, `queued=${queuedOutgoing.length}`)
      return
    }

    try {
      cliSocket.send(`${line}\n`)
      log("sendLineToClaude", `bytes=${line.length}`)
    } catch {
      queuedOutgoing.push(line)
      log("queueOutgoingLine", `reason=send_error`, `queued=${queuedOutgoing.length}`)
      stop("Claude socket write failed. Exiting Claude mode.")
    }
  }

  const sendToClaude = (payload: unknown) => {
    log("sendToClaude", summarizeOutgoingPayload(payload))
    sendLineToClaude(JSON.stringify(payload))
  }

  const flushQueuedMessages = () => {
    if (!cliSocket || queuedOutgoing.length === 0) return
    log("flushQueuedMessages:start", `queued=${queuedOutgoing.length}`)
    while (queuedOutgoing.length > 0) {
      const line = queuedOutgoing.shift()
      if (!line) continue
      try {
        cliSocket.send(`${line}\n`)
      } catch {
        queuedOutgoing.unshift(line)
        log("flushQueuedMessages:retry_queued", `remaining=${queuedOutgoing.length}`)
        break
      }
    }
    log("flushQueuedMessages:done", `remaining=${queuedOutgoing.length}`)
  }

  const handleIncomingMessage = (msg: ClaudeIncomingMessage) => {
    if (msg.type === "keep_alive") {
      return
    }

    if (msg.type === "system" && msg.subtype === "init") {
      sdkSessionId = typeof msg.session_id === "string" ? msg.session_id : ""
      log("incoming:system_init", `sessionId=${sdkSessionId || "none"}`, `model=${msg.model || "unknown"}`)
      return
    }

    if (msg.type === "assistant") {
      removeThinkingMessage()
      removeStreamingMessage()
      const blocks = normalizeContentBlocks(msg.message?.content)
      log(
        "incoming:assistant",
        `messageId=${msg.message?.id || "none"}`,
        `blocks=${blocks.length}`,
        `model=${msg.message?.model || "unknown"}`,
        `stopReason=${msg.message?.stop_reason ?? "none"}`,
      )
      appendClaudeResponse({
        id: msg.message?.id,
        content: extractTextFromBlocks(blocks),
        contentBlocks: blocks,
        parentToolUseId: msg.parent_tool_use_id ?? null,
        model: msg.message?.model,
        stopReason: msg.message?.stop_reason ?? null,
        eventType: "assistant",
      })
      return
    }

    if (msg.type === "stream_event") {
      removeThinkingMessage()
      if (!isRecord(msg.event)) return

      if (msg.event.type === "content_block_delta" && isRecord(msg.event.delta)) {
        if (msg.event.delta.type === "text_delta" && typeof msg.event.delta.text === "string") {
          upsertStreamingText(msg.event.delta.text, msg.parent_tool_use_id ?? null, "stream_event")
        }
      }
      return
    }

    if (msg.type === "streamlined_text") {
      removeThinkingMessage()
      if (typeof msg.text === "string") {
        upsertStreamingText(msg.text, null, "streamlined_text")
      }
      return
    }

    if (msg.type === "streamlined_tool_use_summary") {
      const summary = typeof msg.tool_summary === "string" ? msg.tool_summary.trim() : ""
      if (!summary) return
      log("incoming:streamlined_tool_use_summary", `chars=${summary.length}`, previewForLog(summary))
      appendClaudeResponse({
        content: summary,
        contentBlocks: [{ type: "text", text: summary }],
        parentToolUseId: null,
        eventType: "streamlined_tool_use_summary",
      })
      return
    }

    if (msg.type === "result") {
      removeThinkingMessage()
      const isError = Boolean(msg.is_error)
      const resultMetadata = {
        subtype: msg.subtype || "success",
        isError,
        numTurns: msg.num_turns,
        totalCostUsd: msg.total_cost_usd,
        durationMs: msg.duration_ms,
      }
      log("incoming:result", resultMetadata)

      // Try to attach result metadata to existing streaming message
      const finalized = finalizeStreamingMessage(resultMetadata)

      // Only append a new message if there was no streaming message to finalize
      // (e.g., error before streaming started)
      if (!finalized && isError) {
        const content = `Claude execution error: ${(msg.errors || []).join(", ") || "unknown error"}`
        log("incoming:result_without_streaming", previewForLog(content))
        appendClaudeResponse({
          content,
          contentBlocks: [{ type: "text", text: content }],
          parentToolUseId: null,
          result: resultMetadata,
          eventType: "result",
        })
      }
      return
    }

    if (msg.type === "auth_status" && msg.error) {
      log("incoming:auth_status_error", previewForLog(msg.error))
      appendSystemMessage(`Claude auth error: ${msg.error}`)
      return
    }

    if (msg.type === "control_request" && msg.request?.subtype === "can_use_tool") {
      if (typeof msg.request.tool_name !== "string" || !isRecord(msg.request.input) || typeof msg.request.tool_use_id !== "string") {
        log("incoming:control_request_can_use_tool_invalid", msg)
        return
      }
      removeThinkingMessage()
      finalizeStreamingMessage()
      const permission: ClaudePermissionRequest = {
        requestId: msg.request_id,
        toolName: msg.request.tool_name,
        toolUseId: msg.request.tool_use_id,
        agentId: typeof msg.request.agent_id === "string" ? msg.request.agent_id : undefined,
        description: typeof msg.request.description === "string" ? msg.request.description : undefined,
        input: msg.request.input,
      }
      log(
        "incoming:control_request_can_use_tool",
        `requestId=${permission.requestId}`,
        `tool=${permission.toolName}`,
        `toolUseId=${permission.toolUseId}`,
      )
      appendPermissionMessage(permission)
      setPendingPermission({
        requestId: permission.requestId,
        toolName: permission.toolName,
        toolUseId: permission.toolUseId,
        agentId: permission.agentId,
        description: permission.description,
        input: permission.input,
      })
      return
    }

    if (msg.type === "control_cancel_request") {
      const currentPending = pendingPermission()
      log(
        "incoming:control_cancel_request",
        `requestId=${msg.request_id}`,
        `matchesPending=${Boolean(currentPending && currentPending.requestId === msg.request_id)}`,
      )
      if (currentPending && currentPending.requestId === msg.request_id) {
        resolvePermissionMessage("cancelled")
        setPendingPermission(null)
      }
      return
    }

    if (msg.type === "tool_progress" || msg.type === "tool_use_summary") {
      // NOTE: These messages were NOT observed over stdio (--output-format stream-json).
      // They likely only appear over the WebSocket --sdk-url transport path.
      // tool_progress: heartbeat with { tool_use_id, tool_name, elapsed_time_seconds }
      // tool_use_summary: { summary: string, preceding_tool_use_ids: string[] }
      // TODO: Render these in the feed once we confirm they appear over --sdk-url.
      log(`incoming:${msg.type}`, "currently ignored")
      return
    }

    if (msg.type === "control_request") {
      const subtype = msg.request?.subtype
      log("incoming:control_request_unhandled", `requestId=${msg.request_id}`, `subtype=${subtype || "unknown"}`)
      return
    }
  }

  const handleIncomingRaw = (raw: string | Buffer) => {
    const text = typeof raw === "string" ? raw : raw.toString("utf-8")

    wsBuffer += text

    while (true) {
      const newlineIndex = wsBuffer.indexOf("\n")
      if (newlineIndex === -1) break

      const line = wsBuffer.slice(0, newlineIndex).trim()
      wsBuffer = wsBuffer.slice(newlineIndex + 1)

      if (!line) continue

      let parsed: ClaudeIncomingMessage
      try {
        parsed = JSON.parse(line) as ClaudeIncomingMessage
      } catch {
        log("incoming:parse_error", `lineChars=${line.length}`, previewForLog(line))
        continue
      }
      if (shouldLogIncomingPayload(parsed)) {
        log("incoming:payload", summarizeIncomingMessageForLog(parsed))
      }
      handleIncomingMessage(parsed)
    }
  }

  const start = async () => {
    if (isActive() || isConnecting()) {
      log("start:skip_already_running", `isActive=${isActive()}`, `isConnecting=${isConnecting()}`)
      return
    }

    setIsConnecting(true)
    setLastError(null)
    setPendingPermission(null)

    const nextRouteId = randomUUID()
    sdkSessionId = ""
    wsBuffer = ""
    queuedOutgoing.length = 0
    processStdoutTail = ""
    processStderrTail = ""
    resetStreamCounters()
    stdoutChunkCount = 0
    stderrChunkCount = 0
    log("start:begin", `routeId=${nextRouteId}`)

    try {
      server = Bun.serve<CLISocketData>({
        port: 0,
        fetch(req, serverInstance) {
          const url = new URL(req.url)
          const match = url.pathname.match(/^\/ws\/cli\/([a-f0-9-]+)$/)
          if (match && match[1] === nextRouteId) {
            const upgraded = serverInstance.upgrade(req, {
              data: { kind: "cli" as const, routeId: nextRouteId },
            })
            if (upgraded) return undefined
            log("ws_upgrade_failed", `path=${url.pathname}`)
            return new Response("WebSocket upgrade failed", { status: 400 })
          }
          return new Response("Claude SDK bridge", { status: 200 })
        },
        websocket: {
          open(ws) {
            cliSocket = ws
            setIsActive(true)
            setIsConnecting(false)
            log("websocket:open", `routeId=${nextRouteId}`)
            appendSystemMessage("Claude Code mode enabled. Type /exit to return to normal mode.")
            flushQueuedMessages()
          },
          message(_ws, raw) {
            handleIncomingRaw(raw)
          },
          close() {
            log("websocket:close", `tearingDown=${isTearingDown}`)
            cliSocket = null
            if (!isTearingDown) {
              stop("Claude websocket disconnected. Exiting Claude mode.")
            }
          },
        },
      })
      log("server:ready", `port=${server.port}`)

      const sdkUrl = `ws://127.0.0.1:${server.port}/ws/cli/${nextRouteId}`
      const args = [
        "--sdk-url", sdkUrl,
        "--print",
        "--output-format", "stream-json",
        "--input-format", "stream-json",
        "--verbose",
        "-p", "",
      ]
      log("process:spawn", `cmd=claude`, `args=${args.join(" ")}`)

      claudeProcess = Bun.spawn(["claude", ...args], {
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
        },
      })
      log("process:spawned", `pid=${claudeProcess.pid}`)

      consumeProcessStream(claudeProcess.stdout, (chunk) => {
        processStdoutTail = appendTail(processStdoutTail, chunk)
        stdoutChunkCount += 1
        if (stdoutChunkCount <= 3 || stdoutChunkCount % 25 === 0) {
          const tail = extractLastNonEmptyLine(chunk)
          log(
            "process:stdout_chunk",
            `count=${stdoutChunkCount}`,
            `chars=${chunk.length}`,
            tail ? previewForLog(tail) : "no-non-empty-line",
          )
        }
      })

      consumeProcessStream(claudeProcess.stderr, (chunk) => {
        processStderrTail = appendTail(processStderrTail, chunk)
        stderrChunkCount += 1
        if (stderrChunkCount <= 3 || stderrChunkCount % 10 === 0) {
          const tail = extractLastNonEmptyLine(chunk)
          log(
            "process:stderr_chunk",
            `count=${stderrChunkCount}`,
            `chars=${chunk.length}`,
            tail ? previewForLog(tail) : "no-non-empty-line",
          )
        }
      })

      claudeProcess.exited.then((exitCode) => {
        log("process:exited", `code=${exitCode}`, `tearingDown=${isTearingDown}`)
        if (isTearingDown) return
        if (isActive() || isConnecting()) {
          const detailRaw = extractLastNonEmptyLine(processStderrTail) || extractLastNonEmptyLine(processStdoutTail)
          const detail = detailRaw ? sanitizeProcessLine(detailRaw) : null
          stop(
            detail
              ? `Claude process exited (code ${exitCode}). Exiting Claude mode. ${detail}`
              : `Claude process exited (code ${exitCode}). Exiting Claude mode.`,
          )
        }
      })

    } catch (error) {
      log("start:error", error)
      setLastError(error instanceof Error ? error.message : String(error))
      stop("Failed to start Claude Code mode.")
    }
  }

  const stop = (reason?: string) => {
    if (!isActive() && !isConnecting() && !cliSocket && !claudeProcess && !server) return

    log(
      "stop:begin",
      `reason=${reason || "none"}`,
      `isActive=${isActive()}`,
      `isConnecting=${isConnecting()}`,
      `hasSocket=${Boolean(cliSocket)}`,
      `hasProcess=${Boolean(claudeProcess)}`,
      `hasServer=${Boolean(server)}`,
    )
    isTearingDown = true

    setIsActive(false)
    setIsConnecting(false)
    setPendingPermission(null)
    removeThinkingMessage()
    removeStreamingMessage()

    if (cliSocket) {
      try {
        cliSocket.close()
      } catch {
        // ignore cleanup errors
      }
      cliSocket = null
    }

    if (claudeProcess) {
      try {
        claudeProcess.kill("SIGTERM")
      } catch {
        // ignore cleanup errors
      }
      claudeProcess = null
    }

    if (server) {
      try {
        server.stop(true)
      } catch {
        // ignore cleanup errors
      }
      server = null
    }

    sdkSessionId = ""
    wsBuffer = ""
    queuedOutgoing.length = 0
    resetStreamCounters()
    isTearingDown = false

    if (reason) {
      appendSystemMessage(reason)
    }
    log("stop:done")
  }

  const sendMessage = async (content: string, username: string) => {
    const trimmed = content.trim()
    if (!trimmed) return
    if (!isActive() && !isConnecting()) {
      log("sendMessage:skip_not_active", `username=${username}`)
      return
    }

    try {
      log("sendMessage", `username=${username}`, `chars=${trimmed.length}`, `hasSession=${sdkSessionId.length > 0}`)
      appendMessage({
        id: nextId("claude-user"),
        username,
        content: trimmed,
        timestamp: nowIso(),
        type: "user",
      })

      appendThinkingMessage()

      sendToClaude({
        type: "user",
        message: { role: "user", content: trimmed },
        parent_tool_use_id: null,
        session_id: sdkSessionId || "",
      })
    } catch (error) {
      log("sendMessage:error", error)
      removeThinkingMessage()
      appendSystemMessage(`Failed to send message: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const respondToPendingPermission = async (behavior: "allow" | "deny") => {
    const pending = pendingPermission()
    if (!pending) {
      log("respondToPendingPermission:skip_no_pending", `behavior=${behavior}`)
      return
    }

    log(
      "respondToPendingPermission",
      `behavior=${behavior}`,
      `requestId=${pending.requestId}`,
      `tool=${pending.toolName}`,
    )

    resolvePermissionMessage(behavior === "allow" ? "allowed" : "denied")
    setPendingPermission(null)
    appendThinkingMessage()

    if (behavior === "allow") {
      sendToClaude({
        type: "control_response",
        response: {
          subtype: "success",
          request_id: pending.requestId,
          response: {
            behavior: "allow",
            updatedInput: pending.input,
          },
        },
      })
      return
    }

    sendToClaude({
      type: "control_response",
      response: {
        subtype: "success",
        request_id: pending.requestId,
        response: {
          behavior: "deny",
          message: "Denied by user",
        },
      },
    })
  }

  const interrupt = () => {
    if (!isActive() && !isConnecting()) {
      log("interrupt:skip_not_active")
      return
    }
    log("interrupt")
    removeThinkingMessage()
    finalizeStreamingMessage()
    appendClaudeResponse({
      content: "Interrupted",
      contentBlocks: [],
      parentToolUseId: null,
      interrupted: true,
    })
    sendToClaude({
      type: "control_request",
      request_id: randomUUID(),
      request: { subtype: "interrupt" },
    })
  }

  onCleanup(() => {
    log("cleanup")
    stop()
  })

  const appendError = (message: string) => {
    log("appendError", previewForLog(message))
    appendSystemMessage(message)
  }

  return {
    isActive,
    isConnecting,
    messages,
    pendingPermission,
    lastError,
    start,
    stop,
    sendMessage,
    respondToPendingPermission,
    interrupt,
    appendError,
  }
}

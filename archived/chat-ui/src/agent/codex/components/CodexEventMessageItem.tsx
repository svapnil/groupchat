// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { RGBA, SyntaxStyle } from "@opentui/core"
import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import type { CxEventMetadata, Message } from "../../../lib/types"
import { getAgentColorById, getAgentDisplayNameById } from "../../../lib/constants"
import { AGENT_ID } from "../codex-event-message-mutations"
import { truncate } from "../../../lib/utils"
import { sanitizeMessageMarkdown, sanitizePlainMessageText } from "../../../lib/content-sanitizer"
import { CodexThinkingIndicator } from "./CodexThinkingIndicator"

const COLORS = ["cyan", "magenta", "brightGreen", "brightBlue", "brightYellow", "brightMagenta"] as const
type UsernameColor = (typeof COLORS)[number]

function getUsernameColor(username: string): UsernameColor {
  let hash = 0
  for (let i = 0; i < username.length; i += 1) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash)
  }
  return COLORS[Math.abs(hash) % COLORS.length]
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
}

export type CodexEventMessageItemProps = {
  message: Message
  isOwnMessage?: boolean
  messagePaneWidth?: number
}

const VALID_CX_EVENTS = new Set([
  "question",
  "thinking",
  "tool_call",
  "tool_progress",
  "tool_result",
  "text_stream",
  "text",
  "result",
])

function normalizeCxEvent(event: CxEventMetadata): CxEventMetadata {
  return {
    turn_id: event.turn_id,
    session_id: typeof event.session_id === "string" ? event.session_id : undefined,
    event: event.event,
    tool_name: typeof event.tool_name === "string" ? event.tool_name : undefined,
    tool_use_id: typeof event.tool_use_id === "string" ? event.tool_use_id : undefined,
    is_error: typeof event.is_error === "boolean" ? event.is_error : undefined,
    output_tokens: typeof event.output_tokens === "number" ? event.output_tokens : undefined,
    elapsed_seconds: typeof event.elapsed_seconds === "number" ? event.elapsed_seconds : undefined,
    stop_reason: typeof event.stop_reason === "string" ? event.stop_reason : undefined,
  }
}

function getCxEventTimeline(message: Message): { events: CxEventMetadata[]; contents: string[] } {
  const cx = message.attributes?.cx
  if (!cx || typeof cx !== "object") {
    return { events: [], contents: [] }
  }

  const base = cx as CxEventMetadata
  if (typeof base.turn_id !== "string" || !VALID_CX_EVENTS.has(base.event)) {
    return { events: [], contents: [] }
  }

  const events = Array.isArray(base.events) && base.events.length > 0
    ? base.events
        .filter((event): event is CxEventMetadata => {
          return Boolean(event && typeof event.turn_id === "string" && VALID_CX_EVENTS.has(event.event))
        })
        .map(normalizeCxEvent)
    : [normalizeCxEvent(base)]

  const contents = Array.isArray(base.contents)
    ? base.contents.map((entry) => (typeof entry === "string" ? entry : ""))
    : [message.content ?? ""]

  while (contents.length < events.length) {
    contents.push("")
  }
  if (contents.length > events.length) {
    contents.splice(events.length)
  }

  return { events, contents }
}

function compactPreview(content: string, max = 120): string {
  const normalized = content.replace(/\s+/g, " ").trim()
  if (!normalized) return ""
  return truncate(normalized, max)
}

function formatOutputTokens(outputTokens?: number): string {
  if (typeof outputTokens !== "number" || !Number.isFinite(outputTokens) || outputTokens < 0) return ""
  return `${outputTokens} tok`
}

const markdownSyntaxStyle = SyntaxStyle.fromStyles({
  "default": {},
  "conceal": { fg: RGBA.fromHex("#666666") },
  "markup.heading": { bold: true },
  "markup.strong": { bold: true },
  "markup.italic": { italic: true },
  "markup.raw": { fg: RGBA.fromHex("#98E6B8") },
  "markup.link.label": { underline: true, fg: RGBA.fromHex("#57C7FF") },
  "markup.link.url": { dim: true, fg: RGBA.fromHex("#9AA0A6") },
  "punctuation.special": { dim: true },
  "markup.list": { dim: true },
})

export function CodexEventMessageItem(props: CodexEventMessageItemProps) {
  const safeContent = () => sanitizePlainMessageText(props.message.content)

  if (props.isOwnMessage) {
    const username = () => sanitizePlainMessageText(props.message.username)
    const usernameColor = () => getUsernameColor(username())
    const time = () => formatTime(props.message.timestamp)
    return (
      <box justifyContent="flex-start">
        <box flexDirection="column">
          <box flexDirection="row">
            <text fg="#888888">→ </text>
            <text fg={usernameColor()}>
              <strong>{username()}</strong>
            </text>
            <text fg="#888888"> {time()}</text>
          </box>
          <box paddingLeft={2}>
            <text><em>{safeContent()}</em></text>
          </box>
        </box>
      </box>
    )
  }

  const timeline = createMemo(() => getCxEventTimeline(props.message))
  const events = createMemo(() => timeline().events)
  const contents = createMemo(() => timeline().contents)
  const username = () => sanitizePlainMessageText(props.message.username)
  const usernameColor = () => getUsernameColor(username())
  const time = () => formatTime(props.message.timestamp)
  const bubbleWidth = createMemo(() => {
    const paneWidth = Math.max(20, props.messagePaneWidth ?? 80)
    return Math.max(24, Math.floor(paneWidth * 0.75))
  })
  const questionMarkdownWidth = createMemo(() => Math.max(12, bubbleWidth() - 2))
  const agentLabel = createMemo(() => sanitizePlainMessageText(getAgentDisplayNameById(AGENT_ID)))
  const agentAccentColor = createMemo(() => getAgentColorById(AGENT_ID) ?? "cyan")

  const questionIndexes = createMemo(() => {
    const indexes: number[] = []
    events().forEach((event, index) => {
      if (event.event === "question") indexes.push(index)
    })
    return indexes
  })

  const questionContents = createMemo(() => {
    return questionIndexes()
      .map((index) => contents()[index] || "")
      .filter((content) => content.trim().length > 0)
      .map((content) => sanitizePlainMessageText(content))
  })

  const latestTurnId = createMemo(() => {
    const list = events()
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const turnId = list[i].turn_id
      if (typeof turnId === "string" && turnId.length > 0) {
        return turnId
      }
    }
    return null
  })

  const currentTurnIndexes = createMemo(() => {
    const turnId = latestTurnId()
    if (!turnId) return []

    const indexes: number[] = []
    events().forEach((event, index) => {
      if (event.turn_id === turnId) indexes.push(index)
    })
    return indexes
  })

  const toolIndexes = createMemo(() => {
    return currentTurnIndexes().filter((index) => events()[index].event === "tool_call")
  })

  const latestToolDetail = createMemo(() => {
    const indexes = toolIndexes()
    if (indexes.length === 0) return ""

    const latestIndex = indexes[indexes.length - 1]
    const latestEvent = events()[latestIndex]
    const toolName = sanitizePlainMessageText(latestEvent.tool_name || "Tool")
    const toolSummary = sanitizePlainMessageText(compactPreview(contents()[latestIndex] || ""))

    if (!toolSummary) return toolName
    if (toolSummary.toLowerCase().startsWith(toolName.toLowerCase())) {
      return toolSummary
    }
    return `${toolName} ${toolSummary}`
  })

  const latestToolProgressIndex = createMemo(() => {
    const indexes = currentTurnIndexes()
    for (let i = indexes.length - 1; i >= 0; i -= 1) {
      const eventIndex = indexes[i]
      if (events()[eventIndex].event === "tool_progress") return eventIndex
    }
    return -1
  })

  const latestToolProgressDetail = createMemo(() => {
    const index = latestToolProgressIndex()
    if (index < 0) return ""
    return sanitizePlainMessageText(compactPreview(contents()[index] || ""))
  })

  const latestToolResultIndex = createMemo(() => {
    const indexes = currentTurnIndexes()
    for (let i = indexes.length - 1; i >= 0; i -= 1) {
      const eventIndex = indexes[i]
      if (events()[eventIndex].event === "tool_result") return eventIndex
    }
    return -1
  })

  const latestToolResultDetail = createMemo(() => {
    const index = latestToolResultIndex()
    if (index < 0) return ""
    return sanitizePlainMessageText(compactPreview(contents()[index] || ""))
  })

  const thinkingIndex = createMemo(() => {
    const indexes = currentTurnIndexes()
    for (let i = indexes.length - 1; i >= 0; i -= 1) {
      const eventIndex = indexes[i]
      if (events()[eventIndex].event === "thinking") return eventIndex
    }
    return -1
  })

  const thinkingPreview = createMemo(() => {
    const index = thinkingIndex()
    if (index < 0) return ""
    return sanitizePlainMessageText(compactPreview(contents()[index] || "", 160))
  })

  const visibleTextIndex = createMemo(() => {
    const indexes = currentTurnIndexes()
    for (let i = indexes.length - 1; i >= 0; i -= 1) {
      const eventIndex = indexes[i]
      const eventType = events()[eventIndex].event
      if (eventType === "text" || eventType === "text_stream") return eventIndex
    }
    return -1
  })

  const textContent = createMemo(() => {
    const index = visibleTextIndex()
    if (index < 0) return ""
    return sanitizeMessageMarkdown(contents()[index] || "", {
      hyperlinkPolicy: { enabled: true },
    })
  })

  const textIsStreaming = createMemo(() => {
    const index = visibleTextIndex()
    if (index < 0) return false
    return events()[index].event === "text_stream"
  })

  const resultIndex = createMemo(() => {
    const indexes = currentTurnIndexes()
    for (let i = indexes.length - 1; i >= 0; i -= 1) {
      const eventIndex = indexes[i]
      if (events()[eventIndex].event === "result") return eventIndex
    }
    return -1
  })

  const resultContent = createMemo(() => {
    const index = resultIndex()
    if (index < 0) return ""
    return sanitizePlainMessageText(contents()[index] || "")
  })

  const hasResult = createMemo(() => resultIndex() >= 0)
  const resultMarkdownWidth = createMemo(() => Math.max(8, questionMarkdownWidth() - (hasResult() ? 2 : 0)))
  const isError = createMemo(() => {
    const index = resultIndex()
    if (index < 0) return false
    return Boolean(events()[index].is_error)
  })

  const latestOutputTokens = createMemo(() => {
    const indexes = currentTurnIndexes()
    for (let i = indexes.length - 1; i >= 0; i -= 1) {
      const outputTokens = events()[indexes[i]].output_tokens
      if (typeof outputTokens === "number" && Number.isFinite(outputTokens)) {
        return outputTokens
      }
    }
    return undefined
  })

  const latestStopReason = createMemo(() => {
    const indexes = currentTurnIndexes()
    for (let i = indexes.length - 1; i >= 0; i -= 1) {
      const stopReason = events()[indexes[i]].stop_reason
      if (typeof stopReason === "string" && stopReason.length > 0) {
        return stopReason
      }
    }
    return undefined
  })

  const durationSeconds = createMemo(() => {
    const startedAt = new Date(props.message.timestamp).getTime()
    if (!Number.isFinite(startedAt)) return "0.0"
    const elapsedMs = Math.max(0, Date.now() - startedAt)
    return (elapsedMs / 1000).toFixed(1)
  })

  const turnCount = createMemo(() => questionIndexes().length)
  const STALE_TIMEOUT_MS = 120_000
  const [clockMs, setClockMs] = createSignal(Date.now())
  const [lastEventTime, setLastEventTime] = createSignal(clockMs())
  const isWorking = createMemo(() => !hasResult() && currentTurnIndexes().length > 0 && clockMs() - lastEventTime() < STALE_TIMEOUT_MS)
  const isStreamingActive = createMemo(() => textIsStreaming() && isWorking())
  const latestToolStatusDetail = createMemo(() => {
    const toolResult = latestToolResultDetail()
    if (toolResult) return toolResult
    const toolProgress = latestToolProgressDetail()
    if (toolProgress) return toolProgress
    return ""
  })
  const workingLabel = createMemo(() => {
    if (textContent()) return "Streaming..."
    if (thinkingPreview()) return "Reasoning..."
    if (latestToolProgressDetail()) return "Working..."
    return "Reasoning..."
  })
  const resultSummary = createMemo(() => {
    const details = [`${turnCount()} turns`, `${durationSeconds()}s`]
    const outputTokensLabel = formatOutputTokens(latestOutputTokens())
    if (outputTokensLabel) details.push(outputTokensLabel)
    return `${username()}'s ${agentLabel()} ${isError() ? "finished with error" : "finished"} (${details.join(" • ")})`
  })

  const [elapsed, setElapsed] = createSignal(0)
  const statusSummary = createMemo(() => {
    const parts = [`${elapsed()}s`]
    const outputTokensLabel = formatOutputTokens(latestOutputTokens())
    if (outputTokensLabel) parts.push(outputTokensLabel)
    const stopReason = latestStopReason()
    if (stopReason) parts.push(stopReason)
    return parts.join(" • ")
  })
  let thinkingTimer: ReturnType<typeof setInterval> | null = null
  onMount(() => {
    let prevEventCount = events().length
    thinkingTimer = setInterval(() => {
      const now = Date.now()
      setClockMs(now)
      const currentCount = events().length
      if (currentCount !== prevEventCount) {
        prevEventCount = currentCount
        setLastEventTime(now)
      }
      if (isWorking()) {
        const since = new Date(props.message.timestamp).getTime()
        setElapsed(Math.max(0, Math.floor((now - since) / 1000)))
      }
    }, 1000)
  })
  onCleanup(() => {
    if (thinkingTimer) clearInterval(thinkingTimer)
  })

  return (
    <box justifyContent="flex-end" width="100%">
      <box flexDirection="column" alignItems="flex-end">
        <Show when={questionContents().length > 0}>
          <box flexDirection="row">
            <text fg="#888888">{time()} </text>
            <text fg={usernameColor()}>
              <strong>{username()}</strong>
            </text>
            <text fg="#888888"> ←</text>
          </box>
          <box paddingLeft={2} flexDirection="column" alignItems="flex-end" width={bubbleWidth()} overflow="hidden">
            <For each={questionContents()}>
              {(question) => (
                <box width={questionMarkdownWidth()} flexDirection="row" justifyContent="flex-end">
                  <text>
                    <em>{question}</em>
                  </text>
                </box>
              )}
            </For>
          </box>
        </Show>

        <box
          paddingLeft={2}
          flexDirection="column"
          alignItems="flex-end"
          width={bubbleWidth()}
          overflow="hidden"
        >
          <Show when={toolIndexes().length > 1}>
            <text fg="#888888">{`${toolIndexes().length - 1} tools used`}</text>
          </Show>

          <Show when={latestToolDetail()}>
            <box flexDirection="row">
              <text fg="green">⏺ </text>
              <text fg="#888888" truncate flexShrink={1} minWidth={0}>
                {sanitizePlainMessageText(latestToolDetail())}
              </text>
            </box>
          </Show>

          <Show when={latestToolStatusDetail() && latestToolStatusDetail() !== latestToolDetail()}>
            <box flexDirection="row">
              <text fg="#888888">⋯ </text>
              <text fg="#888888" truncate flexShrink={1} minWidth={0}>
                {sanitizePlainMessageText(latestToolStatusDetail())}
              </text>
            </box>
          </Show>

          <Show when={thinkingPreview() && !textContent()}>
            <box flexDirection="row" justifyContent="flex-end" width={questionMarkdownWidth()}>
              <text fg={agentAccentColor()}>⋆ </text>
              <text fg="#888888" truncate flexShrink={1} minWidth={0}>
                {thinkingPreview()}
              </text>
            </box>
          </Show>

          <Show when={textContent()}>
            <box flexDirection="row" justifyContent="flex-end" width={questionMarkdownWidth()}>
              <Show when={hasResult()}>
                <text fg="#FFFFFF">⏺ </text>
              </Show>
              <box flexDirection="column" minWidth={0}>
                <markdown
                  content={textContent()}
                  syntaxStyle={markdownSyntaxStyle}
                  conceal
                  width="auto"
                  maxWidth={resultMarkdownWidth()}
                />
                <Show when={isStreamingActive()}>
                  <text fg={agentAccentColor()}>▍</text>
                </Show>
              </box>
            </box>
          </Show>

          <Show when={!textContent() && resultContent()}>
            <box flexDirection="row" justifyContent="flex-end" width={questionMarkdownWidth()}>
              <text fg={isError() ? "red" : "#888888"}>⏺ </text>
              <text fg={isError() ? "#AA6666" : "#BBBBBB"} truncate flexShrink={1} minWidth={0}>
                {resultContent()}
              </text>
            </box>
          </Show>

          <Show when={isWorking()}>
            <CodexThinkingIndicator
              label={workingLabel()}
              summary={statusSummary()}
            />
          </Show>

          <Show when={hasResult()}>
            <box flexDirection="row">
              <text fg={isError() ? "red" : "#888888"}>⏺ </text>
              <text fg={isError() ? "#AA6666" : "#888888"} truncate flexShrink={1} minWidth={0}>
                {sanitizePlainMessageText(resultSummary())}
              </text>
            </box>
          </Show>
        </box>
      </box>
    </box>
  )
}

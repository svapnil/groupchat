import { RGBA, SyntaxStyle } from "@opentui/core"
import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import type { CcEventMetadata, Message } from "../lib/types"
import { truncate } from "../lib/utils"

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

export type OtherUserClaudeMessageItemProps = {
  message: Message
  messagePaneWidth?: number
}

const VALID_CC_EVENTS = new Set(["question", "tool_call", "text", "result"])

function normalizeCcEvent(event: CcEventMetadata): CcEventMetadata {
  return {
    turn_id: event.turn_id,
    session_id: typeof event.session_id === "string" ? event.session_id : undefined,
    event: event.event,
    tool_name: typeof event.tool_name === "string" ? event.tool_name : undefined,
    is_error: typeof event.is_error === "boolean" ? event.is_error : undefined,
  }
}

function getCcEventTimeline(message: Message): { events: CcEventMetadata[]; contents: string[] } {
  const cc = message.attributes?.cc
  if (!cc || typeof cc !== "object") {
    return { events: [], contents: [] }
  }

  const base = cc as CcEventMetadata
  if (typeof base.turn_id !== "string" || !VALID_CC_EVENTS.has(base.event)) {
    return { events: [], contents: [] }
  }

  const events = Array.isArray(base.events) && base.events.length > 0
    ? base.events
        .filter((event): event is CcEventMetadata => {
          return Boolean(event && typeof event.turn_id === "string" && VALID_CC_EVENTS.has(event.event))
        })
        .map(normalizeCcEvent)
    : [normalizeCcEvent(base)]

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

const markdownSyntaxStyle = SyntaxStyle.fromStyles({
  "default": {},
  "conceal": { fg: RGBA.fromHex("#666666") },
  "markup.heading": { bold: true },
  "markup.strong": { bold: true },
  "markup.italic": { italic: true },
  "markup.raw": { fg: RGBA.fromHex("#D7BA7D") },
  "markup.link.label": { underline: true, fg: RGBA.fromHex("#57C7FF") },
  "markup.link.url": { dim: true, fg: RGBA.fromHex("#9AA0A6") },
  "punctuation.special": { dim: true },
  "markup.list": { dim: true },
})

export function OtherUserClaudeMessageItem(props: OtherUserClaudeMessageItemProps) {
  const timeline = createMemo(() => getCcEventTimeline(props.message))
  const events = createMemo(() => timeline().events)
  const contents = createMemo(() => timeline().contents)
  const username = () => props.message.username
  const usernameColor = () => getUsernameColor(username())
  const time = () => formatTime(props.message.timestamp)
  const bubbleWidth = createMemo(() => {
    const paneWidth = Math.max(20, props.messagePaneWidth ?? 80)
    return Math.max(24, Math.floor(paneWidth * 0.75))
  })
  const questionMarkdownWidth = createMemo(() => Math.max(12, bubbleWidth() - 2))

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
    const toolName = latestEvent.tool_name || "Tool"
    const toolSummary = compactPreview(contents()[latestIndex] || "")

    if (!toolSummary) return toolName
    if (toolSummary.toLowerCase().startsWith(toolName.toLowerCase())) {
      return toolSummary
    }
    return `${toolName} ${toolSummary}`
  })

  const textIndex = createMemo(() => {
    const indexes = currentTurnIndexes()
    for (let i = indexes.length - 1; i >= 0; i -= 1) {
      const eventIndex = indexes[i]
      if (events()[eventIndex].event === "text") return eventIndex
    }
    return -1
  })

  const textContent = createMemo(() => {
    const index = textIndex()
    if (index < 0) return ""
    return contents()[index] || ""
  })

  const resultIndex = createMemo(() => {
    const indexes = currentTurnIndexes()
    for (let i = indexes.length - 1; i >= 0; i -= 1) {
      const eventIndex = indexes[i]
      if (events()[eventIndex].event === "result") return eventIndex
    }
    return -1
  })

  const hasResult = createMemo(() => resultIndex() >= 0)
  const resultMarkdownWidth = createMemo(() => Math.max(8, questionMarkdownWidth() - (hasResult() ? 2 : 0)))
  const isError = createMemo(() => {
    const index = resultIndex()
    if (index < 0) return false
    return Boolean(events()[index].is_error)
  })
  const durationSeconds = createMemo(() => {
    const startedAt = new Date(props.message.timestamp).getTime()
    if (!Number.isFinite(startedAt)) return "0.0"
    const elapsedMs = Math.max(0, Date.now() - startedAt)
    return (elapsedMs / 1000).toFixed(1)
  })

  const turnCount = createMemo(() => questionIndexes().length)
  const isWorking = createMemo(() => !hasResult() && currentTurnIndexes().length > 0)

  const [elapsed, setElapsed] = createSignal(0)
  const thinkingFrames = ["⋆", "✦", "⋆", "✧", "⋆", "❉", "⋆", "❈", "⋆"]
  const [thinkingFrame, setThinkingFrame] = createSignal(0)
  let thinkingTimer: ReturnType<typeof setInterval> | null = null
  let animTimer: ReturnType<typeof setInterval> | null = null
  onMount(() => {
    thinkingTimer = setInterval(() => {
      if (isWorking()) {
        const since = new Date(props.message.timestamp).getTime()
        setElapsed(Math.max(0, Math.floor((Date.now() - since) / 1000)))
      }
    }, 1000)
    animTimer = setInterval(() => {
      if (isWorking()) {
        setThinkingFrame((f) => (f + 1) % thinkingFrames.length)
      }
    }, 300)
  })
  onCleanup(() => {
    if (thinkingTimer) clearInterval(thinkingTimer)
    if (animTimer) clearInterval(animTimer)
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
              <text fg="#888888" truncate flexShrink={1} minWidth={0}>{latestToolDetail()}</text>
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
              </box>
            </box>
          </Show>

          <Show when={isWorking()}>
            <box flexDirection="row">
              <text fg="#FFA500">{`${thinkingFrames[thinkingFrame()]} Thinking... `}</text>
              <text fg="#888888">{`(${elapsed()}s)`}</text>
            </box>
          </Show>

          <Show when={hasResult()}>
            <box flexDirection="row">
              <text fg={isError() ? "red" : "#888888"}>⏺ </text>
              <text fg={isError() ? "#AA6666" : "#888888"} truncate flexShrink={1} minWidth={0}>
                {`${username()}'s Claude ${isError() ? "finished with error" : "finished"} (${turnCount()} turns, ${durationSeconds()}s)`}
              </text>
            </box>
          </Show>
        </box>
      </box>
    </box>
  )
}

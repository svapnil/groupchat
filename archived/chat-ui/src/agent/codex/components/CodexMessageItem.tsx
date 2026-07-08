// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { RGBA, SyntaxStyle } from "@opentui/core"
import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import type { Message } from "../../../lib/types"
import {
  contentToLines,
  getCodexMetadata,
  groupClaudeBlocks,
} from "../helpers"
import { compactJson } from "../../../lib/utils"
import { sanitizeMessageMarkdown, sanitizePlainMessageText } from "../../../lib/content-sanitizer"
import { ClaudeToolGroup } from "../../claude/components/ClaudeToolDetail"
import { CodexThinkingIndicator } from "./CodexThinkingIndicator"

export type CodexMessageItemProps = {
  message: Message
  codexDepth?: number
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

export function CodexMessageItem(props: CodexMessageItemProps) {
  const codex = createMemo(() => getCodexMetadata(props.message))
  const depth = () => Math.max(0, props.codexDepth ?? 0)
  const leftPad = () => Math.min(20, depth() * 2)
  const codexResult = createMemo(() => codex()?.result)
  const isThinking = createMemo(() => Boolean(codex()?.thinking))
  const outputTokens = createMemo(() => codex()?.outputTokens)
  const outputTokensLabel = createMemo(() => {
    const count = outputTokens()
    if (typeof count !== "number" || !Number.isFinite(count) || count < 0) return ""
    return `${count} tok`
  })

  const [elapsed, setElapsed] = createSignal(0)
  let thinkingTimer: ReturnType<typeof setInterval> | null = null
  onMount(() => {
    thinkingTimer = setInterval(() => {
      if (isThinking()) {
        const since = new Date(props.message.timestamp).getTime()
        setElapsed(Math.max(0, Math.floor((Date.now() - since) / 1000)))
      }
    }, 1000)
  })
  onCleanup(() => {
    if (thinkingTimer) clearInterval(thinkingTimer)
  })

  const groupedBlocks = createMemo(() => {
    const blocks = codex()?.contentBlocks
    return blocks && blocks.length > 0
      ? groupClaudeBlocks(blocks)
      : groupClaudeBlocks([{ type: "text", text: props.message.content }])
  })

  const firstTextGroupIndex = createMemo(() => {
    const groups = groupedBlocks()
    for (let i = 0; i < groups.length; i += 1) {
      const group = groups[i]
      if (group.kind === "content" && group.block.type === "text") return i
    }
    return -1
  })

  const shouldShowResultMarker = (groupedIndex: number) => {
    const result = codexResult()
    const firstTextIndex = firstTextGroupIndex()
    const hasResult = result !== undefined
    return hasResult && !result.isError && groupedIndex === firstTextIndex
  }

  return (
    <box justifyContent="flex-start" paddingLeft={leftPad()}>
      <box flexDirection="column">
        <box flexDirection="column" paddingLeft={2}>
          <For each={groupedBlocks()}>
            {(grouped, groupedIndex) => {
              if (grouped.kind === "tool_group") {
                return <ClaudeToolGroup name={grouped.name} items={grouped.items} />
              }

              const block = grouped.block
              if (block.type === "text") {
                return (
                  <box flexDirection="row">
                    <Show when={shouldShowResultMarker(groupedIndex())}>
                      <box width={3}>
                        <text fg="#FFFFFF">⏺</text>
                      </box>
                    </Show>
                    <box flexDirection="column" flexGrow={1}>
                      <markdown
                        content={sanitizeMessageMarkdown(block.text)}
                        syntaxStyle={markdownSyntaxStyle}
                        conceal
                        streaming={Boolean(codex()?.streaming)}
                        width="100%"
                      />
                    </box>
                  </box>
                )
              }

              if (block.type === "thinking") {
                return (
                  <box flexDirection="column">
                    <text fg="cyan">[Reasoning]</text>
                    <For each={contentToLines(sanitizePlainMessageText(block.thinking))}>
                      {(line) => <text fg="#BBBBBB">{line}</text>}
                    </For>
                  </box>
                )
              }

              if (block.type === "tool_result") {
                const resultContent =
                  typeof block.content === "string"
                    ? block.content
                    : compactJson(block.content, 200)
                const resultLines = contentToLines(sanitizePlainMessageText(resultContent))
                const label = block.is_error ? "Error" : "Result"

                return (
                  <box flexDirection="column">
                    <box flexDirection="row">
                      <text fg={block.is_error ? "red" : "green"}>⏺ </text>
                      <text fg={block.is_error ? "red" : "#888888"}>{label}</text>
                    </box>
                    <For each={resultLines}>
                      {(line) => <text fg={block.is_error ? "red" : "#AAAAAA"}>{line}</text>}
                    </For>
                  </box>
                )
              }

              return null
            }}
          </For>

          <Show when={codex()?.interrupted}>
            <text fg="#888888">⎿  Interrupted</text>
          </Show>

          <Show when={codexResult()}>
            {(() => {
              const result = codexResult()!
              const parts = [result.subtype]
              if (typeof result.durationMs === "number") {
                parts.push(`${Math.max(0, Math.round(result.durationMs / 1000))}s`)
              }
              if (typeof result.numTurns === "number") {
                parts.push(`turns ${result.numTurns}`)
              }
              return (
                <text fg={result.isError ? "#AA6666" : "#888888"}>
                  {`⎿  ${sanitizePlainMessageText(parts.join(" • "))}`}
                </text>
              )
            })()}
          </Show>

          <Show when={isThinking()}>
            <CodexThinkingIndicator
              label="Reasoning..."
              summary={[`${elapsed()}s`, outputTokensLabel()].filter((part) => part.length > 0).join(" • ")}
            />
          </Show>
          <Show when={codex()?.streaming && !isThinking() && outputTokensLabel()}>
            <box flexDirection="row">
              <text fg="#888888">{outputTokensLabel()}</text>
            </box>
          </Show>
        </box>
      </box>
    </box>
  )
}

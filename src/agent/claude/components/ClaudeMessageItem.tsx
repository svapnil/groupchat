// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { RGBA, SyntaxStyle } from "@opentui/core"
import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import type { ClaudePermissionRequest, Message } from "../../../lib/types"
import { getClaudeMetadata, getPermissionOneLiner, getToolOneLiner, groupClaudeBlocks, contentToLines } from "../helpers"
import { compactJson } from "../../../lib/utils"
import { debugLog } from "../../../lib/debug"
import { sanitizeMessageMarkdown, sanitizePlainMessageText } from "../../../lib/content-sanitizer"

export type ClaudeMessageItemProps = {
  message: Message
  claudeDepth?: number
  permissionSelectedIndex?: number
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
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

export function ClaudeMessageItem(props: ClaudeMessageItemProps) {
  const time = () => formatTime(props.message.timestamp)
  const claude = createMemo(() => getClaudeMetadata(props.message))
  const depth = () => Math.max(0, props.claudeDepth ?? 0)
  const leftPad = () => Math.min(20, depth() * 2)
  const claudeResult = createMemo(() => claude()?.result)
  const isThinking = createMemo(() => Boolean(claude()?.thinking))
  const permissionReq = createMemo(() => claude()?.permissionRequest ?? null)

  const [elapsed, setElapsed] = createSignal(0)
  const thinkingFrames = ["⋆", "✦", "⋆", "✧", "⋆", "❉", "⋆", "❈", "⋆"]
  const [thinkingFrame, setThinkingFrame] = createSignal(0)
  let thinkingTimer: ReturnType<typeof setInterval> | null = null
  let animTimer: ReturnType<typeof setInterval> | null = null
  onMount(() => {
    thinkingTimer = setInterval(() => {
      if (isThinking()) {
        const since = new Date(props.message.timestamp).getTime()
        setElapsed(Math.max(0, Math.floor((Date.now() - since) / 1000)))
      }
    }, 1000)
    animTimer = setInterval(() => {
      if (isThinking()) {
        setThinkingFrame((f) => (f + 1) % thinkingFrames.length)
      }
    }, 300)
  })
  onCleanup(() => {
    if (thinkingTimer) clearInterval(thinkingTimer)
    if (animTimer) clearInterval(animTimer)
  })

  const groupedBlocks = createMemo(() => {
    const blocks = claude()?.contentBlocks
    if (blocks && blocks.length > 0) return groupClaudeBlocks(blocks)
    return groupClaudeBlocks([{ type: "text", text: props.message.content }])
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
    const result = claudeResult()
    const firstTextIndex = firstTextGroupIndex()
    const hasResult = result !== undefined
    const show = hasResult && !result.isError && groupedIndex === firstTextIndex
    return show
  }

  return (
    <box justifyContent="flex-start" paddingLeft={leftPad()}>
      <box flexDirection="column">
        <box flexDirection="column" paddingLeft={2}>
          <For each={groupedBlocks()}>
            {(grouped, groupedIndex) => {
              if (grouped.kind === "tool_group") {
                return (
                  <box flexDirection="row">
                    <text fg="green">⏺ </text>
                    <text fg="#FFFFFF">{sanitizePlainMessageText(getToolOneLiner(grouped.name, grouped.items))}</text>
                  </box>
                )
              }

              const block = grouped.block
              // Results
              if (block.type === "text") {
                return (
                  <box flexDirection="row">
                    <Show when={shouldShowResultMarker(groupedIndex())}>
                      <text fg="#FFFFFF">⏺ </text>
                    </Show>
                    <box flexDirection="column" flexGrow={1}>
                      <markdown
                        content={sanitizeMessageMarkdown(block.text)}
                        syntaxStyle={markdownSyntaxStyle}
                        conceal
                        streaming={Boolean(claude()?.streaming)}
                        width="100%"
                      />
                    </box>
                  </box>
                )
              }

              // Thinking
              if (block.type === "thinking") {
                return (
                  <box flexDirection="column">
                    <text fg="#FFA500">[Thinking]</text>
                    <For each={contentToLines(sanitizePlainMessageText(block.thinking))}>
                      {(line) => <text fg="#BBBBBB">{line}</text>}
                    </For>
                  </box>
                )
              }

              // Tool result
              if (block.type === "tool_result") {
                const resultContent =
                  typeof block.content === "string"
                    ? block.content
                    : compactJson(block.content, 200)

                return (
                  <box flexDirection="column">
                    <box flexDirection="row">
                      <text fg={block.is_error ? "red" : "green"}>⏺ </text>
                      <text fg={block.is_error ? "red" : "#888888"}>
                        {block.is_error ? "Error" : "Result"}
                      </text>
                    </box>
                    <For each={contentToLines(sanitizePlainMessageText(resultContent))}>
                      {(line) => <text fg={block.is_error ? "red" : "#AAAAAA"}>{line}</text>}
                    </For>
                  </box>
                )
              }

              return null
            }}
          </For>

          <Show when={permissionReq()}>
            {(perm: () => ClaudePermissionRequest) => {
              const resolved = () => perm().resolution
              const oneLiner = () => getPermissionOneLiner(perm())

              return (
                <box flexDirection="column">
                  <box flexDirection="row">
                    <text fg="yellow">⏺ </text>
                    <text fg="#FFFFFF">{sanitizePlainMessageText(perm().toolName)}</text>
                    <Show when={perm().description}>
                      <text fg="#888888"> — {sanitizePlainMessageText(perm().description!)}</text>
                    </Show>
                  </box>
                  <box paddingLeft={2}>
                    <text fg="#BBBBBB">{sanitizePlainMessageText(oneLiner())}</text>
                  </box>

                  <Show when={!resolved()}>
                    <box flexDirection="column" marginTop={1}>
                      <box marginLeft={2} flexDirection="row" height={1} alignItems="center">
                        <text fg={props.permissionSelectedIndex === 0 ? "#00FF00" : "white"}>
                          {props.permissionSelectedIndex === 0 ? "> " : "  "}Allow
                        </text>
                      </box>
                      <box marginLeft={2} flexDirection="row" height={1} alignItems="center">
                        <text fg={props.permissionSelectedIndex === 1 ? "#00FF00" : "white"}>
                          {props.permissionSelectedIndex === 1 ? "> " : "  "}Deny
                        </text>
                      </box>
                      <text fg="#888888" marginLeft={2}>↑/↓ select • Enter to confirm</text>
                    </box>
                  </Show>

                  <Show when={resolved() === "allowed"}>
                    <text fg="green" marginLeft={2}>Allowed</text>
                  </Show>
                  <Show when={resolved() === "denied"}>
                    <text fg="red" marginLeft={2}>Denied</text>
                  </Show>
                  <Show when={resolved() === "cancelled"}>
                    <text fg="#888888" marginLeft={2}>Cancelled by Claude</text>
                  </Show>
                </box>
              )
            }}
          </Show>

          <Show when={claude()?.interrupted}>
            <text fg="#888888">⎿  Interrupted</text>
          </Show>

          <Show when={claudeResult()}>
            {(() => {
              const r = claudeResult()!
              const duration = typeof r.durationMs === "number" ? ` • ${Math.round(r.durationMs / 1000)}s` : ""
              const turns = typeof r.numTurns === "number" ? ` • turns ${r.numTurns}` : ""
              debugLog(`[Result] ${r.subtype}${duration}${turns}`)
              return null
            })()}
          </Show>

          <Show when={isThinking()}>
            <box flexDirection="row">
              <text fg="#FFA500">{`${thinkingFrames[thinkingFrame()]} Thinking... `}</text>
              <text fg="#888888">{`(${elapsed()}s)`}</text>
            </box>
          </Show>
          <Show when={claude()?.streaming && !isThinking()}>
            <text fg="#FFA500">▍</text>
          </Show>
        </box>
      </box>
    </box>
  )
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { RGBA, SyntaxStyle } from "@opentui/core"
import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import type { ClaudePermissionRequest, Message } from "../../../lib/types"
import {
  contentToLines,
  getActiveClaudeAskUserQuestion,
  getClaudeMetadata,
  getClaudePermissionChoices,
  getToolLabel,
  isClaudeAskUserQuestionAwaitingTextInput,
  groupClaudeBlocks,
} from "../helpers"
import { compactJson } from "../../../lib/utils"
import { sanitizeMessageMarkdown, sanitizePlainMessageText } from "../../../lib/content-sanitizer"
import { ClaudeToolDetail, ClaudeToolGroup } from "./ClaudeToolDetail"

export type ClaudeMessageItemProps = {
  message: Message
  claudeDepth?: number
  permissionSelectedIndex?: number
  hiddenToolUseIds?: ReadonlySet<string>
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
  "markup.raw": { fg: RGBA.fromHex("#B0B9F9") },
  "markup.link.label": { underline: true, fg: RGBA.fromHex("#57C7FF") },
  "markup.link.url": { dim: true, fg: RGBA.fromHex("#9AA0A6") },
  "punctuation.special": { dim: true },
  "markup.list": { dim: true },
})

export function ClaudeMessageItem(props: ClaudeMessageItemProps) {
  const claude = createMemo(() => getClaudeMetadata(props.message))
  const depth = () => Math.max(0, props.claudeDepth ?? 0)
  const leftPad = () => Math.min(20, depth() * 2)
  const claudeResult = createMemo(() => claude()?.result)
  const isThinking = createMemo(() => Boolean(claude()?.thinking))
  const permissionReq = createMemo(() => claude()?.permissionRequest ?? null)
  const outputTokens = createMemo(() => claude()?.outputTokens)
  const outputTokensLabel = createMemo(() => {
    const count = outputTokens()
    if (typeof count !== "number" || !Number.isFinite(count) || count < 0) return ""
    return `${count} tok`
  })
  const hiddenToolUseIds = createMemo(() => {
    const ids = new Set(props.hiddenToolUseIds ?? [])
    const permissionToolUseId = permissionReq()?.toolUseId
    if (permissionToolUseId) ids.add(permissionToolUseId)
    return ids
  })
  const toolUseById = createMemo(() => {
    const map = new Map<string, { name: string; input: Record<string, unknown> }>()
    for (const block of claude()?.contentBlocks ?? []) {
      if (block.type === "tool_use") {
        map.set(block.id, { name: block.name, input: block.input })
      }
    }
    return map
  })

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
    const groups = blocks && blocks.length > 0
      ? groupClaudeBlocks(blocks)
      : groupClaudeBlocks([{ type: "text", text: props.message.content }])

    // Permission requests are rendered with rich tool detail separately, so hide
    // matching tool_use blocks here to avoid rendering the same code panel twice.
    const hiddenIds = hiddenToolUseIds()
    if (hiddenIds.size === 0) return groups

    return groups
      .map((group) => {
        if (group.kind !== "tool_group") return group
        const filtered = group.items.filter((item) => !hiddenIds.has(item.id))
        if (filtered.length === 0) return null
        return { ...group, items: filtered }
      })
      .filter((group): group is NonNullable<typeof group> => group !== null)
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
                return <ClaudeToolGroup name={grouped.name} items={grouped.items} />
              }

              const block = grouped.block
              // Results
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
                const linkedTool = toolUseById().get(block.tool_use_id)
                const resultLines = contentToLines(sanitizePlainMessageText(resultContent))

                if (linkedTool?.name === "Bash") {
                  const hiddenLineCount = block.is_error || resultLines.length <= 20
                    ? 0
                    : resultLines.length - 20
                  const visibleLines = hiddenLineCount > 0 ? resultLines.slice(-20) : resultLines
                  const heading = block.is_error
                    ? "Terminal Error"
                    : hiddenLineCount > 0
                      ? "Terminal Output (last 20 lines)"
                      : "Terminal Output"

                  return (
                    <box flexDirection="column">
                      <box flexDirection="row">
                        <text fg={block.is_error ? "red" : "green"}>⏺ </text>
                        <text fg={block.is_error ? "red" : "#888888"}>{heading}</text>
                      </box>
                      <For each={visibleLines}>
                        {(line) => <text fg={block.is_error ? "red" : "#AAAAAA"}>{line}</text>}
                      </For>
                      <Show when={hiddenLineCount > 0}>
                        <text fg="#888888">{`${hiddenLineCount} earlier lines omitted`}</text>
                      </Show>
                    </box>
                  )
                }

                const label = linkedTool
                  ? `${getToolLabel(linkedTool.name)} ${block.is_error ? "Error" : "Result"}`
                  : block.is_error ? "Error" : "Result"

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

          <Show when={permissionReq()}>
            {(perm: () => ClaudePermissionRequest) => {
              const resolved = () => perm().resolution
              const questionState = () => perm().askUserQuestion
              const currentQuestion = () => getActiveClaudeAskUserQuestion(perm())
              const choices = () => getClaudePermissionChoices(perm())
              const isAskUserQuestion = () => perm().toolName === "AskUserQuestion" && Boolean(questionState())
              const awaitingTextInput = () => isClaudeAskUserQuestionAwaitingTextInput(perm())
              const answeredQuestions = () => {
                const state = questionState()
                if (!state) return []
                return Object.entries(state.answers)
                  .map(([index, answer]) => {
                    const numericIndex = Number(index)
                    const question = Number.isInteger(numericIndex) ? state.questions[numericIndex] : undefined
                    if (!question) return null
                    return {
                      label: question.header || `Q${numericIndex + 1}`,
                      answer,
                    }
                  })
                  .filter((entry): entry is { label: string; answer: string } => entry !== null)
              }
              const unresolvedHelperText = () => {
                if (!isAskUserQuestion()) return "↑/↓ select • Enter to confirm"
                if (awaitingTextInput()) return "Type your answer in the input box • Esc to go back"
                const state = questionState()
                if (!state) return "↑/↓ select • Enter to continue"
                const isLast = state.activeQuestionIndex >= state.questions.length - 1
                return isLast
                  ? "↑/↓ select • Enter to submit"
                  : "↑/↓ select • Enter to continue"
              }

              return (
                <box flexDirection="column">
                  <box flexDirection="row">
                    <text fg="yellow">⏺ </text>
                    <text fg="#FFFFFF">{sanitizePlainMessageText(isAskUserQuestion() ? "Question" : getToolLabel(perm().toolName))}</text>
                    <Show when={perm().description && !isAskUserQuestion()}>
                      <text fg="#888888"> — {sanitizePlainMessageText(perm().description!)}</text>
                    </Show>
                  </box>

                  <Show when={isAskUserQuestion()}>
                    <box flexDirection="column" paddingLeft={2}>
                      <For each={answeredQuestions()}>
                        {(entry) => (
                          <text fg="#888888">{`${sanitizePlainMessageText(entry.label)}: ${sanitizePlainMessageText(entry.answer)}`}</text>
                        )}
                      </For>
                      <Show when={currentQuestion()}>
                        <box flexDirection="column" marginTop={answeredQuestions().length > 0 ? 1 : 0}>
                          <Show when={currentQuestion()?.header}>
                            <text fg="#57C7FF">{sanitizePlainMessageText(currentQuestion()!.header!)}</text>
                          </Show>
                          <markdown
                            content={sanitizeMessageMarkdown(currentQuestion()!.question)}
                            syntaxStyle={markdownSyntaxStyle}
                            conceal
                            width="100%"
                          />
                          <Show when={awaitingTextInput()}>
                            <text fg="#888888">Type your answer in the input box below. Press Esc to go back.</text>
                          </Show>
                        </box>
                      </Show>
                    </box>
                  </Show>

                  <Show when={!isAskUserQuestion()}>
                    <box paddingLeft={2}>
                      <ClaudeToolDetail name={perm().toolName} input={perm().input} showHeader={false} />
                    </box>
                  </Show>

                  <Show when={!resolved() && choices().length > 0}>
                    <box flexDirection="column" marginTop={1}>
                      <For each={choices()}>
                        {(choice, choiceIndex) => (
                          <box marginLeft={2} flexDirection="column" marginTop={choiceIndex() === 0 ? 0 : 1}>
                            <text fg={props.permissionSelectedIndex === choiceIndex() ? "#00FF00" : "white"}>
                              {props.permissionSelectedIndex === choiceIndex() ? "> " : "  "}
                              {sanitizePlainMessageText(choice.label)}
                            </text>
                            <Show when={choice.description}>
                              <text fg="#888888" marginLeft={4}>{sanitizePlainMessageText(choice.description!)}</text>
                            </Show>
                          </box>
                        )}
                      </For>
                      <text fg="#888888" marginLeft={2}>{unresolvedHelperText()}</text>
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
              const parts = [r.subtype]
              if (typeof r.durationMs === "number") {
                parts.push(`${Math.max(0, Math.round(r.durationMs / 1000))}s`)
              }
              if (typeof r.numTurns === "number") {
                parts.push(`turns ${r.numTurns}`)
              }
              // TODO: re-enable cost display once billing is finalized
              // if (typeof r.totalCostUsd === "number") {
              //   parts.push(`$${r.totalCostUsd.toFixed(4)}`)
              // }
              return (
                <text fg={r.isError ? "#AA6666" : "#888888"}>
                  {`⎿  ${sanitizePlainMessageText(parts.join(" • "))}`}
                </text>
              )
            })()}
          </Show>

          <Show when={isThinking()}>
            <box flexDirection="row">
              <text fg="#FFA500">{`${thinkingFrames[thinkingFrame()]} Thinking... `}</text>
              <text fg="#888888">
                {`(${[`${elapsed()}s`, outputTokensLabel()].filter((part) => part.length > 0).join(" • ")})`}
              </text>
            </box>
          </Show>
          <Show when={claude()?.streaming && !isThinking() && outputTokensLabel()}>
            <box flexDirection="row">
              <text fg="#888888">{outputTokensLabel()}</text>
            </box>
          </Show>
        </box>
      </box>
    </box>
  )
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { For, Show, createSignal, onCleanup, onMount } from "solid-js"

const CODEX_THINKING_INTERVAL_MS = 140
const CODEX_THINKING_SHIMMER_OVERSCAN = 4
const CODEX_THINKING_BASE_COLOR = "#666666"
const CODEX_THINKING_OUTER_COLOR = "#8A8A8A"
const CODEX_THINKING_EDGE_COLOR = "#C2C2C2"
const CODEX_THINKING_HEAD_COLOR = "#F2F2F2"

export type CodexThinkingIndicatorProps = {
  label: string
  summary?: string
}

export function CodexThinkingIndicator(props: CodexThinkingIndicatorProps) {
  const [frame, setFrame] = createSignal(0)
  let animTimer: ReturnType<typeof setInterval> | null = null

  const summary = () => props.summary?.trim() ?? ""
  const label = () => props.label
  const glyphs = () => label().split("")

  onMount(() => {
    animTimer = setInterval(() => {
      setFrame((index) => (index + 1) % (label().length + CODEX_THINKING_SHIMMER_OVERSCAN * 2))
    }, CODEX_THINKING_INTERVAL_MS)
  })

  onCleanup(() => {
    if (animTimer) clearInterval(animTimer)
  })
  const shimmerCenter = () => {
    const width = label().length + CODEX_THINKING_SHIMMER_OVERSCAN * 2
    return (frame() % Math.max(width, 1)) - CODEX_THINKING_SHIMMER_OVERSCAN
  }
  const getLabelColor = (index: number) => {
    const distance = Math.abs(index - shimmerCenter())
    if (distance < 0.5) return CODEX_THINKING_HEAD_COLOR
    if (distance < 1.5) return CODEX_THINKING_EDGE_COLOR
    if (distance < 2.5) return CODEX_THINKING_OUTER_COLOR
    return CODEX_THINKING_BASE_COLOR
  }
  const isLabelBold = (index: number) => Math.abs(index - shimmerCenter()) < 0.5
  const isLabelDim = (index: number) => Math.abs(index - shimmerCenter()) >= 2.5

  const getLabelStyle = (index: number) => ({
    fg: getLabelColor(index),
    bold: isLabelBold(index),
    dim: isLabelDim(index),
  })

  return (
    <box flexDirection="row">
      <text>
        <For each={glyphs()}>
          {(glyph, index) => <span style={getLabelStyle(index())}>{glyph}</span>}
        </For>
      </text>
      <Show when={summary().length > 0}>
        <text fg="#7A7A7A">{` (${summary()})`}</text>
      </Show>
    </box>
  )
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { Show, createSignal, onCleanup, onMount } from "solid-js"

export const CLAUDE_THINKING_FRAMES = ["◐", "◓", "◑", "◒"] as const
const CLAUDE_THINKING_INTERVAL_MS = 180

export type ClaudeThinkingIndicatorProps = {
  label: string
  summary?: string
  color?: string
}

export function ClaudeThinkingIndicator(props: ClaudeThinkingIndicatorProps) {
  const [frame, setFrame] = createSignal(0)
  let animTimer: ReturnType<typeof setInterval> | null = null

  onMount(() => {
    animTimer = setInterval(() => {
      setFrame((index) => (index + 1) % CLAUDE_THINKING_FRAMES.length)
    }, CLAUDE_THINKING_INTERVAL_MS)
  })

  onCleanup(() => {
    if (animTimer) clearInterval(animTimer)
  })

  const summary = () => props.summary?.trim() ?? ""

  return (
    <box flexDirection="row">
      <text fg={props.color ?? "#FFA500"}>{`${CLAUDE_THINKING_FRAMES[frame()]} ${props.label}`}</text>
      <Show when={summary().length > 0}>
        <text fg="#888888">{` (${summary()})`}</text>
      </Show>
    </box>
  )
}

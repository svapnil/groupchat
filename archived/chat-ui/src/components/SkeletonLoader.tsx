// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { For } from "solid-js"

const SKELETON_COLOR = "#444444"

export function SkeletonChannelList(props: { count?: number }) {
  const count = () => props.count ?? 4

  return (
    <For each={Array.from({ length: count() })}>
      {(_, idx) => (
        <box marginLeft={2} flexDirection="row" height={1} alignItems="center">
          <text fg={SKELETON_COLOR}>  #{"░".repeat(8 + (idx() % 3) * 4)}</text>
        </box>
      )}
    </For>
  )
}

export function SkeletonDmList(props: { count?: number }) {
  const count = () => props.count ?? 3

  return (
    <For each={Array.from({ length: count() })}>
      {(_, idx) => (
        <box flexDirection="column" marginLeft={2}>
          <box flexDirection="row" height={1} alignItems="center">
            <text fg={SKELETON_COLOR}>  ● {"░".repeat(6 + (idx() % 3) * 3)}</text>
          </box>
          <box marginLeft={4} height={1} alignItems="center">
            <text fg={SKELETON_COLOR}>{"░".repeat(16 + (idx() % 2) * 8)}</text>
          </box>
        </box>
      )}
    </For>
  )
}

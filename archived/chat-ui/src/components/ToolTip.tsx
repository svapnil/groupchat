// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { For, Show } from "solid-js"
import type { Command } from "../lib/commands"

export type ToolTipProps = {
  tips: Command[] | string[]
  type: "Command" | "User"
}

export function ToolTip(props: ToolTipProps) {
  return (
    <box flexDirection="column" paddingLeft={1} paddingRight={1}>
      <text> </text>
      <Show when={props.type === "Command"}>
        <For each={props.tips as Command[]}>
          {(tip) => (
            <box flexDirection="row">
              <text fg="cyan">{tip.syntax}</text>
              <text fg="#888888"> - {tip.description}</text>
            </box>
          )}
        </For>
      </Show>
      <Show when={props.type === "User"}>
        <For each={props.tips as string[]}>
          {(suggestion) => (
            <text fg="cyan">{suggestion}</text>
          )}
        </For>
      </Show>
    </box>
  )
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { For, createMemo } from "solid-js"
import type { PresenceState } from "../lib/types"
import { AGENT_CONFIG } from "../lib/constants"
import { PRESENCE } from "../lib/colors"

export type AtAGlanceProps = {
  presenceState: PresenceState
}

const normalizeColor = (color: string) => {
  if (color === "redBright") return "red"
  if (color === "blueBright") return "blue"
  return color
}

export function AtAGlance(props: AtAGlanceProps) {
  const userStats = createMemo(() =>
    Object.values(props.presenceState).reduce(
      (acc, userData) => {
        acc.total += 1
        const agent = userData.metas[0]?.current_agent
        if (agent === "claude") {
          acc.claude += 1
        } else if (agent === "codex") {
          acc.codex += 1
        } else if (agent === "cursor") {
          acc.cursor += 1
        } else if (agent === "windsurf") {
          acc.windsurf += 1
        }
        return acc
      },
      { total: 0, claude: 0, codex: 0, cursor: 0, windsurf: 0 }
    )
  )

  const rows = createMemo(() => {
    const stats = userStats()
    const items: Array<{ label: string; color?: string; muted?: boolean }> = [
      { label: `${stats.total} Online`, color: PRESENCE.online },
    ]

    if (stats.claude > 0) {
      items.push({ label: `${stats.claude} Using ${AGENT_CONFIG.claude.displayName}`, color: normalizeColor(AGENT_CONFIG.claude.color) })
    }
    if (stats.codex > 0) {
      items.push({ label: `${stats.codex} Using ${AGENT_CONFIG.codex.displayName}`, color: normalizeColor(AGENT_CONFIG.codex.color) })
    }
    if (stats.cursor > 0) {
      items.push({ label: `${stats.cursor} Using ${AGENT_CONFIG.cursor.displayName}`, color: normalizeColor(AGENT_CONFIG.cursor.color) })
    }
    if (stats.windsurf > 0) {
      items.push({ label: `${stats.windsurf} Using ${AGENT_CONFIG.windsurf.displayName}`, color: normalizeColor(AGENT_CONFIG.windsurf.color) })
    }
    if (stats.total === 0) {
      items.push({ label: "No users online", muted: true })
    }

    return items
  })

  return (
    <box
      flexDirection="column"
      width="100%"
      overflow="hidden"
    >
      <box marginBottom={1}>
        <text>
          <strong>At a Glance</strong>
        </text>
      </box>

      <For each={rows()}>
        {(row) => (
          <box marginLeft={2} flexDirection="row" height={1} alignItems="center">
            {row.color ? (
              <>
                <text flexShrink={0}>{"  "}</text>
                <text fg={row.color} flexShrink={0}>● </text>
              </>
            ) : null}
            <text fg={row.muted ? "#888888" : "white"} truncate width="100%" height={1}>
              {row.label}
            </text>
          </box>
        )}
      </For>
    </box>
  )
}

import { createMemo } from "solid-js"
import type { PresenceState } from "../lib/types"
import { AGENT_CONFIG } from "../lib/constants"
import { PRESENCE } from "../lib/colors"

export type AtAGlanceProps = {
  presenceState: PresenceState
  height: number
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

  return (
    <box
      flexDirection="column"
      flexShrink={0}
      border
      borderStyle="single"
      borderColor="gray"
      width={28}
      height={props.height}
      paddingLeft={1}
      paddingRight={1}
      overflow="hidden"
    >
      <box marginBottom={1}>
        <text>At A Glance</text>
      </box>

      <box flexDirection="column" gap={1}>
        <box flexDirection="row">
          <text fg={PRESENCE.online}>● </text>
          <text>{userStats().total} Online</text>
        </box>

        {userStats().claude > 0 ? (
          <box flexDirection="row">
            <text fg={normalizeColor(AGENT_CONFIG.claude.color)}>● </text>
            <text>{userStats().claude} Using {AGENT_CONFIG.claude.displayName}</text>
          </box>
        ) : null}

        {userStats().codex > 0 ? (
          <box flexDirection="row">
            <text fg={normalizeColor(AGENT_CONFIG.codex.color)}>● </text>
            <text>{userStats().codex} Using {AGENT_CONFIG.codex.displayName}</text>
          </box>
        ) : null}

        {userStats().cursor > 0 ? (
          <box flexDirection="row">
            <text fg={normalizeColor(AGENT_CONFIG.cursor.color)}>● </text>
            <text>{userStats().cursor} Using {AGENT_CONFIG.cursor.displayName}</text>
          </box>
        ) : null}

        {userStats().windsurf > 0 ? (
          <box flexDirection="row">
            <text fg={normalizeColor(AGENT_CONFIG.windsurf.color)}>● </text>
            <text>{userStats().windsurf} Using {AGENT_CONFIG.windsurf.displayName}</text>
          </box>
        ) : null}

        {userStats().total === 0 ? (
          <box>
            <text fg="#888888">No users online</text>
          </box>
        ) : null}
      </box>
    </box>
  )
}

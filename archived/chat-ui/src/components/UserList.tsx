// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import type { UserWithStatus } from "../primitives/presence"
import { getAgentColor, getAgentDisplayName } from "../lib/constants"
import { PRESENCE } from "../lib/colors"

export type UserListProps = {
  users: UserWithStatus[]
  currentUsername: string | null
  screenWidth: number
  screenHeight: number
  isPrivateChannel?: boolean
}

const POPUP_WIDTH = 34
const POPUP_MIN_HEIGHT = 8

const normalizeColor = (color?: string) => {
  if (!color) return undefined
  if (color === "redBright") return "red"
  if (color === "blueBright") return "blue"
  return color
}

export function UserList(props: UserListProps) {
  const onlineCount = () => props.users.filter((user) => user.isOnline).length

  const sortedUsers = () =>
    [...props.users].sort((a, b) => {
      if (a.username === props.currentUsername) return -1
      if (b.username === props.currentUsername) return 1

      if (a.isOnline && !b.isOnline) return -1
      if (!a.isOnline && b.isOnline) return 1

      return 0
    })

  const popupHeight = () => {
    // 2 for border, 1 for header, 1 for count, 1 for gap, plus 1 per user (2 if they have an agent)
    const userLines = sortedUsers().reduce((acc, user) => acc + (user.currentAgent ? 2 : 1), 0)
    const contentHeight = 3 + userLines + 2 // header + count + gap + users + padding
    return Math.min(Math.max(POPUP_MIN_HEIGHT, contentHeight), props.screenHeight - 4)
  }

  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width={props.screenWidth}
      height={props.screenHeight}
      justifyContent="center"
      alignItems="center"
      zIndex={100}
    >
      <box
        flexDirection="column"
        border
        borderStyle="single"
        backgroundColor="black"
        borderColor="gray"
        width={POPUP_WIDTH}
        height={popupHeight()}
        paddingLeft={1}
        paddingRight={1}
        overflow="hidden"
      >
        <box marginBottom={1}>
          <text>
            <u><strong>ONLINE USERS</strong></u>
          </text>
        </box>

        <box marginBottom={1}>
          <text fg="cyan">[{onlineCount()} {props.isPrivateChannel ? "online" : "connected"}]</text>
        </box>

        <box flexDirection="column">
          {sortedUsers().map((user) => (
            <box flexDirection="column">
              <box flexDirection="row">
                <text fg={user.isOnline ? PRESENCE.online : PRESENCE.offline}>● </text>
                <text fg={user.username === props.currentUsername ? "yellow" : "white"}>
                  {user.username}
                </text>
                {user.username === props.currentUsername ? <text fg="gray"> (you)</text> : null}
                {user.role === "admin" ? <text fg="yellow"> *</text> : null}
              </box>
              {user.currentAgent ? (
                <box marginLeft={2}>
                  <text fg={normalizeColor(getAgentColor(user.currentAgent))}>
                    - Using {getAgentDisplayName(user.currentAgent)}
                  </text>
                </box>
              ) : null}
            </box>
          ))}
        </box>
      </box>
    </box>
  )
}

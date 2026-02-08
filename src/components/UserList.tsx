import type { UserWithStatus } from "../primitives/presence"
import { getAgentColor, getAgentDisplayName } from "../lib/constants"
import { PRESENCE } from "../lib/colors"

export type UserListProps = {
  users: UserWithStatus[]
  currentUsername: string | null
  height: number
  isPrivateChannel?: boolean
}

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

  return (
    <box
      flexDirection="column"
      flexShrink={0}
      border
      borderStyle="single"
      borderColor="gray"
      width={24}
      height={props.height}
      paddingLeft={1}
      paddingRight={1}
      overflow="hidden"
    >
      <box marginBottom={1}>
        {props.isPrivateChannel ? (
          <text>
            <strong>MEMBERS</strong>
          </text>
        ) : (
          <box flexDirection="row">
            <text fg={PRESENCE.online}>● </text>
            <text>
              <strong>ONLINE USERS</strong>
            </text>
          </box>
        )}
      </box>

      <box marginBottom={1}>
        <text fg="cyan">[{onlineCount()} {props.isPrivateChannel ? "online" : "connected"}]</text>
      </box>

      <box flexDirection="column">
        {sortedUsers().map((user) => {
          const isTruncated = user.username.length > 8
          const displayName = isTruncated ? user.username.substring(0, 8) : user.username

          return (
            <box flexDirection="column">
              <box flexDirection="row">
                <text fg={user.isOnline ? PRESENCE.online : PRESENCE.offline}>● </text>
                <text fg={user.username === props.currentUsername ? "yellow" : "white"}>
                  {displayName}{isTruncated ? "..." : ""}
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
          )
        })}
      </box>
    </box>
  )
}

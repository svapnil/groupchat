import React from "react";
import { Box, Text } from "ink";
import type { UserWithStatus } from "../hooks/use-presence.js";
import { getAgentColor, getAgentDisplayName } from "../lib/constants.js";

interface UserListProps {
  users: UserWithStatus[];
  currentUsername: string | null;
  height: number;
  isPrivateChannel?: boolean;
}

export const UserList = React.memo(function UserList({
  users,
  currentUsername,
  height,
  isPrivateChannel = false
}: UserListProps) {
  const onlineCount = users.filter(u => u.isOnline).length;
  const offlineCount = users.filter(u => !u.isOnline).length;

  // Sort users: self first, then online users, then offline users
  const sortedUsers = [...users].sort((a, b) => {
    // Current user always first
    if (a.username === currentUsername) return -1;
    if (b.username === currentUsername) return 1;

    // Then sort by online status (online users before offline)
    if (a.isOnline && !b.isOnline) return -1;
    if (!a.isOnline && b.isOnline) return 1;

    // Maintain original order for users with same status
    return 0;
  });

  return (
    <Box
      flexDirection="column"
      flexShrink={0}
      borderStyle="single"
      borderColor="gray"
      width={24}
      height={height}
      paddingX={1}
      overflow="hidden"
    >
      <Box marginBottom={1}>
        {isPrivateChannel ? (
          <Text color="white" bold>MEMBERS</Text>
        ) : (
          <>
            <Text color="green" bold>● </Text>
            <Text color="white" bold>ONLINE USERS</Text>
          </>
        )}
      </Box>

      <Box marginBottom={1}>
        {isPrivateChannel ? (
          <Text color="cyan">[{onlineCount} online]</Text>
        ) : (
          <Text color="cyan">[{onlineCount} connected]</Text>
        )}
      </Box>

      <Box flexDirection="column">
        {sortedUsers.map((user) => {
          const isTruncated = user.username.length > 8;
          const displayName = isTruncated
            ? user.username.substring(0, 8)
            : user.username;

          return (
            <Box key={user.username} flexDirection="column">
              <Box>
                <Text color={user.isOnline ? "green" : "gray"}>●</Text>
                <Text> </Text>
                <Text color={user.username === currentUsername ? "yellow" : "white"}>
                  {displayName}{isTruncated && "…"}
                </Text>
                {user.username === currentUsername && (
                  <Text color="gray"> (you)</Text>
                )}
                {user.role === "admin" && (
                  <Text color="yellow"> ★</Text>
                )}
              </Box>
              {user.currentAgent && (
                <Box marginLeft={2}>
                  <Text color={getAgentColor(user.currentAgent)}>
                    ⎿ Using {getAgentDisplayName(user.currentAgent)}
                  </Text>
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
});

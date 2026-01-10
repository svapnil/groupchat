import React from "react";
import { Box, Text } from "ink";
import type { User } from "../lib/types.js";

interface UserListProps {
  users: User[];
  currentUsername: string | null;
}

export function UserList({ users, currentUsername }: UserListProps) {
  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="gray"
      width={24}
      paddingX={1}
    >
      <Box marginBottom={1}>
        <Text color="green" bold>
          ●{" "}
        </Text>
        <Text color="white" bold>
          ONLINE USERS
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text color="cyan">[{users.length} connected]</Text>
      </Box>

      <Box flexDirection="column">
        {users.map((user) => (
          <Box key={user.username}>
            <Text color="green">● </Text>
            <Text color={user.username === currentUsername ? "yellow" : "white"}>
              {user.username}
            </Text>
            {user.username === currentUsername && (
              <Text color="gray"> (you)</Text>
            )}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

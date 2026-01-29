import React from "react";
import { Box, Text } from "ink";
import type { PresenceState } from "../lib/types.js";
import { AGENT_CONFIG } from "../lib/constants.js";

interface AtAGlanceProps {
  presenceState: PresenceState;
  height: number;
}

export function AtAGlance({ presenceState, height }: AtAGlanceProps) {
  // Count online users and their agents
  const userStats = Object.values(presenceState).reduce(
    (acc, userData) => {
      acc.total++;
      const agent = userData.metas[0]?.current_agent;
      if (agent === "claude") {
        acc.claude++;
      } else if (agent === "codex") {
        acc.codex++;
      } else if (agent === "cursor") {
        acc.cursor++;
      } else if (agent === "windsurf") {
        acc.windsurf++;
      }
      return acc;
    },
    { total: 0, claude: 0, codex: 0, cursor: 0, windsurf: 0 }
  );

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
        <Text color="white">At A Glance</Text>
      </Box>

      <Box flexDirection="column" gap={1}>
        <Box>
          <Text color="green">● </Text>
          <Text color="white">{userStats.total} Online</Text>
        </Box>

        {userStats.claude > 0 && (
          <Box>
            <Text color={AGENT_CONFIG.claude.color}>●</Text>
            <Text> </Text>
            <Text color="white">
              {userStats.claude} Using {AGENT_CONFIG.claude.displayName}
            </Text>
          </Box>
        )}

        {userStats.codex > 0 && (
          <Box>
            <Text color={AGENT_CONFIG.codex.color}>●</Text>
            <Text> </Text>
            <Text color="white">
              {userStats.codex} Using {AGENT_CONFIG.codex.displayName}
            </Text>
          </Box>
        )}

        {userStats.cursor > 0 && (
          <Box>
            <Text color={AGENT_CONFIG.cursor.color}>●</Text>
            <Text> </Text>
            <Text color="white">
              {userStats.cursor} Using {AGENT_CONFIG.cursor.displayName}
            </Text>
          </Box>
        )}

        {userStats.windsurf > 0 && (
          <Box>
            <Text color={AGENT_CONFIG.windsurf.color}>●</Text>
            <Text> </Text>
            <Text color="white">
              {userStats.windsurf} Using {AGENT_CONFIG.windsurf.displayName}
            </Text>
          </Box>
        )}

        {userStats.total === 0 && (
          <Box>
            <Text color="gray">No users online</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}

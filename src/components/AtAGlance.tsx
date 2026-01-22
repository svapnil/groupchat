import React from "react";
import { Box, Text } from "ink";
import type { PresenceState } from "../lib/types.js";
import { AGENT_CONFIG } from "../lib/constants.js";

interface AtAGlanceProps {
  presenceState: PresenceState;
}

export function AtAGlance({ presenceState }: AtAGlanceProps) {
  // Count online users and their agents
  const userStats = Object.values(presenceState).reduce(
    (acc, userData) => {
      acc.total++;
      const agent = userData.metas[0]?.current_agent;
      if (agent === "claude") {
        acc.claude++;
      } else if (agent === "codex") {
        acc.codex++;
      }
      return acc;
    },
    { total: 0, claude: 0, codex: 0 }
  );

  return (
    <Box
      flexDirection="column"
      flexShrink={0}
      borderStyle="single"
      borderColor="gray"
      width={26}
      paddingX={1}
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
            <Text color={AGENT_CONFIG.claude.color}>● </Text>
            <Text color="white">
              {userStats.claude} Using {AGENT_CONFIG.claude.displayName}
            </Text>
          </Box>
        )}

        {userStats.codex > 0 && (
          <Box>
            <Text color={AGENT_CONFIG.codex.color}>● </Text>
            <Text color="white">
              {userStats.codex} Using {AGENT_CONFIG.codex.displayName}
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

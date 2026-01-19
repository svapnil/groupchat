import React from "react";
import { Box, Text } from "ink";
import type { Command } from "../lib/commands.js";

interface ToolTipProps {
  tips: Command[] | string[];  // Commands OR parameter suggestions (already formatted)
  type: "Command" | "User";
}

export const ToolTip: React.FC<ToolTipProps> = ({ tips, type }) => {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text> </Text>
      {type === "Command" && (tips as Command[]).map((tip) => (
        <Text key={tip.name} color="gray">
          <Text color="cyan">{tip.syntax}</Text> - {tip.description}
        </Text>
      ))}
      {type === "User" && (tips as string[]).map((suggestion) => (
        <Text key={suggestion} color="gray">
          <Text color="cyan">{suggestion}</Text>
        </Text>
      ))}
    </Box>
  );
};

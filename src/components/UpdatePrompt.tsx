import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { UpdateInfo, getUpdateCommand } from "../lib/update-checker.js";
import { execSync, spawn } from "child_process";

interface UpdatePromptProps {
  updateInfo: UpdateInfo;
  onComplete: () => void;
}

const options = [
  { label: "Update now", value: "update" },
  { label: "Skip", value: "skip" },
] as const;

export function UpdatePrompt({ updateInfo, onComplete }: UpdatePromptProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  useInput((input, key) => {
    if (isUpdating) return;

    if (key.upArrow || input === "k") {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow || input === "j") {
      setSelectedIndex((i) => Math.min(options.length - 1, i + 1));
    } else if (key.return) {
      const selected = options[selectedIndex];
      if (selected.value === "update") {
        handleUpdate();
      } else {
        onComplete();
      }
    } else if (input === "1") {
      handleUpdate();
    } else if (input === "2") {
      onComplete();
    }
  });

  const handleUpdate = () => {
    setIsUpdating(true);
    const command = getUpdateCommand();

    try {
      execSync(command, { stdio: "inherit" });
      console.log("\n\nUpdate complete! Restarting...\n");

      // Spawn a new instance of groupchat with the same arguments
      // Skip the first two args (node executable and script path)
      const args = process.argv.slice(2);
      const child = spawn("groupchat", args, {
        detached: true,
        stdio: "inherit",
      });

      // Allow parent to exit while child continues
      child.unref();
      process.exit(0);
    } catch (err) {
      setUpdateError(
        `Update failed. Please run manually: ${command}`
      );
      setIsUpdating(false);
    }
  };

  if (updateError) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">{updateError}</Text>
        <Text dimColor>Press any key to continue...</Text>
      </Box>
    );
  }

  if (isUpdating) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">Updating...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingY={1}>
      <Box marginBottom={1}>
        <Text color="yellow">  </Text>
        <Text bold color="yellow">
          Update available!{" "}
        </Text>
        <Text dimColor>{updateInfo.currentVersion}</Text>
        <Text> -{">"} </Text>
        <Text color="green">{updateInfo.latestVersion}</Text>
      </Box>

      <Box flexDirection="column">
        {options.map((option, index) => {
          const isSelected = index === selectedIndex;
          return (
            <Box key={option.value}>
              <Text color={isSelected ? "cyan" : undefined}>
                {isSelected ? ">" : " "} {index + 1}. {option.label}
              </Text>
              {option.value === "update" && (
                <Text dimColor> (runs `{getUpdateCommand()}`)</Text>
              )}
            </Box>
          );
        })}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Press enter to continue</Text>
      </Box>
    </Box>
  );
}

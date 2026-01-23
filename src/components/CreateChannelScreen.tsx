import React, { useState, useEffect } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import TextInput from "ink-text-input";
import { Header } from "./Header.js";
import { Layout } from "./Layout.js";
import { useNavigation } from "../routes/Router.js";
import type { ConnectionStatus } from "../lib/types.js";

type ActiveField = "name" | "description" | "submit";

interface CreateChannelScreenProps {
  width: number;
  height: number;
  username: string | null;
  connectionStatus: ConnectionStatus;
  onLogout: () => void;
  onCreateChannel: (name: string, description: string) => Promise<void>;
  topPadding?: number;
  totalUnreadCount?: number;
}

export function CreateChannelScreen({
  width,
  height,
  username,
  connectionStatus,
  onLogout,
  onCreateChannel,
  topPadding = 0,
  totalUnreadCount = 0,
}: CreateChannelScreenProps) {
  const { stdout } = useStdout();
  const { navigate } = useNavigation();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [activeField, setActiveField] = useState<ActiveField>("name");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update terminal tab title
  useEffect(() => {
    if (!stdout) return;
    const unreadSuffix = totalUnreadCount > 0 ? ` (${totalUnreadCount})` : "";
    stdout.write(`\x1b]0;Create Channel${unreadSuffix}\x07`);
  }, [stdout, totalUnreadCount]);

  // Handle keyboard input
  useInput((input, key) => {
    // ESC to go back to menu
    if (key.escape) {
      navigate("menu");
      return;
    }

    // Tab to move to next field
    if (key.tab && !key.shift) {
      setActiveField((prev) => {
        if (prev === "name") return "description";
        if (prev === "description") return "submit";
        return "name";
      });
      return;
    }

    // Shift+Tab to move to previous field (or back to menu if on first field)
    if (key.tab && key.shift) {
      // If on the first field (name), go back to menu
      if (activeField === "name") {
        navigate("menu");
        return;
      }

      // Otherwise, navigate to previous field
      setActiveField((prev) => {
        if (prev === "submit") return "description";
        if (prev === "description") return "name";
        return prev;
      });
      return;
    }

    // Down arrow to move to next field
    if (key.downArrow) {
      setActiveField((prev) => {
        if (prev === "name") return "description";
        if (prev === "description") return "submit";
        return prev;
      });
      return;
    }

    // Up arrow to move to previous field
    if (key.upArrow) {
      setActiveField((prev) => {
        if (prev === "submit") return "description";
        if (prev === "description") return "name";
        return prev;
      });
      return;
    }

    // Enter on submit to create channel
    if (key.return && activeField === "submit" && !isSubmitting) {
      handleSubmit();
    }
  });

  const handleSubmit = async () => {
    // Validate name
    if (!name.trim()) {
      setError("Channel name is required");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await onCreateChannel(name.trim(), description.trim());
      navigate("menu");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create channel");
      setIsSubmitting(false);
    }
  };

  // Header is 3 lines tall
  const headerHeight = 3;
  const contentHeight = height - topPadding - headerHeight;

  return (
    <Layout width={width} height={height} topPadding={topPadding}>
      <Layout.Header>
        <Header
          username={username}
          roomName="Create Channel"
          connectionStatus={connectionStatus}
          onLogout={onLogout}
          title={<Text bold color="cyan">Create New Private Channel</Text>}
          showStatus={false}
        />
      </Layout.Header>

      <Layout.Content>
        <Box flexDirection="column" height={contentHeight} padding={2}>
          {/* Name field */}
          <Box flexDirection="column" marginBottom={1}>
            <Box marginBottom={0}>
              <Text bold color={activeField === "name" ? "green" : "white"}>
                Channel Name {activeField === "name" ? "(editing)" : ""}
              </Text>
            </Box>
            <Box
              borderStyle="single"
              borderColor={activeField === "name" ? "green" : "gray"}
              paddingX={1}
            >
              {activeField === "name" ? (
                <TextInput
                  value={name}
                  onChange={setName}
                  placeholder="Enter channel name..."
                />
              ) : (
                <Text color={name ? "white" : "gray"}>
                  {name || "Enter channel name..."}
                </Text>
              )}
            </Box>
          </Box>

          {/* Description field */}
          <Box flexDirection="column" marginBottom={1}>
            <Box marginBottom={0}>
              <Text bold color={activeField === "description" ? "green" : "white"}>
                Description (optional) {activeField === "description" ? "(editing)" : ""}
              </Text>
            </Box>
            <Box
              borderStyle="single"
              borderColor={activeField === "description" ? "green" : "gray"}
              paddingX={1}
            >
              {activeField === "description" ? (
                <TextInput
                  value={description}
                  onChange={setDescription}
                  placeholder="Enter channel description..."
                />
              ) : (
                <Text color={description ? "white" : "gray"}>
                  {description || "Enter channel description..."}
                </Text>
              )}
            </Box>
          </Box>

          {/* Submit button */}
          <Box marginTop={1}>
            <Text
              color={activeField === "submit" ? "green" : "white"}
              bold={activeField === "submit"}
            >
              {activeField === "submit" ? "> " : "  "}
              [{isSubmitting ? "Creating..." : "Create Channel"}]
            </Text>
          </Box>

          {/* Error message */}
          {error && (
            <Box marginTop={1}>
              <Text color="red">{error}</Text>
            </Box>
          )}

          {/* Spacer */}
          <Box flexGrow={1} />

          {/* Footer help text */}
          <Box
            flexDirection="column"
            borderStyle="single"
            borderColor="gray"
            paddingX={1}
          >
            <Text color="gray">
              <Text color="cyan">Tab/Down</Text> Next field
            </Text>
            <Text color="gray">
              <Text color="cyan">Shift+Tab/Up</Text> Previous field / Back to menu
            </Text>
            <Text color="gray">
              <Text color="cyan">Enter</Text> Submit (when on button)
            </Text>
            <Text color="gray">
              <Text color="cyan">ESC</Text> Back to menu
            </Text>
          </Box>
        </Box>
      </Layout.Content>
    </Layout>
  );
}

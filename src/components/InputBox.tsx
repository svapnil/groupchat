import React, { useState, useCallback, useRef, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";

interface InputBoxProps {
  onSend: (message: string) => Promise<void>;
  onTypingStart: () => void;
  onTypingStop: () => void;
  disabled: boolean;
  onInputChange?: (value: string) => void;
}

export function InputBox({
  onSend,
  onTypingStart,
  onTypingStop,
  disabled,
  onInputChange,
}: InputBoxProps) {
  const [value, setValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef(false);

  // Handle typing indicator with debounce
  const handleChange = useCallback(
    (newValue: string) => {
      setValue(newValue);
      onInputChange?.(newValue);

      // Start typing if not already
      if (!isTypingRef.current && newValue.length > 0) {
        isTypingRef.current = true;
        onTypingStart();
      }

      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      // Set new timeout to stop typing indicator
      if (newValue.length > 0) {
        typingTimeoutRef.current = setTimeout(() => {
          isTypingRef.current = false;
          onTypingStop();
        }, 2000);
      } else {
        // If input is empty, stop typing immediately
        isTypingRef.current = false;
        onTypingStop();
      }
    },
    [onTypingStart, onTypingStop, onInputChange]
  );

  // Handle send
  const handleSubmit = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed || disabled || isSending) return;

    setIsSending(true);

    // Stop typing indicator
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    isTypingRef.current = false;
    onTypingStop();

    try {
      await onSend(trimmed);
      setValue("");
    } catch {
      // Error handled by chat hook
    } finally {
      setIsSending(false);
    }
  }, [value, disabled, isSending, onSend, onTypingStop]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  return (
    <Box
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      flexDirection="column"
      width="100%"
      flexShrink={0}
    >
      <Box>
        <Text color="cyan">$ </Text>
        <Box flexGrow={1}>
          <TextInput
            value={value}
            onChange={handleChange}
            onSubmit={handleSubmit}
            placeholder={disabled ? "Connecting..." : "Type a message..."}
          />
        </Box>
        <Text color={disabled || !value.trim() ? "gray" : "green"}>
          {" "}
          [SEND]
        </Text>
      </Box>
      <Box>
        <Text color="gray" dimColor>
          Enter to send
        </Text>
      </Box>
    </Box>
  );
}

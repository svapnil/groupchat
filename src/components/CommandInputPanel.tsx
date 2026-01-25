import React, { useLayoutEffect } from "react";
import { InputBox } from "./InputBox.js";
import { ToolTip } from "./ToolTip.js";
import { useCommandInput } from "../hooks/use-command-input.js";
import type { ConnectionStatus, Subscriber } from "../lib/types.js";
import type { UserWithStatus } from "../hooks/use-presence.js";

interface CommandInputPanelProps {
  token: string | null;
  currentChannel: string;
  isPrivateChannel: boolean;
  connectionStatus: ConnectionStatus;
  username: string | null;
  users: UserWithStatus[];
  subscribers: Subscriber[];
  onSend: (message: string) => Promise<void>;
  onTypingStart: () => void;
  onTypingStop: () => void;
  onCommandSend: (eventType: string, data: any) => Promise<void>;
  onTooltipHeightChange?: (height: number) => void;
}

export function CommandInputPanel({
  token,
  currentChannel,
  isPrivateChannel,
  connectionStatus,
  username,
  users,
  subscribers,
  onSend,
  onTypingStart,
  onTypingStop,
  onCommandSend,
  onTooltipHeightChange,
}: CommandInputPanelProps) {
  const { tooltip, isInputDisabled, handleInputChange, handleSubmit } = useCommandInput({
    token,
    currentChannel,
    isPrivateChannel,
    connectionStatus,
    username,
    users,
    subscribers,
    onSendMessage: onSend,
    onCommandSend,
  });

  useLayoutEffect(() => {
    onTooltipHeightChange?.(tooltip.height);
  }, [tooltip.height, onTooltipHeightChange]);

  return (
    <>
      {tooltip.show && tooltip.tips.length > 0 && (
        <ToolTip tips={tooltip.tips} type={tooltip.type} />
      )}
      <InputBox
        onSend={handleSubmit}
        onTypingStart={onTypingStart}
        onTypingStop={onTypingStop}
        onInputChange={handleInputChange}
        disabled={isInputDisabled}
      />
    </>
  );
}

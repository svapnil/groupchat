// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { Show, createEffect } from "solid-js"
import { InputBox } from "./InputBox"
import { ToolTip } from "./ToolTip"
import { useCommandInput } from "../primitives/use-command-input"
import { isAgentExitCommandEvent, type Command } from "../lib/commands"
import type { InputMode } from "../lib/input-mode"
import type { ConnectionStatus, Subscriber } from "../lib/types"
import type { UserWithStatus } from "../primitives/presence"

export type CommandInputPanelProps = {
  token: string | null
  currentChannel: string
  isPrivateChannel: boolean
  connectionStatus: ConnectionStatus
  username: string | null
  users: UserWithStatus[]
  subscribers: Subscriber[]
  onSend: (message: string) => Promise<void>
  onTypingStart: () => void
  onTypingStop: () => void
  onCommandSend: (eventType: string, data: any) => Promise<void>
  placeholder?: string
  onTooltipHeightChange?: (height: number) => void
  commandFilter?: (command: Command) => boolean
  agentMode?: InputMode | null
}

export function CommandInputPanel(props: CommandInputPanelProps) {
  const commandInput = useCommandInput({
    token: () => props.token,
    currentChannel: () => props.currentChannel,
    isPrivateChannel: () => props.isPrivateChannel,
    commandsEnabled: () => true,
    commandFilter: (command) => {
      if (props.agentMode) {
        if (!isAgentExitCommandEvent(command.eventType)) return false
      } else if (isAgentExitCommandEvent(command.eventType)) {
        return false
      }
      return props.commandFilter ? props.commandFilter(command) : true
    },
    inputEnabledOverride: () => Boolean(props.agentMode),
    connectionStatus: () => props.connectionStatus,
    username: () => props.username,
    users: () => props.users,
    subscribers: () => props.subscribers,
    onSendMessage: props.onSend,
    onCommandSend: props.onCommandSend,
  })

  createEffect(() => {
    if (props.onTooltipHeightChange) {
      props.onTooltipHeightChange(commandInput.tooltip().height)
    }
  })

  return (
    <>
      <Show when={commandInput.tooltip().show && commandInput.tooltip().tips.length > 0}>
        <ToolTip tips={commandInput.tooltip().tips} type={commandInput.tooltip().type} />
      </Show>
      <InputBox
        onSend={commandInput.handleSubmit}
        onTypingStart={props.onTypingStart}
        onTypingStop={props.onTypingStop}
        onInputChange={commandInput.handleInputChange}
        commandNames={commandInput.availableCommandNames()}
        placeholder={props.placeholder}
        disabled={commandInput.isInputDisabled()}
        sendDisabled={commandInput.isSendDisabled()}
        mode={props.agentMode || null}
      />
    </>
  )
}

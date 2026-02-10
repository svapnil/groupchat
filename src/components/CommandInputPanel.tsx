import { Show, createEffect } from "solid-js"
import { InputBox } from "./InputBox"
import { ToolTip } from "./ToolTip"
import { useCommandInput } from "../primitives/use-command-input"
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
  onTooltipHeightChange?: (height: number) => void
}

export function CommandInputPanel(props: CommandInputPanelProps) {
  const commandInput = useCommandInput({
    token: () => props.token,
    currentChannel: () => props.currentChannel,
    isPrivateChannel: () => props.isPrivateChannel,
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
        disabled={commandInput.isInputDisabled()}
      />
    </>
  )
}

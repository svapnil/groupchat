import { createSignal, For } from "solid-js"
import { useKeyboard, useRenderer } from "@opentui/solid"
import { UpdateInfo, getUpdateCommand } from "../lib/update-checker"
import { execSync } from "child_process"

interface UpdatePromptProps {
  updateInfo: UpdateInfo
  onComplete: () => void
}

const options = [
  { label: "Update now", value: "update" },
  { label: "Skip", value: "skip" },
] as const

export function UpdatePrompt(props: UpdatePromptProps) {
  const [selectedIndex, setSelectedIndex] = createSignal(0)
  const [isUpdating, setIsUpdating] = createSignal(false)
  const [updateError, setUpdateError] = createSignal<string | null>(null)
  const renderer = useRenderer()

  const handleUpdate = () => {
    setIsUpdating(true)
    const command = getUpdateCommand()

    try {
      execSync(command, { stdio: "inherit" })
      process.on("exit", () => {
        process.stdout.write("\nGroupchat has been updated.\n\n")
      })
      renderer.destroy()
    } catch {
      setUpdateError(`Update failed. Please run manually: ${command}`)
      setIsUpdating(false)
    }
  }

  const handleSkip = () => {
    renderer.destroy()
  }

  useKeyboard((key) => {
    if (isUpdating()) return

    if (key.name === "up" || key.name === "k") {
      setSelectedIndex((i) => Math.max(0, i - 1))
    } else if (key.name === "down" || key.name === "j") {
      setSelectedIndex((i) => Math.min(options.length - 1, i + 1))
    } else if (key.name === "enter") {
      const selected = options[selectedIndex()]
      if (selected.value === "update") {
        handleUpdate()
      } else {
        handleSkip()
      }
    } else if (key.name === "1") {
      handleUpdate()
    } else if (key.name === "2") {
      handleSkip()
    }
  })

  if (updateError()) {
    return (
      <box flexDirection="column" padding={1}>
        <text fg="red">{updateError()}</text>
        <text fg="#888888">Press any key to continue...</text>
      </box>
    )
  }

  if (isUpdating()) {
    return (
      <box flexDirection="column" padding={1}>
        <text fg="cyan">Updating...</text>
      </box>
    )
  }

  return (
    <box flexDirection="column" paddingTop={1} paddingBottom={1}>
      <box marginBottom={1}>
        <text fg="yellow">^ </text>
        <text fg="yellow"><strong>Update available!</strong></text>
        <text> </text>
        <text fg="#888888">{props.updateInfo.currentVersion}</text>
        <text> → </text>
        <text fg="#00FF00">{props.updateInfo.latestVersion}</text>
      </box>

      <box flexDirection="column">
        <For each={options}>
          {(option, index) => {
            const isSelected = () => index() === selectedIndex()
            return (
              <box>
                <text fg={isSelected() ? "cyan" : undefined}>
                  {isSelected() ? ">" : " "} {index() + 1}. {option.label}
                </text>
                {option.value === "update" && (
                  <text fg="#888888"> (runs `{getUpdateCommand()}`)</text>
                )}
              </box>
            )
          }}
        </For>
      </box>

      <box marginTop={1}>
        <text fg="#888888">Press enter to continue</text>
      </box>
    </box>
  )
}

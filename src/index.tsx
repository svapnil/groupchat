import { render } from "@opentui/solid"
import App from "./components/App"
import { UpdatePrompt } from "./pages/UpdatePrompt"
import { checkForUpdate, type UpdateInfo } from "./lib/update-checker"

async function main() {
  // Check if terminal supports our requirements
  if (!process.stdout.isTTY) {
    console.error("Error: groupchat requires an interactive terminal.\n")
    process.exit(1)
  }

  // Check for updates
  const updateInfo = await checkForUpdate()

  if (updateInfo.updateAvailable) {
    await showUpdatePrompt(updateInfo)
  }

  // Clear terminal and start app
  process.stdout.write('\x1b[2J\x1b[0f')
  render(() => <App />, { exitOnCtrlC: false })
}

async function showUpdatePrompt(updateInfo: UpdateInfo): Promise<void> {
  return new Promise((resolve) => {
    render(
      () => <UpdatePrompt updateInfo={updateInfo} onComplete={() => {}} />,
      {
        exitOnCtrlC: true,
        onDestroy: () => {
          resolve()
        }
      }
    )
  })
}

main()

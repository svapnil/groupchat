// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
// Shown right after login when the user belongs to 2+ organizations: pick the
// org this TUI session is scoped to. The choice persists until logout.
import { For, createSignal } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { Layout } from "../components/Layout"
import { StatusBar } from "../components/StatusBar"
import { useOrgStore } from "../stores/org-store"

export type OrgSelectScreenProps = {
  width: number
  height: number
  topPadding?: number
}

export function OrgSelectScreen(props: OrgSelectScreenProps) {
  const org = useOrgStore()
  const [selectedIndex, setSelectedIndex] = createSignal(0)

  useKeyboard((key) => {
    const items = org.orgs()
    if (items.length === 0) return

    if (key.name === "up" || key.name === "k") {
      setSelectedIndex((prev) => Math.max(0, prev - 1))
      return
    }

    if (key.name === "down" || key.name === "j") {
      setSelectedIndex((prev) => Math.min(items.length - 1, prev + 1))
      return
    }

    if (key.name === "return") {
      const selected = items[selectedIndex()]
      if (selected) org.selectOrg(selected.slug)
    }
  })

  return (
    <Layout width={props.width} height={props.height} topPadding={props.topPadding ?? 0}>
      <Layout.Content>
        <box flexDirection="column" padding={2}>
          <box marginBottom={1}>
            <text>
              <strong>Choose an organization</strong>
            </text>
          </box>
          <box marginBottom={1}>
            <text fg="#888888">This session will be scoped to the organization you pick.</text>
          </box>

          <For each={org.orgs()}>
            {(item, idx) => (
              <box marginLeft={2} flexDirection="row" height={1} alignItems="center">
                <text fg={selectedIndex() === idx() ? "#00FF00" : "white"}>
                  {selectedIndex() === idx() ? "> " : "  "}{item.name}
                </text>
                <text fg="#888888"> as @{item.username}</text>
              </box>
            )}
          </For>
        </box>
      </Layout.Content>

      <Layout.Footer>
        <StatusBar
          error={null}
          showUserToggle={false}
          showVersion
          hintText="↑/↓ select | Enter confirm | Ctrl+C Exit"
        />
      </Layout.Footer>
    </Layout>
  )
}

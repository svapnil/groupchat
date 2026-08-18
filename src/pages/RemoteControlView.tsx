// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
/**
 * The main `groupchat` view: a compact status card (not a full-screen
 * workspace) showing that the remote is online, whether codex is runnable,
 * and what the runner is doing right now. The connection machinery keeps
 * running in ChatProvider underneath; this view only reads.
 */
import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { useRenderer } from "@opentui/solid"
import { useChatStore } from "../stores/chat-store"
import { useOrgStore } from "../stores/org-store"
import { getRuntimeCapabilities } from "../lib/runtime-capabilities"
import { workspaceLabel } from "../lib/workspace"
import { PRESENCE } from "../lib/colors"
import {
  remoteActiveRuns,
  remoteRecentRuns,
  type RemoteRunEventInfo,
  type RemoteRunInfo,
} from "../agent/core/remote-run-store"

export type RemoteControlViewProps = {
  width: number
  height: number
  topPadding?: number
}

const PANEL_WIDTH = 62
const BUSY_COLOR = "#FFD166"
const ERROR_COLOR = "#FF5555"
const DIM = "#888888"
const FAINT = "#666666"

/** "chat_room:acme:general" -> "#general"; "dm:acme:3:7" -> "a DM". */
function prettyRoom(room: string): string {
  if (room.startsWith("dm:")) return "a DM"
  const name = room.split(":").pop() || room
  return `#${name}`
}

function formatElapsed(startedAt: number, now: number): string {
  const totalSeconds = Math.max(0, Math.floor((now - startedAt) / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0 ? `${minutes}m${String(seconds).padStart(2, "0")}s` : `${seconds}s`
}

function firstLine(text: string): string {
  return text.split(/\r?\n/).find((line) => line.trim()) ?? ""
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/** Drops the leading path so the tail — the part that identifies the dir — survives. */
function truncateStart(text: string, max: number): string {
  return text.length > max ? `…${text.slice(text.length - max + 1)}` : text
}

function describeEvent(event: RemoteRunEventInfo): string {
  switch (event.event) {
    case "question":
      return "starting…"
    case "thinking":
      return "thinking…"
    case "tool_call":
    case "tool_progress":
      return `${event.toolName ?? "tool"}: ${firstLine(event.content)}`
    case "tool_result":
      return `${event.toolName ?? "tool"} finished`
    case "text_stream":
    case "text":
      return "writing reply…"
    default:
      return event.event
  }
}

export function RemoteControlView(props: RemoteControlViewProps) {
  const chat = useChatStore()
  const org = useOrgStore()
  const renderer = useRenderer()
  const capabilities = getRuntimeCapabilities()

  // Terminal titles are plain text, so the dot's shape carries the state.
  createEffect(() => {
    switch (chat.connectionStatus()) {
      case "connected":
        renderer.setTerminalTitle("● Connected to Groupchat")
        break
      case "connecting":
        renderer.setTerminalTitle("○ Connecting to Groupchat…")
        break
      default:
        renderer.setTerminalTitle("○ Disconnected from Groupchat")
    }
  })

  // 1s tick drives the elapsed counters on active runs.
  const [now, setNow] = createSignal(Date.now())
  const ticker = setInterval(() => setNow(Date.now()), 1000)
  onCleanup(() => clearInterval(ticker))

  const connection = createMemo(() => {
    switch (chat.connectionStatus()) {
      case "connected":
        return { color: PRESENCE.online, label: "remote online" }
      case "connecting":
        return { color: BUSY_COLOR, label: "connecting…" }
      default:
        return { color: ERROR_COLOR, label: "remote offline" }
    }
  })

  const identity = createMemo(() => {
    const username = chat.username()
    const orgSlug = org.currentOrg()
    if (!username) return ""
    return orgSlug ? ` — ${username} @ ${orgSlug}` : ` — ${username}`
  })

  const panelWidth = () => Math.max(30, Math.min(PANEL_WIDTH, props.width - 4))
  const lineWidth = () => panelWidth() - 6

  return (
    <box flexDirection="column" paddingTop={(props.topPadding ?? 0) + 1} paddingLeft={2}>
      <box
        border
        borderColor="#444444"
        flexDirection="column"
        width={panelWidth()}
        paddingLeft={1}
        paddingRight={1}
      >
        <text>
          <strong>groupchat</strong>
          <span style={{ fg: DIM }}> · remote control</span>
        </text>
        <text> </text>

        <text>
          <span style={{ fg: connection().color }}>●</span> {connection().label}
          <span style={{ fg: DIM }}>{identity()}</span>
        </text>
        <Show
          when={capabilities.hasCodex}
          fallback={
            <text>
              <span style={{ fg: ERROR_COLOR }}>●</span> codex not found in PATH
              <span style={{ fg: DIM }}> — install codex to serve @mentions</span>
            </text>
          }
        >
          <text>
            <span style={{ fg: PRESENCE.online }}>●</span> codex available
            <span style={{ fg: DIM }}> {truncate(capabilities.codexPath ?? "", lineWidth() - 18)}</span>
          </text>
        </Show>
        <text> </text>

        <Show
          when={remoteActiveRuns().length > 0}
          fallback={
            <text>
              <span style={{ fg: FAINT }}>▸</span>
              <span style={{ fg: DIM }}> working in </span>
              {truncateStart(workspaceLabel(), lineWidth() - 12)}
            </text>
          }
        >
          <For each={remoteActiveRuns()}>
            {(run: RemoteRunInfo) => (
              <box flexDirection="column">
                <text>
                  <span style={{ fg: BUSY_COLOR }}>▶</span> responding to <strong>@{run.agentName}</strong> in{" "}
                  {prettyRoom(run.room)}
                  <span style={{ fg: DIM }}> ({formatElapsed(run.startedAt, now())})</span>
                </text>
                <text fg={DIM}>{"  "}{truncate(firstLine(run.prompt), lineWidth())}</text>
                <Show when={run.lastEvent}>
                  <text fg={FAINT}>
                    {"  "}
                    {truncate(describeEvent(run.lastEvent!), lineWidth())}
                  </text>
                </Show>
              </box>
            )}
          </For>
        </Show>

        <Show when={remoteRecentRuns().length > 0}>
          <text> </text>
          <text fg={DIM}>recent</text>
          <For each={remoteRecentRuns()}>
            {(run: RemoteRunInfo) => (
              <text>
                <span style={{ fg: run.status === "completed" ? PRESENCE.online : ERROR_COLOR }}>
                  {run.status === "completed" ? "✓" : "✗"}
                </span>{" "}
                @{run.agentName} in {prettyRoom(run.room)}
                <span style={{ fg: FAINT }}>
                  {" "}
                  {truncate(
                    run.status === "failed" && run.error
                      ? `— ${firstLine(run.error)}`
                      : `— ${firstLine(run.prompt)}`,
                    Math.max(8, lineWidth() - run.agentName.length - prettyRoom(run.room).length - 6)
                  )}
                </span>
              </text>
            )}
          </For>
        </Show>

        <text> </text>
        <text fg={FAINT}>Ctrl+C exit · Ctrl+O logout</text>
      </box>
    </box>
  )
}

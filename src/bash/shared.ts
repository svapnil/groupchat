// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import type { BashCommandStatus, BashEventMetadata, Message } from "../lib/types"

export const BASH_MODE_COLOR = "#FF4FA3"
export const BASH_PROMPT_WIRE_TYPE = "bash_prompt" as const
export const BASH_OUTPUT_WIRE_TYPE = "bash_output" as const
export const BASH_RUNNING_LABEL = "Running.."
export const MAX_BASH_MESSAGE_CHARS = 4000

const VALID_BASH_EVENTS = new Set(["prompt", "output"])
const VALID_BASH_STATUSES = new Set(["running", "completed", "failed"])
const ANSI_ESCAPE_REGEX = /\u001B\[[0-9;?]*[ -/]*[@-~]|\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g
const BASH_OUTPUT_TRUNCATED_SUFFIX = "\n...[truncated]"

export function isBashPrefixedMessage(value: string): boolean {
  return value.startsWith("!")
}

export function extractBashCommand(value: string): string | null {
  if (!isBashPrefixedMessage(value)) return null

  const command = value.slice(1).trim()
  return command.length > 0 ? command : null
}

export function normalizeBashMetadata(metadata: BashEventMetadata): BashEventMetadata {
  return {
    command_id: metadata.command_id,
    event: metadata.event,
    status: typeof metadata.status === "string" ? metadata.status : undefined,
    exit_code: typeof metadata.exit_code === "number" ? metadata.exit_code : undefined,
    cwd: typeof metadata.cwd === "string" ? metadata.cwd : undefined,
  }
}

export function getBashMetadata(message: Message): BashEventMetadata | null {
  const bash = message.attributes?.bash
  if (!bash || typeof bash !== "object") return null

  const metadata = bash as BashEventMetadata
  if (typeof metadata.command_id !== "string" || metadata.command_id.trim().length === 0) return null
  if (!VALID_BASH_EVENTS.has(metadata.event)) return null
  if (metadata.status && !VALID_BASH_STATUSES.has(metadata.status)) return null
  if (metadata.exit_code !== undefined && (!Number.isInteger(metadata.exit_code) || metadata.exit_code < 0)) return null

  return {
    ...normalizeBashMetadata(metadata),
    events: Array.isArray(metadata.events)
      ? metadata.events
          .filter((event): event is BashEventMetadata => {
            return Boolean(
              event &&
              typeof event.command_id === "string" &&
              VALID_BASH_EVENTS.has(event.event) &&
              (!event.status || VALID_BASH_STATUSES.has(event.status))
            )
          })
          .map(normalizeBashMetadata)
      : undefined,
    contents: Array.isArray(metadata.contents)
      ? metadata.contents.map((entry) => (typeof entry === "string" ? entry : ""))
      : undefined,
  }
}

export function getBashEventTimeline(message: Message): { events: BashEventMetadata[]; contents: string[] } {
  const metadata = getBashMetadata(message)
  if (!metadata) {
    return { events: [], contents: [] }
  }

  const events = Array.isArray(metadata.events) && metadata.events.length > 0
    ? metadata.events
        .filter((event): event is BashEventMetadata => {
          return Boolean(
            event &&
            typeof event.command_id === "string" &&
            VALID_BASH_EVENTS.has(event.event) &&
            (!event.status || VALID_BASH_STATUSES.has(event.status))
          )
        })
        .map(normalizeBashMetadata)
    : [normalizeBashMetadata(metadata)]

  const contents = Array.isArray(metadata.contents)
    ? metadata.contents.map((entry) => (typeof entry === "string" ? entry : ""))
    : [message.content ?? ""]

  while (contents.length < events.length) {
    contents.push("")
  }
  if (contents.length > events.length) {
    contents.splice(events.length)
  }

  return { events, contents }
}

export function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE_REGEX, "")
}

export function normalizeBashOutput(text: string, maxChars = MAX_BASH_MESSAGE_CHARS): string {
  const normalized = stripAnsi(text)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trimEnd()

  if (normalized.length <= maxChars) return normalized

  const keep = Math.max(0, maxChars - BASH_OUTPUT_TRUNCATED_SUFFIX.length)
  return `${normalized.slice(0, keep)}${BASH_OUTPUT_TRUNCATED_SUFFIX}`
}

export function buildBashResultContent(
  stdout: string,
  stderr: string,
  exitCode: number,
): { content: string; status: BashCommandStatus } {
  const merged = [stdout, stderr].filter((part) => part.length > 0).join(stdout && stderr ? "\n" : "")
  const normalized = normalizeBashOutput(merged)

  if (normalized.length > 0) {
    return {
      content: normalized,
      status: exitCode === 0 ? "completed" : "failed",
    }
  }

  if (exitCode === 0) {
    return {
      content: "",
      status: "completed",
    }
  }

  return {
    content: `Command exited with code ${exitCode}`,
    status: "failed",
  }
}

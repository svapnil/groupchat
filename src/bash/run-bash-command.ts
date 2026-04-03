// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { $ } from "bun"
import { randomUUID } from "node:crypto"
import type { BashEventMetadata } from "../lib/types"
import {
  BASH_OUTPUT_WIRE_TYPE,
  BASH_PROMPT_WIRE_TYPE,
  buildBashResultContent,
  extractBashCommand,
  normalizeBashOutput,
} from "./shared"

export type SendBashEvent = (
  type: typeof BASH_PROMPT_WIRE_TYPE | typeof BASH_OUTPUT_WIRE_TYPE,
  content: string,
  metadata: BashEventMetadata,
) => Promise<unknown>

export type StartBashCommandOptions = {
  message: string
  cwd?: string
  sendEvent: SendBashEvent
  onBackgroundError?: (error: unknown) => void
}

function toUtf8String(value: unknown): string {
  if (typeof value === "string") return value
  if (value instanceof Uint8Array) {
    return new TextDecoder().decode(value)
  }
  if (value == null) return ""
  return String(value)
}

async function finishBashCommand(
  command: string,
  commandId: string,
  cwd: string,
  sendEvent: SendBashEvent,
): Promise<void> {
  try {
    const result = await $`${{ raw: command }}`.cwd(cwd).nothrow().quiet()
    const stdout = toUtf8String(result.stdout)
    const stderr = toUtf8String(result.stderr)
    const exitCode = typeof result.exitCode === "number" ? result.exitCode : 1
    const finalResult = buildBashResultContent(stdout, stderr, exitCode)

    await sendEvent(BASH_OUTPUT_WIRE_TYPE, finalResult.content, {
      command_id: commandId,
      event: "output",
      status: finalResult.status,
      exit_code: exitCode,
      cwd,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    await sendEvent(BASH_OUTPUT_WIRE_TYPE, normalizeBashOutput(message), {
      command_id: commandId,
      event: "output",
      status: "failed",
      exit_code: 1,
      cwd,
    })
  }
}

export async function startBashCommand(options: StartBashCommandOptions): Promise<boolean> {
  const command = extractBashCommand(options.message)
  if (!command) return false

  const cwd = options.cwd || process.cwd()
  const commandId = randomUUID()

  await options.sendEvent(BASH_PROMPT_WIRE_TYPE, command, {
    command_id: commandId,
    event: "prompt",
    cwd,
  })

  await options.sendEvent(BASH_OUTPUT_WIRE_TYPE, "", {
    command_id: commandId,
    event: "output",
    status: "running",
    cwd,
  })

  void finishBashCommand(command, commandId, cwd, options.sendEvent).catch((error) => {
    options.onBackgroundError?.(error)
  })

  return true
}

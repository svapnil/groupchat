// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import type { CodexMessageMetadata, Message } from "../../lib/types"
import {
  contentToLines,
  getToolLabel,
  getToolOneLiner,
  groupClaudeBlocks,
} from "../claude/helpers"

export {
  contentToLines,
  getToolLabel,
  getToolOneLiner,
  groupClaudeBlocks,
}

export function getCodexMetadata(message: Message): CodexMessageMetadata | null {
  if (message.type !== "codex-response") return null
  if (!message.attributes?.codex) return null
  return message.attributes.codex
}

export function buildCodexDepthMap(messages: Message[]): Map<string, number> {
  const taskParentByTaskId = new Map<string, string | null>()

  for (const message of messages) {
    const codex = getCodexMetadata(message)
    if (!codex) continue
    for (const block of codex.contentBlocks) {
      if (block.type === "tool_use" && block.name === "Task") {
        taskParentByTaskId.set(block.id, codex.parentToolUseId ?? null)
      }
    }
  }

  const depthCache = new Map<string, number>()
  const resolveDepthFromTaskId = (taskId: string, trail: Set<string>): number => {
    const cached = depthCache.get(taskId)
    if (cached !== undefined) return cached
    if (trail.has(taskId)) return 1

    trail.add(taskId)
    const parentTaskId = taskParentByTaskId.get(taskId)
    const depth = parentTaskId ? 1 + resolveDepthFromTaskId(parentTaskId, trail) : 1
    depthCache.set(taskId, depth)
    trail.delete(taskId)
    return depth
  }

  const messageDepthById = new Map<string, number>()
  for (const message of messages) {
    const codex = getCodexMetadata(message)
    if (!codex) continue
    if (!codex.parentToolUseId) {
      messageDepthById.set(message.id, 0)
      continue
    }
    messageDepthById.set(
      message.id,
      resolveDepthFromTaskId(codex.parentToolUseId, new Set<string>())
    )
  }

  return messageDepthById
}

import type { ClaudeContentBlock, ClaudeMessageMetadata, ClaudePermissionRequest, Message } from "./types"
import { compactJson, shortenPath, truncate } from "./utils"

export function getClaudeMetadata(message: Message): ClaudeMessageMetadata | null {
  if (message.type !== "claude-response") return null
  if (!message.attributes?.claude) return null
  return message.attributes.claude
}

export function getPermissionOneLiner(permission: ClaudePermissionRequest): string {
  const { toolName, input } = permission
  switch (toolName) {
    case "Bash":
      if (typeof input.command === "string") return `$ ${truncate(input.command, 80)}`
      return "Run a command"
    case "Read":
      if (typeof input.file_path === "string") return `Read ${shortenPath(input.file_path)}`
      return "Read a file"
    case "Edit":
      if (typeof input.file_path === "string") return `Edit ${shortenPath(input.file_path)}`
      return "Edit a file"
    case "Write":
      if (typeof input.file_path === "string") return `Write ${shortenPath(input.file_path)}`
      return "Write a file"
    case "Grep":
      if (typeof input.pattern === "string") return `Search for "${truncate(input.pattern, 40)}"`
      return "Search file contents"
    case "Glob":
      if (typeof input.pattern === "string") return `Find files matching ${truncate(input.pattern, 40)}`
      return "Find files"
    case "WebFetch":
      if (typeof input.url === "string") return `Fetch ${truncate(input.url, 60)}`
      return "Fetch a URL"
    case "Task":
      if (typeof input.description === "string") return `Spawn agent: ${truncate(input.description, 50)}`
      return "Spawn a sub-agent"
    default:
      return `${toolName}(${compactJson(input, 60)})`
  }
}

export function getToolOneLiner(name: string, items: Array<{ id: string; input: Record<string, unknown> }>): string {
  const count = items.length

  switch (name) {
    case "Bash": {
      if (count === 1 && typeof items[0].input.command === "string") {
        return `Bash(${truncate(items[0].input.command, 60)})`
      }
      return `Bash (${count} commands)`
    }
    case "Read": {
      if (count === 1 && typeof items[0].input.file_path === "string") {
        return `Read(${shortenPath(items[0].input.file_path)})`
      }
      return `Read ${count} files`
    }
    case "Edit": {
      if (count === 1 && typeof items[0].input.file_path === "string") {
        return `Update(${shortenPath(items[0].input.file_path)})`
      }
      return `Updated ${count} files`
    }
    case "Write": {
      if (count === 1 && typeof items[0].input.file_path === "string") {
        return `Write(${shortenPath(items[0].input.file_path)})`
      }
      return `Wrote ${count} files`
    }
    case "Grep": {
      if (count === 1 && typeof items[0].input.pattern === "string") {
        return `Searched for "${truncate(items[0].input.pattern, 40)}"`
      }
      return `Searched for ${count} patterns`
    }
    case "Glob": {
      if (count === 1 && typeof items[0].input.pattern === "string") {
        return `Search(${truncate(items[0].input.pattern, 40)})`
      }
      return `Searched ${count} patterns`
    }
    case "WebSearch": {
      if (count === 1 && typeof items[0].input.query === "string") {
        return `WebSearch(${truncate(items[0].input.query, 40)})`
      }
      return `WebSearch (${count} queries)`
    }
    case "Task": {
      if (count === 1 && typeof items[0].input.description === "string") {
        return `Task(${truncate(items[0].input.description, 50)})`
      }
      return `Task (${count} sub-agents)`
    }
    default: {
      if (count === 1) return `${name}(${compactJson(items[0].input, 50)})`
      return `${name} (${count} calls)`
    }
  }
}

export function contentToLines(content: string): string[] {
  const lines = content.split("\n")
  return lines.length > 0 ? lines : [""]
}

export type GroupedClaudeBlock =
  | { kind: "content"; block: ClaudeContentBlock }
  | { kind: "tool_group"; name: string; items: Array<{ id: string; input: Record<string, unknown> }> }

export function groupClaudeBlocks(blocks: ClaudeContentBlock[]): GroupedClaudeBlock[] {
  const groups: GroupedClaudeBlock[] = []

  for (const block of blocks) {
    if (block.type === "tool_use") {
      const last = groups[groups.length - 1]
      if (last?.kind === "tool_group" && last.name === block.name) {
        last.items.push({ id: block.id, input: block.input })
      } else {
        groups.push({
          kind: "tool_group",
          name: block.name,
          items: [{ id: block.id, input: block.input }],
        })
      }
      continue
    }

    groups.push({ kind: "content", block })
  }

  return groups
}

export function buildClaudeDepthMap(messages: Message[]): Map<string, number> {
  const taskParentByTaskId = new Map<string, string | null>()

  for (const message of messages) {
    const claude = getClaudeMetadata(message)
    if (!claude) continue
    for (const block of claude.contentBlocks) {
      if (block.type === "tool_use" && block.name === "Task") {
        taskParentByTaskId.set(block.id, claude.parentToolUseId ?? null)
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
    const claude = getClaudeMetadata(message)
    if (!claude) continue
    if (!claude.parentToolUseId) {
      messageDepthById.set(message.id, 0)
      continue
    }
    messageDepthById.set(
      message.id,
      resolveDepthFromTaskId(claude.parentToolUseId, new Set<string>())
    )
  }

  return messageDepthById
}

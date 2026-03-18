// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import type {
  ClaudeAskUserQuestion,
  ClaudeAskUserQuestionOption,
  ClaudeContentBlock,
  ClaudeMessageMetadata,
  ClaudePermissionRequest,
  ClaudePermissionUpdate,
  Message,
} from "../../lib/types"
import { compactJson, shortenPath, truncate } from "../../lib/utils"

export function getClaudeMetadata(message: Message): ClaudeMessageMetadata | null {
  if (message.type !== "claude-response") return null
  if (!message.attributes?.claude) return null
  return message.attributes.claude
}

export function getPermissionOneLiner(permission: ClaudePermissionRequest): string {
  const { toolName, input } = permission
  switch (toolName) {
    case "AskUserQuestion":
      if (permission.askUserQuestion) {
        const current = permission.askUserQuestion.questions[permission.askUserQuestion.activeQuestionIndex]
        if (current?.question) return truncate(current.question, 80)
      }
      return "Answer a question"
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
    case "ExitPlanMode":
      return "Review and approve a plan"
    default:
      return `${toolName}(${compactJson(input, 60)})`
  }
}

export function getToolLabel(name: string): string {
  switch (name) {
    case "AskUserQuestion":
      return "Question"
    case "Bash":
      return "Terminal"
    case "Read":
      return "Read File"
    case "Write":
      return "Write File"
    case "Edit":
      return "Edit File"
    case "Glob":
      return "Find Files"
    case "Grep":
      return "Search Content"
    case "WebSearch":
      return "Web Search"
    case "WebFetch":
      return "Web Fetch"
    case "Task":
      return "Sub-agent"
    case "ExitPlanMode":
      return "Plan Approval"
    default:
      return name
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function normalizeQuestionOptions(value: unknown): ClaudeAskUserQuestionOption[] {
  if (!Array.isArray(value)) return []

  const options: ClaudeAskUserQuestionOption[] = []
  for (const option of value) {
    if (!isRecord(option)) continue
    const label = typeof option.label === "string" ? option.label.trim() : ""
    if (!label) continue
    options.push({
      label,
      description: typeof option.description === "string" ? option.description.trim() || undefined : undefined,
    })
  }
  return options
}

export function parseClaudeAskUserQuestionState(
  input: Record<string, unknown>,
): ClaudePermissionRequest["askUserQuestion"] | undefined {
  if (!Array.isArray(input.questions)) {
    const simpleQuestion = typeof input.question === "string" ? input.question.trim() : ""
    if (!simpleQuestion) return undefined
    return {
      questions: [
        {
          question: simpleQuestion,
          options: [],
          allowCustomInput: true,
        },
      ],
      answers: {},
      activeQuestionIndex: 0,
      customInputQuestionIndex: 0,
    }
  }

  const questions: ClaudeAskUserQuestion[] = []
  for (const question of input.questions) {
    if (!isRecord(question)) continue
    const prompt = typeof question.question === "string" ? question.question.trim() : ""
    const options = normalizeQuestionOptions(question.options)
    if (!prompt || options.length === 0) continue
    questions.push({
      header: typeof question.header === "string" ? question.header.trim() || undefined : undefined,
      question: prompt,
      options,
      allowCustomInput: true,
    })
  }

  if (questions.length === 0) return undefined

  return {
    questions,
    answers: {},
    activeQuestionIndex: 0,
    customInputQuestionIndex: null,
  }
}

function normalizePermissionRules(value: unknown): Array<{ toolName: string; ruleContent?: string }> {
  if (!Array.isArray(value)) return []

  const rules: Array<{ toolName: string; ruleContent?: string }> = []
  for (const rule of value) {
    if (!isRecord(rule) || typeof rule.toolName !== "string" || rule.toolName.trim().length === 0) continue
    rules.push({
      toolName: rule.toolName.trim(),
      ruleContent: typeof rule.ruleContent === "string" ? rule.ruleContent.trim() || undefined : undefined,
    })
  }
  return rules
}

function normalizePermissionUpdate(candidate: unknown): ClaudePermissionUpdate | null {
  if (!isRecord(candidate) || typeof candidate.type !== "string") return null

  const destination = candidate.destination
  if (destination !== "session" && destination !== "userSettings") return null

  switch (candidate.type) {
    case "addRules":
    case "replaceRules":
    case "removeRules": {
      const rules = normalizePermissionRules(candidate.rules)
      const behavior = candidate.behavior
      if (rules.length === 0 || (behavior !== "allow" && behavior !== "deny" && behavior !== "ask")) return null
      return {
        type: candidate.type,
        rules,
        behavior,
        destination,
      }
    }
    case "setMode":
      if (typeof candidate.mode !== "string" || candidate.mode.trim().length === 0) return null
      return {
        type: "setMode",
        mode: candidate.mode.trim(),
        destination,
      }
    case "addDirectories":
    case "removeDirectories": {
      if (!Array.isArray(candidate.directories)) return null
      const directories = candidate.directories
        .filter((directory): directory is string => typeof directory === "string" && directory.trim().length > 0)
        .map((directory) => directory.trim())
      if (directories.length === 0) return null
      return {
        type: candidate.type,
        directories,
        destination,
      }
    }
    default:
      return null
  }
}

export function normalizeClaudePermissionSuggestions(value: unknown): ClaudePermissionUpdate[] {
  if (!Array.isArray(value)) return []
  return value
    .map((candidate) => normalizePermissionUpdate(candidate))
    .filter((candidate): candidate is ClaudePermissionUpdate => candidate !== null)
}

export function getClaudePermissionSuggestionLabel(suggestion: ClaudePermissionUpdate): string {
  if (suggestion.type === "setMode") return `Set mode to "${suggestion.mode}"`

  const scope = suggestion.destination === "session" ? "for session" : "always"
  if (suggestion.type === "addRules" || suggestion.type === "replaceRules") {
    const rule = suggestion.rules[0]
    if (rule?.ruleContent) return `Allow "${rule.ruleContent}" ${scope}`
    if (rule?.toolName) return `Allow ${rule.toolName} ${scope}`
  }
  if (suggestion.type === "addDirectories") {
    return `Trust ${suggestion.directories[0] || "directory"} ${scope}`
  }

  return `Allow ${scope}`
}

export function getActiveClaudeAskUserQuestion(permission: Pick<ClaudePermissionRequest, "askUserQuestion">): ClaudeAskUserQuestion | null {
  const state = permission.askUserQuestion
  if (!state) return null
  return state.questions[state.activeQuestionIndex] ?? null
}

export function isClaudeAskUserQuestionAwaitingTextInput(
  permission: Pick<ClaudePermissionRequest, "askUserQuestion">,
): boolean {
  const state = permission.askUserQuestion
  if (!state) return false
  return state.customInputQuestionIndex === state.activeQuestionIndex
}

export type ClaudePermissionChoice =
  | { label: string; description?: string; action: { kind: "allow" } }
  | { label: string; description?: string; action: { kind: "deny" } }
  | { label: string; description?: string; action: { kind: "suggestion"; updatedPermissions: ClaudePermissionUpdate[] } }
  | { label: string; description?: string; action: { kind: "answer"; questionIndex: number; answer: string } }
  | { label: string; description?: string; action: { kind: "custom_input"; questionIndex: number } }

export function getClaudePermissionChoices(
  permission: Pick<ClaudePermissionRequest, "toolName" | "permissionSuggestions" | "askUserQuestion">,
): ClaudePermissionChoice[] {
  if (permission.toolName === "AskUserQuestion") {
    const state = permission.askUserQuestion
    const current = getActiveClaudeAskUserQuestion(permission)
    if (!state || !current) return []
    if (isClaudeAskUserQuestionAwaitingTextInput(permission)) return []
    return [
      ...current.options.map((option) => ({
        label: option.label,
        description: option.description,
        action: {
          kind: "answer",
          questionIndex: state.activeQuestionIndex,
          answer: option.label,
        },
      } satisfies ClaudePermissionChoice)),
      ...(current.allowCustomInput === false
        ? []
        : [{
            label: "Other...",
            action: {
              kind: "custom_input" as const,
              questionIndex: state.activeQuestionIndex,
            },
          } satisfies ClaudePermissionChoice]),
    ]
  }

  return [
    { label: "Allow", action: { kind: "allow" } },
    ...(permission.permissionSuggestions ?? []).map((suggestion) => ({
      label: getClaudePermissionSuggestionLabel(suggestion),
      action: {
        kind: "suggestion",
        updatedPermissions: [suggestion],
      },
    }) satisfies ClaudePermissionChoice),
    { label: "Deny", action: { kind: "deny" } },
  ]
}

export function getClaudePendingActionTitle(permission: Pick<ClaudePermissionRequest, "toolName">): string {
  return getToolLabel(permission.toolName)
}

export function getClaudePendingActionDescription(
  permission: Pick<ClaudePermissionRequest, "toolName" | "description" | "askUserQuestion">,
): string | undefined {
  if (permission.toolName === "AskUserQuestion") {
    return getActiveClaudeAskUserQuestion(permission)?.question
  }
  return permission.description
}

export function getClaudePendingActionHelperText(
  permission: Pick<ClaudePermissionRequest, "toolName" | "permissionSuggestions" | "askUserQuestion">,
): string {
  if (permission.toolName === "AskUserQuestion") {
    const state = permission.askUserQuestion
    const current = getActiveClaudeAskUserQuestion(permission)
    if (!state || !current) return "Answer the question in the message list."
    if (isClaudeAskUserQuestionAwaitingTextInput(permission)) {
      return "Type your answer and press Enter • Esc to go back"
    }
    const isLast = state.activeQuestionIndex >= state.questions.length - 1
    return isLast
      ? "↑/↓ select answer • Enter to submit"
      : "↑/↓ select answer • Enter for next question"
  }

  return permission.permissionSuggestions && permission.permissionSuggestions.length > 0
    ? "↑/↓ select action • Enter to confirm"
    : "↑/↓ select action • Enter to confirm"
}

export function getClaudePendingActionTextInput(
  permission: Pick<ClaudePermissionRequest, "toolName" | "askUserQuestion">,
): { placeholder?: string; helperText?: string } | undefined {
  if (permission.toolName !== "AskUserQuestion" || !isClaudeAskUserQuestionAwaitingTextInput(permission)) {
    return undefined
  }

  const current = getActiveClaudeAskUserQuestion(permission)
  if (!current) return undefined
  return {
    placeholder: "Type your answer...",
    helperText: "Type your answer and press Enter • Esc to go back",
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

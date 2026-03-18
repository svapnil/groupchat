// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { RGBA, SyntaxStyle } from "@opentui/core"
import { extname } from "node:path"
import { For, Show } from "solid-js"
import { sanitizeMessageMarkdown, sanitizePlainMessageText } from "../../../lib/content-sanitizer"
import { compactJson, shortenPath, truncate } from "../../../lib/utils"
import { getToolLabel, getToolOneLiner } from "../helpers"

export type ClaudeToolGroupItem = {
  id: string
  input: Record<string, unknown>
}

export type ClaudeToolDetailProps = {
  name: string
  input: Record<string, unknown>
  showHeader?: boolean
}

export type ClaudeToolGroupProps = {
  name: string
  items: ClaudeToolGroupItem[]
}

const codeSyntaxStyle = SyntaxStyle.fromStyles({
  "default": { fg: RGBA.fromHex("#D4D4D4") },
  "comment": { fg: RGBA.fromHex("#6A9955"), italic: true },
  "comment.line": { fg: RGBA.fromHex("#6A9955"), italic: true },
  "comment.block": { fg: RGBA.fromHex("#6A9955"), italic: true },
  "keyword": { fg: RGBA.fromHex("#569CD6") },
  "keyword.control": { fg: RGBA.fromHex("#C586C0") },
  "string": { fg: RGBA.fromHex("#CE9178") },
  "string.special": { fg: RGBA.fromHex("#D7BA7D") },
  "number": { fg: RGBA.fromHex("#B5CEA8") },
  "constant": { fg: RGBA.fromHex("#4FC1FF") },
  "constant.builtin": { fg: RGBA.fromHex("#4FC1FF") },
  "function": { fg: RGBA.fromHex("#DCDCAA") },
  "function.method": { fg: RGBA.fromHex("#DCDCAA") },
  "type": { fg: RGBA.fromHex("#4EC9B0") },
  "variable": { fg: RGBA.fromHex("#9CDCFE") },
  "property": { fg: RGBA.fromHex("#9CDCFE") },
  "tag": { fg: RGBA.fromHex("#569CD6") },
  "attribute": { fg: RGBA.fromHex("#92C5F8") },
  "operator": { fg: RGBA.fromHex("#D4D4D4") },
  "punctuation": { fg: RGBA.fromHex("#D4D4D4") },
})

const markdownSyntaxStyle = SyntaxStyle.fromStyles({
  "default": {},
  "conceal": { fg: RGBA.fromHex("#666666") },
  "markup.heading": { bold: true },
  "markup.strong": { bold: true },
  "markup.italic": { italic: true },
  "markup.raw": { fg: RGBA.fromHex("#B0B9F9") },
  "markup.link.label": { underline: true, fg: RGBA.fromHex("#57C7FF") },
  "markup.link.url": { dim: true, fg: RGBA.fromHex("#9AA0A6") },
  "punctuation.special": { dim: true },
  "markup.list": { dim: true },
})

function getToolPreview(name: string, input: Record<string, unknown>): string {
  if ((name === "Read" || name === "Write" || name === "Edit") && typeof input.file_path === "string") {
    return shortenPath(sanitizePlainMessageText(input.file_path))
  }

  if (name === "Bash" && typeof input.command === "string") {
    return truncate(sanitizePlainMessageText(input.command), 60)
  }

  if (name === "Grep" && typeof input.pattern === "string") {
    return truncate(sanitizePlainMessageText(input.pattern), 60)
  }

  if (name === "Glob" && typeof input.pattern === "string") {
    return truncate(sanitizePlainMessageText(input.pattern), 60)
  }

  if (name === "WebSearch" && typeof input.query === "string") {
    return truncate(sanitizePlainMessageText(input.query), 60)
  }

  if (name === "WebFetch" && typeof input.url === "string") {
    return truncate(sanitizePlainMessageText(input.url), 60)
  }

  if (name === "Task" && typeof input.description === "string") {
    return truncate(sanitizePlainMessageText(input.description), 60)
  }

  return ""
}

function getTextField(input: Record<string, unknown>, key: string): string {
  const value = input[key]
  return typeof value === "string" ? sanitizePlainMessageText(value) : ""
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function inferFiletype(filePath: string, fallback?: string): string | undefined {
  if (!filePath) return fallback

  switch (extname(filePath).toLowerCase()) {
    case ".ts":
    case ".tsx":
      return "typescript"
    case ".js":
    case ".jsx":
    case ".mjs":
    case ".cjs":
      return "javascript"
    case ".py":
      return "python"
    case ".rs":
      return "rust"
    case ".go":
      return "go"
    case ".json":
      return "json"
    case ".html":
    case ".htm":
      return "html"
    case ".css":
      return "css"
    case ".md":
      return "markdown"
    case ".sh":
    case ".bash":
    case ".zsh":
      return "bash"
    case ".yml":
    case ".yaml":
      return "yaml"
    default:
      return fallback
  }
}

function splitSnippetLines(text: string): string[] {
  if (!text) return []
  return text.replace(/\r\n/g, "\n").split("\n")
}

function countSharedPrefix(a: string[], b: string[]): number {
  let index = 0
  while (index < a.length && index < b.length && a[index] === b[index]) {
    index += 1
  }
  return index
}

function countSharedSuffix(a: string[], b: string[], prefixLength: number): number {
  let count = 0
  while (
    a.length - count - 1 >= prefixLength &&
    b.length - count - 1 >= prefixLength &&
    a[a.length - count - 1] === b[b.length - count - 1]
  ) {
    count += 1
  }
  return count
}

function formatUnifiedRange(start: number, count: number): string {
  return `${start},${count}`
}

function toPatchPath(filePath: string): string {
  const trimmed = filePath.trim()
  if (!trimmed) return "snippet"
  return trimmed.replace(/^\/+/, "")
}

function buildSnippetPatch(filePath: string, oldText: string, newText: string): string {
  const oldLines = splitSnippetLines(oldText)
  const newLines = splitSnippetLines(newText)
  const prefixLength = countSharedPrefix(oldLines, newLines)
  const suffixLength = countSharedSuffix(oldLines, newLines, prefixLength)

  const prefixLines = oldLines.slice(0, prefixLength)
  const suffixStart = suffixLength > 0 ? oldLines.length - suffixLength : oldLines.length
  const oldChanged = oldLines.slice(prefixLength, suffixStart)
  const newSuffixStart = suffixLength > 0 ? newLines.length - suffixLength : newLines.length
  const newChanged = newLines.slice(prefixLength, newSuffixStart)
  const suffixLines = oldLines.slice(suffixStart)

  const hunkLines = [
    ...prefixLines.map((line) => ` ${line}`),
    ...oldChanged.map((line) => `-${line}`),
    ...newChanged.map((line) => `+${line}`),
    ...suffixLines.map((line) => ` ${line}`),
  ]

  const patchPath = toPatchPath(filePath)
  const oldStart = oldLines.length > 0 ? 1 : 0
  const newStart = newLines.length > 0 ? 1 : 0

  return [
    `--- a/${patchPath}`,
    `+++ b/${patchPath}`,
    `@@ -${formatUnifiedRange(oldStart, oldLines.length)} +${formatUnifiedRange(newStart, newLines.length)} @@`,
    ...hunkLines,
  ].join("\n")
}

function JsonFallback(props: { input: Record<string, unknown> }) {
  const content = sanitizePlainMessageText(JSON.stringify(props.input, null, 2) ?? compactJson(props.input, 200))
  return (
    <box border borderStyle="single" borderColor="#333333" paddingLeft={1} paddingRight={1}>
      <code
        content={content}
        filetype="json"
        syntaxStyle={codeSyntaxStyle}
        wrapMode="char"
        width="100%"
      />
    </box>
  )
}

function CodePanel(props: { filePath?: string; content: string; filetype?: string }) {
  const filePath = props.filePath ? sanitizePlainMessageText(props.filePath) : ""
  const content = sanitizePlainMessageText(props.content)
  return (
    <box flexDirection="column" width="100%">
      <Show when={filePath}>
        <text fg="#888888">{filePath}</text>
      </Show>
      <box border borderStyle="single" borderColor="#333333" paddingLeft={1} paddingRight={1}>
        <code
          content={content}
          filetype={props.filetype ?? inferFiletype(filePath)}
          syntaxStyle={codeSyntaxStyle}
          wrapMode="char"
          width="100%"
        />
      </box>
    </box>
  )
}

function DiffPanel(props: { filePath?: string; oldText: string; newText: string }) {
  const filePath = props.filePath ? sanitizePlainMessageText(props.filePath) : ""
  const diff = buildSnippetPatch(filePath, sanitizePlainMessageText(props.oldText), sanitizePlainMessageText(props.newText))
  return (
    <box flexDirection="column" width="100%">
      <Show when={filePath}>
        <text fg="#888888">{filePath}</text>
      </Show>
      <box border borderStyle="single" borderColor="#333333" paddingLeft={1} paddingRight={1}>
        <diff
          diff={diff}
          view="unified"
          filetype={inferFiletype(filePath)}
          syntaxStyle={codeSyntaxStyle}
          showLineNumbers
          wrapMode="char"
          width="100%"
        />
      </box>
    </box>
  )
}

function BashDetail(props: { input: Record<string, unknown> }) {
  const description = getTextField(props.input, "description")
  const command = getTextField(props.input, "command")
  const timeout = props.input.timeout

  return (
    <box flexDirection="column">
      <Show when={description}>
        <text fg="#888888"><em>{description}</em></text>
      </Show>
      <Show when={command}>
        <CodePanel content={`$ ${command}`} filetype="bash" />
      </Show>
      <Show when={timeout !== undefined && timeout !== null}>
        <text fg="#888888">{`timeout: ${sanitizePlainMessageText(String(timeout))}ms`}</text>
      </Show>
    </box>
  )
}

function EditDetail(props: { input: Record<string, unknown> }) {
  const filePath = getTextField(props.input, "file_path")
  const oldText = getTextField(props.input, "old_string")
  const newText = getTextField(props.input, "new_string")
  const rawChanges = Array.isArray(props.input.changes)
    ? props.input.changes as Array<{ path?: unknown; kind?: unknown }>
    : []
  const changes = rawChanges
    .map((change) => ({
      path: typeof change.path === "string" ? sanitizePlainMessageText(change.path) : "",
      kind: typeof change.kind === "string" ? sanitizePlainMessageText(change.kind) : "update",
    }))
    .filter((change) => change.path.length > 0)

  return (
    <box flexDirection="column">
      <Show when={Boolean(props.input.replace_all)}>
        <text fg="#FFA500">replace all</text>
      </Show>

      <Show when={oldText.length > 0 || newText.length > 0}>
        <DiffPanel filePath={filePath} oldText={oldText} newText={newText} />
      </Show>

      <Show when={oldText.length === 0 && newText.length === 0 && changes.length > 0}>
        <box flexDirection="column">
          <Show when={filePath}>
            <text fg="#888888">{filePath}</text>
          </Show>
          <For each={changes}>
            {(change) => (
              <box flexDirection="row">
                <text fg="#57C7FF">{`${change.kind}: `}</text>
                <text fg="#BBBBBB">{change.path}</text>
              </box>
            )}
          </For>
        </box>
      </Show>

      <Show when={oldText.length === 0 && newText.length === 0 && changes.length === 0}>
        <JsonFallback input={props.input} />
      </Show>
    </box>
  )
}

function WriteDetail(props: { input: Record<string, unknown> }) {
  const filePath = getTextField(props.input, "file_path")
  const content = getTextField(props.input, "content")
  if (!content) return <JsonFallback input={props.input} />
  return <CodePanel filePath={filePath} content={content} />
}

function ReadDetail(props: { input: Record<string, unknown> }) {
  const filePath = getTextField(props.input, "file_path") || getTextField(props.input, "path")
  const offset = props.input.offset
  const limit = props.input.limit
  return (
    <box flexDirection="column">
      <Show when={filePath}>
        <text fg="#BBBBBB">{filePath}</text>
      </Show>
      <Show when={offset !== undefined || limit !== undefined}>
        <text fg="#888888">
          {[
            offset !== undefined ? `offset: ${sanitizePlainMessageText(String(offset))}` : "",
            limit !== undefined ? `limit: ${sanitizePlainMessageText(String(limit))}` : "",
          ].filter(Boolean).join(" • ")}
        </text>
      </Show>
    </box>
  )
}

function GlobDetail(props: { input: Record<string, unknown> }) {
  const pattern = getTextField(props.input, "pattern")
  const path = getTextField(props.input, "path")
  return (
    <box flexDirection="column">
      <Show when={pattern}>
        <CodePanel content={pattern} filetype="bash" />
      </Show>
      <Show when={path}>
        <text fg="#888888">{`in: ${path}`}</text>
      </Show>
    </box>
  )
}

function GrepDetail(props: { input: Record<string, unknown> }) {
  const pattern = getTextField(props.input, "pattern")
  const path = getTextField(props.input, "path")
  const glob = getTextField(props.input, "glob")
  const outputMode = getTextField(props.input, "output_mode")
  const context = props.input.context
  const limit = props.input.head_limit

  return (
    <box flexDirection="column">
      <Show when={pattern}>
        <CodePanel content={pattern} filetype="bash" />
      </Show>
      <text fg="#888888">
        {[
          path ? `path: ${path}` : "",
          glob ? `glob: ${glob}` : "",
          outputMode ? `mode: ${outputMode}` : "",
          context !== undefined ? `context: ${sanitizePlainMessageText(String(context))}` : "",
          limit !== undefined ? `limit: ${sanitizePlainMessageText(String(limit))}` : "",
        ].filter(Boolean).join(" • ")}
      </text>
    </box>
  )
}

function WebSearchDetail(props: { input: Record<string, unknown> }) {
  const query = getTextField(props.input, "query")
  const domains = Array.isArray(props.input.allowed_domains)
    ? props.input.allowed_domains
        .filter((domain): domain is string => typeof domain === "string")
        .map((domain) => sanitizePlainMessageText(domain))
    : []

  return (
    <box flexDirection="column">
      <Show when={query}>
        <text fg="#FFFFFF">{query}</text>
      </Show>
      <Show when={domains.length > 0}>
        <text fg="#888888">{`domains: ${domains.join(", ")}`}</text>
      </Show>
    </box>
  )
}

function WebFetchDetail(props: { input: Record<string, unknown> }) {
  const url = getTextField(props.input, "url")
  const prompt = getTextField(props.input, "prompt")
  return (
    <box flexDirection="column">
      <Show when={url}>
        <text fg="#57C7FF">{url}</text>
      </Show>
      <Show when={prompt}>
        <text fg="#888888"><em>{prompt}</em></text>
      </Show>
    </box>
  )
}

function TaskDetail(props: { input: Record<string, unknown> }) {
  const description = getTextField(props.input, "description")
  const subagentType = getTextField(props.input, "subagent_type")
  const prompt = getTextField(props.input, "prompt")
  return (
    <box flexDirection="column">
      <Show when={description}>
        <text fg="#FFFFFF">{description}</text>
      </Show>
      <Show when={subagentType}>
        <text fg="#57C7FF">{subagentType}</text>
      </Show>
      <Show when={prompt}>
        <CodePanel content={prompt} filetype="markdown" />
      </Show>
    </box>
  )
}

function ExitPlanModeDetail(props: { input: Record<string, unknown> }) {
  const plan = getTextField(props.input, "plan")
  const allowedPrompts = Array.isArray(props.input.allowedPrompts)
    ? props.input.allowedPrompts
        .filter((prompt): prompt is Record<string, unknown> => isRecord(prompt))
        .map((prompt) => ({
          tool: typeof prompt.tool === "string" ? sanitizePlainMessageText(prompt.tool) : "",
          prompt: typeof prompt.prompt === "string" ? sanitizePlainMessageText(prompt.prompt) : "",
        }))
        .filter((prompt) => prompt.tool.length > 0 || prompt.prompt.length > 0)
    : []

  return (
    <box flexDirection="column">
      <Show when={plan}>
        <box flexDirection="column">
          <text fg="#57C7FF">Plan</text>
          <box paddingLeft={1}>
            <markdown
              content={sanitizeMessageMarkdown(plan)}
              syntaxStyle={markdownSyntaxStyle}
              conceal
              width="100%"
            />
          </box>
        </box>
      </Show>
      <Show when={allowedPrompts.length > 0}>
        <box flexDirection="column" marginTop={plan ? 1 : 0}>
          <text fg="#888888">Requested permissions</text>
          <For each={allowedPrompts}>
            {(allowed) => (
              <box flexDirection="row">
                <text fg="#57C7FF">{allowed.tool || "Tool"}</text>
                <Show when={allowed.prompt}>
                  <text fg="#BBBBBB">{` ${allowed.prompt}`}</text>
                </Show>
              </box>
            )}
          </For>
        </box>
      </Show>
      <Show when={!plan && allowedPrompts.length === 0}>
        <text fg="#888888">Plan approval requested</text>
      </Show>
    </box>
  )
}

function ClaudeToolDetailBody(props: { name: string; input: Record<string, unknown> }) {
  switch (props.name) {
    case "Bash":
      return <BashDetail input={props.input} />
    case "Edit":
      return <EditDetail input={props.input} />
    case "Write":
      return <WriteDetail input={props.input} />
    case "Read":
      return <ReadDetail input={props.input} />
    case "Glob":
      return <GlobDetail input={props.input} />
    case "Grep":
      return <GrepDetail input={props.input} />
    case "WebSearch":
      return <WebSearchDetail input={props.input} />
    case "WebFetch":
      return <WebFetchDetail input={props.input} />
    case "Task":
      return <TaskDetail input={props.input} />
    case "ExitPlanMode":
      return <ExitPlanModeDetail input={props.input} />
    default:
      return <JsonFallback input={props.input} />
  }
}

export function ClaudeToolDetail(props: ClaudeToolDetailProps) {
  const showHeader = props.showHeader ?? true
  const label = getToolLabel(props.name)
  const preview = getToolPreview(props.name, props.input)

  return (
    <box flexDirection="column">
      <Show when={showHeader}>
        <box flexDirection="row">
          <text fg="green">⏺ </text>
          <text fg="#FFFFFF">{label}</text>
          <Show when={preview}>
            <text fg="#888888">{` ${preview}`}</text>
          </Show>
        </box>
      </Show>
      <box flexDirection="column" paddingLeft={showHeader ? 2 : 0}>
        <ClaudeToolDetailBody name={props.name} input={props.input} />
      </box>
    </box>
  )
}

export function ClaudeToolGroup(props: ClaudeToolGroupProps) {
  if (props.items.length === 1) {
    return <ClaudeToolDetail name={props.name} input={props.items[0].input} />
  }

  const shouldExpand = props.name === "Edit" || props.name === "Write"
  return (
    <box flexDirection="column">
      <box flexDirection="row">
        <text fg="green">⏺ </text>
        <text fg="#FFFFFF">{sanitizePlainMessageText(getToolOneLiner(props.name, props.items))}</text>
      </box>
      <Show when={shouldExpand}>
        <box flexDirection="column" paddingLeft={2}>
          <For each={props.items}>
            {(item, index) => (
              <box flexDirection="column" marginTop={index() > 0 ? 1 : 0}>
                <ClaudeToolDetail name={props.name} input={item.input} showHeader={false} />
              </box>
            )}
          </For>
        </box>
      </Show>
    </box>
  )
}

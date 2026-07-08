#!/usr/bin/env bun
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { mkdirSync, createWriteStream } from "node:fs"
import { dirname, resolve } from "node:path"
import { randomUUID } from "node:crypto"

type Options = {
  out: string
  prompt: string
  claudeBin: string
  timeoutMs: number
  autoAllow: boolean
  includePartialMessages: boolean
  interruptOnCanUseTool: boolean
  model?: string
  permissionMode?: string
}

function printUsage() {
  console.log(
    [
      "Usage:",
      "  bun run scripts/claude/capture-ndjson.ts --out <file.ndjson> [options]",
      "",
      "Options:",
      "  --out <path>                Required output file",
      "  --prompt <text>             Initial user prompt",
      "  --claude-bin <path|name>    Claude executable (default: claude)",
      "  --timeout-ms <ms>           Timeout (default: 120000)",
      "  --model <name>              Optional --model value for Claude",
      "  --permission-mode <mode>    Optional --permission-mode value",
      "  --include-partial-messages  Pass --include-partial-messages to Claude",
      "  --interrupt-on-can-use-tool Send interrupt after first can_use_tool request",
      "  --no-auto-allow             Do not auto-allow can_use_tool requests",
      "",
      "Example:",
      "  bun run scripts/claude/capture-ndjson.ts \\",
      "    --out test/claude/fixtures/real-websearch-and-bash.ndjson \\",
      "    --prompt \"Use WebSearch twice, then run Bash: sleep 6 && echo done.\"",
    ].join("\n")
  )
}

function parseArgs(argv: string[]): Options | null {
  const opts: Options = {
    out: "",
    prompt: "Inspect this project and summarize what you changed.",
    claudeBin: "claude",
    timeoutMs: 120000,
    autoAllow: true,
    includePartialMessages: false,
    interruptOnCanUseTool: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--help" || arg === "-h") {
      printUsage()
      return null
    }
    if (arg === "--out") {
      opts.out = argv[i + 1] || ""
      i += 1
      continue
    }
    if (arg === "--prompt") {
      opts.prompt = argv[i + 1] || opts.prompt
      i += 1
      continue
    }
    if (arg === "--claude-bin") {
      opts.claudeBin = argv[i + 1] || opts.claudeBin
      i += 1
      continue
    }
    if (arg === "--timeout-ms") {
      const parsed = Number(argv[i + 1])
      if (Number.isFinite(parsed) && parsed > 0) {
        opts.timeoutMs = Math.floor(parsed)
      }
      i += 1
      continue
    }
    if (arg === "--model") {
      opts.model = argv[i + 1]
      i += 1
      continue
    }
    if (arg === "--permission-mode") {
      opts.permissionMode = argv[i + 1]
      i += 1
      continue
    }
    if (arg === "--include-partial-messages") {
      opts.includePartialMessages = true
      continue
    }
    if (arg === "--interrupt-on-can-use-tool") {
      opts.interruptOnCanUseTool = true
      continue
    }
    if (arg === "--no-auto-allow") {
      opts.autoAllow = false
      continue
    }
  }

  if (!opts.out) {
    console.error("Missing required --out")
    printUsage()
    process.exit(1)
  }

  return opts
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null) return value as Record<string, unknown>
  return null
}

const options = parseArgs(process.argv.slice(2))
if (!options) {
  process.exit(0)
}

const outputPath = resolve(options.out)
mkdirSync(dirname(outputPath), { recursive: true })
const output = createWriteStream(outputPath, { flags: "w", encoding: "utf8" })

let server: Bun.Server | null = null
let socket: import("bun").ServerWebSocket | null = null
let processHandle: Bun.Subprocess | null = null
let wsBuffer = ""
let sdkSessionId = ""
let wroteLines = 0
let finished = false
let sentInitialPrompt = false
let stdoutTail = ""
let stderrTail = ""
let sentInterruptAfterPermission = false

function writeRawChunk(raw: string) {
  output.write(raw)
}

function sendLine(payload: unknown) {
  if (!socket) return
  socket.send(`${JSON.stringify(payload)}\n`)
}

function appendTail(previous: string, chunk: string, maxChars = 4000): string {
  const merged = previous + chunk
  if (merged.length <= maxChars) return merged
  return merged.slice(merged.length - maxChars)
}

function sendInitialPromptIfNeeded() {
  if (sentInitialPrompt) return
  sentInitialPrompt = true
  sendLine({
    type: "user",
    message: { role: "user", content: options.prompt },
    parent_tool_use_id: null,
    session_id: sdkSessionId || "",
  })
}

function handleParsedLine(line: string) {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return
  }

  const msg = asRecord(parsed)
  if (!msg) return

  const type = typeof msg.type === "string" ? msg.type : ""

  if (type === "system" && msg.subtype === "init") {
    sdkSessionId = typeof msg.session_id === "string" ? msg.session_id : ""
    sendInitialPromptIfNeeded()
    return
  }

  if (type === "control_request" && options.autoAllow) {
    const request = asRecord(msg.request)
    if (request?.subtype === "can_use_tool" && typeof msg.request_id === "string") {
      const input = asRecord(request.input) || {}
      sendLine({
        type: "control_response",
        response: {
          subtype: "success",
          request_id: msg.request_id,
          response: {
            behavior: "allow",
            updatedInput: input,
          },
        },
      })
    }
    return
  }

  if (type === "control_request" && options.interruptOnCanUseTool) {
    const request = asRecord(msg.request)
    if (request?.subtype === "can_use_tool" && !sentInterruptAfterPermission) {
      sentInterruptAfterPermission = true
      sendLine({
        type: "control_request",
        request_id: randomUUID(),
        request: { subtype: "interrupt" },
      })
    }
    return
  }

  if (type === "result") {
    finish(0)
  }
}

function parseChunk(raw: string) {
  wsBuffer += raw
  while (true) {
    const idx = wsBuffer.indexOf("\n")
    if (idx === -1) break
    const line = wsBuffer.slice(0, idx).trim()
    wsBuffer = wsBuffer.slice(idx + 1)
    if (!line) continue
    wroteLines += 1
    handleParsedLine(line)
  }
}

function finish(code: number) {
  if (finished) return
  finished = true

  try {
    socket?.close()
  } catch {}

  try {
    processHandle?.kill("SIGTERM")
  } catch {}

  try {
    server?.stop(true)
  } catch {}

  output.end(() => {
    console.log(`Wrote ${wroteLines} NDJSON lines to ${outputPath}`)
    process.exit(code)
  })
}

const routeId = randomUUID()
server = Bun.serve({
  port: 0,
  fetch(req, serverInstance) {
    const url = new URL(req.url)
    if (url.pathname === `/ws/cli/${routeId}`) {
      if (serverInstance.upgrade(req)) return undefined
      return new Response("upgrade failed", { status: 400 })
    }
    return new Response("ok", { status: 200 })
  },
  websocket: {
    open(ws) {
      socket = ws
      sendInitialPromptIfNeeded()
    },
    message(_ws, raw) {
      const text = typeof raw === "string" ? raw : Buffer.from(raw).toString("utf8")
      writeRawChunk(text)
      parseChunk(text)
    },
    close() {
      socket = null
    },
  },
})

const sdkUrl = `ws://127.0.0.1:${server.port}/ws/cli/${routeId}`
const args = [
  "--sdk-url", sdkUrl,
  "--print",
  "--output-format", "stream-json",
  "--input-format", "stream-json",
  "--verbose",
  "-p", "",
]

if (options.model) {
  args.push("--model", options.model)
}
if (options.permissionMode) {
  args.push("--permission-mode", options.permissionMode)
}
if (options.includePartialMessages) {
  args.push("--include-partial-messages")
}

processHandle = Bun.spawn([options.claudeBin, ...args], {
  stdout: "pipe",
  stderr: "pipe",
})

if (processHandle.stdout && typeof processHandle.stdout !== "number") {
  const reader = processHandle.stdout.getReader()
  const decoder = new TextDecoder()
  void (async () => {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      stdoutTail = appendTail(stdoutTail, decoder.decode(value, { stream: true }))
    }
    stdoutTail = appendTail(stdoutTail, decoder.decode())
    reader.releaseLock()
  })()
}

if (processHandle.stderr && typeof processHandle.stderr !== "number") {
  const reader = processHandle.stderr.getReader()
  const decoder = new TextDecoder()
  void (async () => {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      stderrTail = appendTail(stderrTail, decoder.decode(value, { stream: true }))
    }
    stderrTail = appendTail(stderrTail, decoder.decode())
    reader.releaseLock()
  })()
}

processHandle.exited.then((code) => {
  if (!finished) {
    console.error(`Claude process exited before result (code ${code})`)
    finish(code ?? 1)
  }
})

setTimeout(() => {
  if (!finished) {
    console.error(`Timed out after ${options.timeoutMs}ms`)
    if (stderrTail.trim()) {
      console.error(`Claude stderr tail: ${stderrTail.trim()}`)
    }
    if (stdoutTail.trim()) {
      console.error(`Claude stdout tail: ${stdoutTail.trim()}`)
    }
    finish(2)
  }
}, options.timeoutMs)

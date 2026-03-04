# Claude Event Implementation Spec (Current Code)

Last updated: 2026-03-04
Scope: `tui/src/agent/claude/*` and `tui/src/agent/core/*` event flow as currently implemented.

This document is intentionally implementation-first. It describes only what code currently does.

## 1. Transport Overview

Claude session runtime is implemented in:

- `tui/src/agent/claude/session.ts`

The TUI starts Claude with a local SDK websocket callback URL and exchanges newline-delimited JSON payloads.

Spawn args currently used:

- `--sdk-url ws://127.0.0.1:<port>/ws/cli/<routeId>`
- `--print`
- `--output-format stream-json`
- `--input-format stream-json`
- `--verbose`
- `-p ""`

## 2. Claude Incoming Message Types (Parsed)

`ClaudeIncomingMessage` union in `session.ts` currently includes:

- `keep_alive`
- `system` (`subtype: "init"`)
- `assistant`
- `stream_event`
- `streamlined_text`
- `streamlined_tool_use_summary`
- `result`
- `auth_status`
- `control_request`
- `control_cancel_request`
- `tool_progress`
- `tool_use_summary`

### 2.1 Current handling behavior

- `keep_alive`: ignored.
- `system/init`: stores `sdkSessionId`.
- `assistant`: converts `message.content` to normalized Claude content blocks and appends a `claude-response` message.
- `stream_event`: only handles `event.type === "content_block_delta"` with `delta.type === "text_delta"`; text is streamed into one active message.
- `streamlined_text`: streamed into one active message.
- `streamlined_tool_use_summary`: emits a `tool_call` CC event and appends a `claude-response` text message.
- `result`: clears thinking/streaming state, attaches result metadata, emits a `result` CC event.
- `auth_status` with `error`: appends a system error message.
- `control_request` with `subtype === "can_use_tool"`: creates pending permission UI/message and waits for allow/deny.
- `control_cancel_request`: marks matching pending permission as cancelled.
- `tool_progress`, `tool_use_summary`: recognized but ignored.
- other `control_request` subtypes: logged as unhandled and ignored.

## 3. Claude Outgoing Message Types (Sent)

Outgoing writes are newline-delimited JSON lines sent via websocket to Claude.

### 3.1 User prompt

Sent from `sendMessage()`:

```json
{
  "type": "user",
  "message": { "role": "user", "content": "<trimmed input>" },
  "parent_tool_use_id": null,
  "session_id": "<sdkSessionId or empty string>"
}
```

### 3.2 Permission response

Sent from `respondToPendingPermission()` as `control_response`.

Allow:

```json
{
  "type": "control_response",
  "response": {
    "subtype": "success",
    "request_id": "<requestId>",
    "response": {
      "behavior": "allow",
      "updatedInput": { "...": "..." }
    }
  }
}
```

Deny:

```json
{
  "type": "control_response",
  "response": {
    "subtype": "success",
    "request_id": "<requestId>",
    "response": {
      "behavior": "deny",
      "message": "Denied by user"
    }
  }
}
```

### 3.3 Interrupt request

Sent from `interrupt()`:

```json
{
  "type": "control_request",
  "request_id": "<uuid>",
  "request": { "subtype": "interrupt" }
}
```

## 4. Claude Content Block Normalization

Assistant `message.content` is normalized to `ClaudeContentBlock[]` with support for:

- `text`: `{ type: "text", text }`
- `thinking`: `{ type: "thinking", thinking, budget_tokens? }`
- `tool_use`: `{ type: "tool_use", id, name, input }`
- `tool_result`: `{ type: "tool_result", tool_use_id, content, is_error? }`

`tool_result.content` is normalized as:

- string stays string
- array becomes normalized Claude content blocks
- null/undefined becomes `""`
- other values are JSON-stringified fallback

## 5. Internal Claude Event Stream (`CcBroadcast`)

`session.ts` emits internal turn events through `onCcEvent()` callbacks.

Type:

```ts
type CcBroadcast = {
  agentId: "claude"
  turnId: string
  sessionId?: string
  event: "question" | "tool_call" | "text" | "result"
  content: string
  toolName?: string
  isError?: boolean
}
```

Emission points:

- `question`: when local user sends a Claude prompt.
- `tool_call`: on `can_use_tool` and `streamlined_tool_use_summary`.
- `text`: when assistant content contains extracted text.
- `result`: on Claude `result`.

Local message insertion:

- `sendMessage()` also appends an immediate local message with `type: "cc"` and `content: <prompt>`.
- this local message is part of the agent session message list and is rendered by `ClaudeEventMessageItem` as an own-message line.

Turn/session state:

- `turnId` is generated once per `sendMessage()`.
- `sessionId` maps to a local generated Claude session UUID (`ccSessionId`), not Claude `sdkSessionId`.
- `currentTurnId` is cleared after a `result` event.

## 6. `cc` Message Wire Format (Channel/DM)

Internal `CcBroadcast` is forwarded to chat transport in `create-chat-view-base.ts` via `ChannelManager.sendAgentEvent()`.

Wire type:

- `message.type = "cc"`

Wire metadata (`MessageAttributes.cc`) from `tui/src/lib/types.ts`:

```ts
type CcEventMetadata = {
  turn_id: string
  session_id?: string
  event: "question" | "tool_call" | "text" | "result"
  tool_name?: string
  is_error?: boolean
  events?: CcEventMetadata[]
  contents?: string[]
}
```

Send payload for channel messages:

```json
{
  "content": "<event content>",
  "type": "cc",
  "attributes": {
    "cc": {
      "turn_id": "<turnId>",
      "session_id": "<ccSessionId optional>",
      "event": "question|tool_call|text|result",
      "tool_name": "<optional>",
      "is_error": "<optional>"
    }
  }
}
```

DMs use `sendDmMessage(..., attributes, "cc")` with equivalent `attributes.cc`.

## 7. `cc` Receive + Condense Behavior

Inbound `new_message` events preserve server `type`, defaulting to `"user"` when missing.

All inbound messages pass through `upsertAgentMessage()`. For `cc` messages:

- `isClaudeEventMessage()` requires `attributes.cc.turn_id` and valid event enum.
- `upsertClaudeEventMessage()` groups by:
  - `username + agent + session_id` when `session_id` exists
  - otherwise `username + agent + turn_id`
- grouped message stores:
  - latest `content` in `message.content`
  - cumulative arrays in `attributes.cc.events[]` and `attributes.cc.contents[]`

Echo suppression:

- if `myUsername` is known and incoming `message.username === myUsername`, inbound `cc` event is dropped by the mutator.

## 8. Rendering Contracts

### 8.1 `claude-response`

Rendered by `ClaudeMessageItem`:

- text/thinking/tool_use(tool-group one-liner)/tool_result/permission/interrupted/streaming cursor
- result metadata is attached in message attributes; currently not shown as explicit text row (only debug log side effect).

### 8.2 `cc`

Rendered by `ClaudeEventMessageItem`:

- Own local `cc` prompt messages are rendered as italicized user-style lines.
- Non-own messages render aggregated timeline from `attributes.cc.events/contents`.
- Valid displayed event types are fixed to:
  - `question`, `tool_call`, `text`, `result`

## 9. Declared but Not Implemented (Current)

The following are explicitly recognized in code but currently ignored/unhandled in behavior:

- incoming `tool_progress`
- incoming `tool_use_summary`
- incoming `control_request` subtypes other than `can_use_tool`
- `stream_event` deltas other than `content_block_delta.text_delta`

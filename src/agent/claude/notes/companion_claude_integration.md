# Companion Claude Integration Notes

Last updated: 2026-03-04
Source analyzed: https://github.com/The-Vibe-Company/companion

## Scope

These notes document how The Companion integrates with Claude Code, with emphasis on:

- architecture and wiring
- websocket/NDJSON protocol handling
- streaming lifecycle
- permission gating/control flow
- session persistence/recovery
- API surfaces used by the frontend

## Primary Docs (inside `companion/`)

- `README.md`
  - points to core docs
  - docs section references protocol + architecture guide
- `CLAUDE.md`
  - best high-level architecture document for contributors
  - includes data flow, file map, session lifecycle
- `WEBSOCKET_PROTOCOL_REVERSED.md`
  - deep reverse-engineered `--sdk-url` protocol documentation
- `docs/guides/sessions-and-permissions.mdx`
  - user-facing lifecycle and backend differences (Claude vs Codex)

## High-Level Architecture

Core runtime path:

1. Browser requests session create.
2. Server launches `claude` with `--sdk-url ws://.../ws/cli/:session`.
3. Claude CLI connects back to server websocket.
4. Server bridges CLI NDJSON <-> browser JSON websocket.
5. Browser renders streaming output, tool calls, and permission prompts.

Main files:

- `web/server/index.ts`
  - websocket upgrade endpoints
  - `/ws/cli/:sessionId` for CLI callback
  - `/ws/browser/:sessionId` for UI
- `web/server/routes.ts`
  - session create API
  - Claude discovery/history API
  - backend availability/model endpoints
- `web/server/cli-launcher.ts`
  - process launcher for Claude/Codex
  - `spawnCLI()` is Claude path
- `web/server/ws-bridge.ts`
  - runtime bridge/router for all message types
- `web/server/session-types.ts`
  - protocol types for CLI + browser

## Claude Launch Semantics

In `web/server/cli-launcher.ts`, Claude launches with:

- `--sdk-url`
- `--print`
- `--output-format stream-json`
- `--input-format stream-json`
- `--include-partial-messages`
- `--verbose`

Additional conditional args:

- `--model <model>`
- `--permission-mode <mode>`
- `--allowedTools <tool>`
- `--resume-session-at <id>`
- `--fork-session`
- `--resume <cliSessionId>` on relaunch
- always `-p ""` for headless mode

Container nuances:

- if containerized and permission mode is `bypassPermissions`, it is downgraded to `acceptEdits` unless forced by env flag.
- containerized SDK URL targets `host.docker.internal` (overridable).

## CLI <-> Bridge Message Model

Claude NDJSON message categories modeled in `web/server/session-types.ts`:

- `system` (`init`, `status`, plus additional mapped subtypes)
- `assistant`
- `result`
- `stream_event`
- `tool_progress`
- `tool_use_summary`
- `control_request` (notably `can_use_tool`)
- `control_response`
- `auth_status`
- `keep_alive`

Bridge routing in `web/server/ws-bridge.ts`:

- `routeCLIMessage()` dispatches parsed lines by `msg.type`.
- `handleSystemMessage()` updates session state from `system/init`.
- `handleStreamEvent()` forwards stream payload directly to browser.
- `handleControlRequest()` transforms `can_use_tool` into UI permission state.

## Streaming (Chat) Lifecycle

### Server side

1. Claude emits NDJSON `stream_event`.
2. Bridge forwards as browser message `{ type: "stream_event", event, ... }`.

### Frontend side (`web/src/ws.ts`)

For `stream_event`:

- `message_start`
  - resets streaming phase
  - clears previous draft assistant bubble
  - initializes streaming timers/token counters
- `content_block_delta`:
  - `text_delta`: appends streamed response text
  - `thinking_delta`: appends thinking text section
- `message_delta`:
  - reads `usage.output_tokens` to update live token stats

Streaming UI mechanics:

- draft assistant message is maintained with `isStreaming: true`
- this draft is updated in place while deltas arrive
- final assistant message replaces draft when `assistant` arrives
- `result` clears streaming state and returns session status to idle

Rendering:

- `MessageBubble` shows cursor when `message.isStreaming` is true
- `MessageFeed` shows generating bar with elapsed time and output token count

## Reconnect and Replay Model

Bridge uses per-session sequencing and replay:

- each outbound browser event gets `seq`
- recent events buffered (limit: 600)
- browser subscribes with `session_subscribe { last_seq }`
- browser acks with `session_ack`

Replay behavior:

- if browser has a sequence gap, server sends `message_history` plus transient event replay.
- server sends status correction (`idle`/`running`/`compacting`) after replay to avoid stale streaming UI.

Frontend safety:

- dedupes by sequence
- if restored history ends in `result`, it force-clears stale streaming state

## Permission and Control Flow

Incoming from Claude:

- `control_request` subtype `can_use_tool`
  - bridge records pending permission
  - browser receives `permission_request`

Outgoing to Claude:

- user allows/denies in UI
- bridge sends NDJSON `control_response` with:
  - allow: `{ behavior: "allow", updatedInput... }`
  - deny: `{ behavior: "deny", message... }`

Other controls sent as `control_request`:

- `interrupt`
- `set_model`
- `set_permission_mode`
- MCP control requests (`mcp_status`, `mcp_toggle`, etc)

AI validation layer:

- optional pre-check for tool permissions
- can auto-approve safe or auto-deny dangerous
- emits `permission_auto_resolved` to browser when auto-handled

## Session Persistence and Recovery

Persistence:

- launcher and bridge state are persisted
- message history, pending permissions, replay state, processed client IDs persisted

Recovery flow:

1. startup restores sessions from disk.
2. CLI PID/container liveness is checked.
3. startup waits grace period for websocket reconnect.
4. if stale, relaunch is triggered.
5. relaunch can use stored Claude internal session id via `--resume`.

Where wired:

- restore/recovery orchestration: `web/server/index.ts`
- launcher persistence/relaunch: `web/server/cli-launcher.ts`
- bridge persistence/replay: `web/server/ws-bridge.ts`, `web/server/ws-bridge-replay.ts`

## API Surfaces Relevant to Claude

Session creation:

- POST `/api/sessions/create`
- POST `/api/sessions/create-stream` (SSE progress)

Session listing/details:

- GET `/api/sessions`
- GET `/api/sessions/:id`

Claude disk session utilities:

- GET `/api/claude/sessions/discover`
- GET `/api/claude/sessions/:id/history`

Backend metadata:

- GET `/api/backends` (Claude/Codex availability by binary detection)
- GET `/api/backends/:id/models`
  - Codex: read from `~/.codex/models_cache.json`
  - Claude: frontend defaults are used

Anthropic key verification:

- POST `/api/settings/anthropic/verify`
  - server probes `https://api.anthropic.com/v1/models`

## Claude Disk Session Discovery and Resume Support

Discovery source:

- default `~/.claude/projects` (overridable by env)

Discovery behavior:

- scans project dirs for `.jsonl` files
- extracts early metadata (`sessionId`, `cwd`, branch, slug)
- sorts by mtime, dedupes by session id, applies limit

History behavior:

- locates `<sessionId>.jsonl`
- parses user/assistant timeline
- merges assistant content blocks across incremental records
- filters noise/meta command records
- returns paginated page (`messages`, `nextCursor`, `hasMore`)

Used by frontend:

- home page lists resume candidates from both Companion sessions and Claude disk sessions
- chat view can load historical transcript from resumed Claude session

## Frontend Streaming and State Data Structures

Important store buckets:

- `streaming: Map<sessionId, text>`
- `streamingStartedAt: Map<sessionId, number>`
- `streamingOutputTokens: Map<sessionId, number>`
- `sessionStatus: idle | running | compacting | null`
- `toolProgress` map for live tool elapsed timers

`ws.ts` also keeps local streaming helpers:

- `streamingPhaseBySession` (`thinking` vs `text`)
- `streamingDraftMessageIdBySession`
- per-session `lastSeq` for replay/ack

## Protocol Drift Safety Nets

Two test files enforce Claude compatibility:

- `web/server/claude-protocol-contract.test.ts`
  - checks expected message categories and required fields against SDK snapshot
- `web/server/claude-protocol-drift.test.ts`
  - checks bridge-handled message types/subtypes remain aligned with upstream snapshot

Upstream snapshot metadata:

- `web/server/protocol/claude-upstream/README.md`
- snapshot source package:
  - `@anthropic-ai/claude-agent-sdk@0.2.41`
- snapshot file:
  - `web/server/protocol/claude-upstream/sdk.d.ts.txt`

## Quick Integration Summary

If replicating Companion-style Claude streaming in another client:

1. launch Claude with SDK websocket + stream-json flags.
2. parse NDJSON line-by-line.
3. handle `stream_event` deltas incrementally for UI.
4. store stable message history and a rolling replay buffer with sequence IDs.
5. implement `control_request can_use_tool` -> UI approval -> `control_response`.
6. persist session and CLI internal session id for resume/relaunch.


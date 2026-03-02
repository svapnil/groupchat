# Adding a New Local Agent

This folder is the integration boundary for local in-app agents.

## TL;DR

Adding to `src/agent/core/local-agent-sessions.ts` is necessary, but not sufficient.
You typically need to wire:

1. Session adapter (`src/agent/{agent}/session.ts`)
2. Session registration (`src/agent/core/local-agent-sessions.ts`)
3. Runtime capability detection (`src/lib/runtime-capabilities.ts`)
4. Enter command (`src/lib/commands.ts`)
5. Display metadata (`src/lib/constants.ts`)
6. Message mutation routing (`src/agent/core/message-mutations.ts`)
7. Message rendering routing (`src/agent/core/message-renderers.tsx`)
8. Types/tests as needed

## Architecture Overview

- `createChatViewBase()` owns active-agent lifecycle, input mode state, `/exit`, and key handling.
- `createLocalAgentSessions()` is the agent registry consumed by the base.
- `message-mutations.ts` normalizes/condenses inbound messages for channels and DMs.
- `message-renderers.tsx` maps message records to agent-specific UI components.

If your agent is registered and available, the shared UI automatically handles mode transitions and routing.

## Step-by-Step

### 1) Implement session adapter

Create `src/agent/{agent}/session.ts` and expose an API that can be mapped to `LocalAgentSession` (see `src/agent/core/types.ts`).

Required behavior:

- `start()`, `stop()`, `sendMessage()`
- `isActive()`, `isConnecting()`, `messages()`
- `appendError()`

Optional but recommended:

- `interrupt()`
- Pending actions (`pendingAction`, `pendingActions`, `respondToPendingAction`, `findPendingActionMessageId`)
- Event bridge (`onEvent`) for streamed question/tool/text/result events
- `isThinkingMessage()` for bottom-pinned temporary status messages

### 2) Register in local agent registry

Edit `src/agent/core/local-agent-sessions.ts`:

- instantiate your session
- add a `LocalAgentSessionEntry` with unique `id`
- gate with `isAvailable()` based on runtime capabilities

### 3) Add runtime capability detection

Edit `src/lib/runtime-capabilities.ts`:

- add `{agent}Path` and `has{Agent}` fields
- detect binary/tool availability (for example with `Bun.which(...)`)

### 4) Add enter command

Edit `src/lib/commands.ts`:

- add command like `/{agent}` with `eventType: getAgentEnterCommandEvent("{agent}")`
- keep `/exit` generic (`local_agent_exit`)

### 5) Add UI display metadata

Edit `src/lib/constants.ts`:

- add your agent to `AGENT_CONFIG` (`displayName`, `color`)

This drives labels and accents in input mode and event summaries.

### 6) Add inbound mutation logic (if needed)

If your incoming agent events need grouping/condensing, add a mutator module under `src/agent/{agent}/` and register it in:

- `src/agent/core/message-mutations.ts`

Functions expected by core:

- detect whether incoming message belongs to this mutator
- upsert/merge logic

Note: both channel and DM ingestion paths use `upsertAgentMessage()`/`condenseAgentMessages()`.

### 7) Add rendering logic (if needed)

If your message format needs custom UI, add renderer(s) and optional depth resolver(s) in:

- `src/agent/core/message-renderers.tsx`

Typical additions:

- renderer for your agent response message type
- renderer for your event stream message type
- depth resolver if you support nested sub-agent/task threads

### 8) Extend shared types if introducing new message shapes

Edit `src/lib/types.ts` only if required:

- new `Message.type` variant
- new metadata under `MessageAttributes`

Prefer namespaced metadata keys (for example `attributes.{agent}`).

### 9) Validate

Run:

```bash
npm run typecheck
npm test
```

Add/adjust tests under `test/components`, `test/lib`, and `test/pages` for new behavior.

## Current Constraints

- Only one local agent can be actively controlled at a time.
- Multiple agent-authored messages can render in the same channel/DM stream.
- `sendAgentEvent()` currently emits protocol type `"cc"`; if you introduce a new transport-level type, update channel ingestion + renderer/mutator routing together.

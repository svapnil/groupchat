# Archived: the full terminal chat UI

Retired on 2026-07-07 when `groupchat` became the remote agent client. Until then this package was a full terminal chat app; that UI lived behind `--chat` for one commit and was then archived here. The web app is the chat surface now.

Nothing in this directory is built, typechecked, or tested — `tsconfig.json` includes only `src/**` and the test scripts run `./test`. Imports inside these files still point at their original `src/`-relative locations, so the tree documents exactly where each file came from.

## What's here

- `src/pages/` — Menu, ChatView, DmInbox, DmChatView, CreateChannelScreen.
- `src/components/` — MessageList, MessageItem, InputBox, UserList, AtAGlance, CommandInputPanel, Router, SkeletonLoader, ToolTip.
- `src/agent/claude/` — the local `/claude` agent mode (session, event mutations, rendering). `helpers.ts` stayed in `src/` because the codex session still uses it.
- `src/agent/codex/components/` — local `/codex` mode rendering. The codex *session* stayed in `src/` — it is the engine of the remote runner.
- `src/agent/core/` — message-mutations (agent-event condensing for display), message-renderers, local-agent-sessions, types.
- `src/bash/` — the local `!` shell command mode.
- `src/lib/`, `src/primitives/`, `src/stores/` — command parsing/tooltip/input-mode, chat-view base primitive, user search, dm-store, navigation-store.
- `test/`, `scripts/` — their tests, fixtures, snapshots, and the claude NDJSON capture script.

## Removed outright (not archived)

- `src/lib/remote-mode.ts` and the `--remote`/`--chat` flags — the app is always remote now; the socket always connects with `remote: "true"`.
- `ChannelManager.sendTypedMessage` / `sendAgentEvent` (cc/cx) / `sendBashEvent` and the `type` param of `sendDmMessage` — only the chat UI called them. Recover via git history if ever needed.
- `App.tsx`'s router/chat wiring and the agent-message condensing calls in `create-multi-channel-chat.ts` (replaced with a plain upsert-by-id; nothing renders that cache in remote mode).

## Resurrecting it

Don't move files back piecemeal — shared modules (`channel-manager`, `create-multi-channel-chat`, `lib/types`) kept evolving after the split. Instead, check out the last commit where the chat UI was live (the commit that created this directory is the boundary) and diff forward.

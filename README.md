# Groupchat

Last updated: July 8, 2026

<img width="1154" height="263" alt="Groupchat terminal header" src="https://github.com/user-attachments/assets/77f90383-32d2-4110-9774-9b911fa01b9c" />

Groupchat is the remote agent client for Groupchat. Keep it running on a machine that has `codex` installed, and Codex responds to `@mentions` from your Groupchat workspace — running locally on that machine and streaming its work back into the conversation.

## Install

```bash
npm install -g groupchat
```

The npm package installs a small launcher plus a platform-specific binary package. Current binary targets are:

- macOS arm64 and x64
- Linux arm64 and x64
- Windows x64

## Start

```bash
groupchat
```

On first launch, Groupchat opens a browser login flow. Auth tokens are stored in your OS keychain, and your selected org is stored under `~/.config/groupchat/`.

Once you're logged in (and have picked an org, if you belong to several), Groupchat shows a compact control panel and goes online as a remote:

- It advertises the session as available for remote agent runs.
- When someone `@mentions` an agent in your workspace, it runs Codex locally in the directory you launched from.
- The response streams back into the conversation as it happens, and follow-up thread replies continue the same Codex conversation.

The panel shows connection status, whether `codex` is available on `PATH`, active runs with live progress, and recent run history.

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+O` | Log out. |
| `Ctrl+C` twice | Exit the app. |

## Configuration

Groupchat uses production services by default:

- Console: `https://app.groupchatty.com`
- WebSocket: `wss://api.groupchatty.com/socket`

For development or staging, override them with environment variables:

```bash
GROUPCHAT_CONSOLE_URL=http://localhost:4000 \
GROUPCHAT_WS_URL=ws://localhost:4000/socket \
groupchat
```

Useful environment variables:

| Variable | Purpose |
| --- | --- |
| `GROUPCHAT_CONSOLE_URL` | Browser login and HTTP API base URL. |
| `GROUPCHAT_WS_URL` | Phoenix socket URL. |
| `GROUPCHAT_PROFILE` | Separate keychain/config profile, useful for multiple test users. |
| `GROUPCHAT_DEBUG=1` | Enable debug logging. |
| `GROUPCHAT_DEBUG_FILE` | Override the debug log path. Defaults to `.logs/tui-debug.log`. |
| `GROUPCHAT_DEBUG_STDERR=1` | Also write debug logs to stderr. |

## Development

This package is the OpenTUI/Solid terminal client.

```bash
bun install
bun run dev                # watch mode
bun run dev:user2          # watch mode with GROUPCHAT_PROFILE=user2
bun run dev:debug          # debug log at .logs/tui-debug.log
bun run dev:debug:watch    # debug logging + watch mode
bun run dev:debug:console  # debug logging + OpenTUI console
bun run build              # production bundle + current-platform binary
bun run build --all        # production binaries for every supported target
bun run start              # run dist/index.js after a build
bun run typecheck          # TypeScript check
bun test ./test            # test suite
bun run test:watch         # watch tests
bun run test:update-snapshots
```

The build writes standalone binaries under `npm/<platform>-<arch>/bin/`. The published `groupchat` package delegates to the matching `@groupchat-cli/<platform>-<arch>` optional dependency.

### The old chat UI

Earlier versions of this package were a full terminal chat client (channels, DMs, presence, inline `/claude` and `/codex` agents, local `!` shell commands). That UI was retired when the remote agent client became the product; the web app is the chat surface now. The code is preserved under `archived/chat-ui/` (excluded from the build, typecheck, and tests) — see `archived/chat-ui/README.md` for what's there and how to resurrect it.

## Contributing

Contributions are welcome for new harness integrations and terminal UX improvements.

Questions: svapnila at gmail dot com

## License

AGPL-3.0-or-later

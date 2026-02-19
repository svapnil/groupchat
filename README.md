# Groupchat — Terminal Chat with Embedded AI

Groupchat is a real-time messaging app for developers, built natively in your terminal. Chat with your team and run AI agents like Claude—without leaving your workflow.

## Install

```bash
npm install -g groupchat
```

## Start

```bash
groupchat
```

On first launch, you'll be prompted to log in via your browser. After that, you're in.

## Features

- **Real-time messaging** — instant delivery across channels
- **Embedded AI agents** — run Claude directly in any conversation
- **Live presence** — see who's online and typing
- **Keyboard-driven** — no mouse required
- **Secure auth** — OAuth login with keychain credential storage

## Keyboard Shortcuts

| Action | Key |
|--------|-----|
| View channels | `Ctrl+Q` |
| Toggle user list | `Ctrl+E` |
| Send message | `Enter` |
| Scroll history | `Page Up / Down` |
| Logout | `Ctrl+O` |
| Exit | `Ctrl+C` |

## Using Claude

In any channel, you can invoke Claude as an embedded agent. Claude runs inline with full tool use—read files, run commands, and get answers without switching apps.

## Development

```bash
cd tui
npm install
npm run dev          # watch mode
npm run dev:debug    # watch mode + debug log at .logs/tui-debug.log
npm run build        # production build
npm run typecheck    # type check
```

## License

MIT

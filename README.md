# Groupchat

<img width="1154" height="263" alt="image" src="https://github.com/user-attachments/assets/77f90383-32d2-4110-9774-9b911fa01b9c" />

Groupchat is a real-time messaging app for developers, built natively in your terminal. Chat with your team and run AI agents like Claude—without leaving your workflow.

<img width="1510" height="953" alt="image" src="https://github.com/user-attachments/assets/b444f066-74fb-4dda-a677-741f70c71cf6" />


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

## Using Claude

In any channel, you can invoke Claude as an embedded agent. Claude runs inline with full tool use—read files, run commands, and get answers without switching apps.

## Development (WIP)

We encourage builders to contribute to `groupchat` to add agents, improve the UX, or even build new clients (like a desktop app!). Please email svapnila at gmail dot com if you have any questions.

```bash
cd tui
npm install
npm run dev          # watch mode
npm run dev:debug    # watch mode + debug log at .logs/tui-debug.log
npm run build        # production build
npm run typecheck    # type check
```

## License

AGPL-3.0-or-later

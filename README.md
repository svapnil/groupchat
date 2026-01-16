# Groupchat - Real-time Chat, Natively in Your Terminal

Welcome to Groupchat, a terminal-native chat application built for developers. Chat with your team without ever leaving your terminal.

## What is Groupchat?

Groupchat is a real-time chat application that runs entirely in your terminal. It's designed for developers and teams who want to stay connected without breaking their command-line workflow. Whether you're coding, debugging, or managing infrastructure, you can chat with colleagues instantly—all from your terminal.

**Key benefits:**
- 💻 **Native terminal experience** - No browser tabs needed
- ⚡ **Real-time messaging** - Instant message delivery with live presence
- 🎯 **Developer-friendly** - Built for people who live in the terminal
- 🔐 **Secure** - OAuth-based authentication with system keychain storage

## Features

- **💬 Real-time Messaging** - See messages instantly as they arrive with smooth typing indicators
- **🌐 Multiple Channels** - Join public channels or create private rooms to organize conversations
- **👥 Live Presence** - See who's online, away, or offline with real-time status updates
- **🔐 Secure Authentication** - Browser-based login with credentials safely stored in your system keychain
- **⌨️ Keyboard-Driven Navigation** - Full keyboard control—no mouse required
- **🎨 Clean, Organized Interface** - Beautiful TUI with message history, user lists, and status indicators
- **📱 Responsive Design** - Adapts to your terminal size for optimal viewing

## Installation

### From npm (when published)

```bash
npm install -g groupchat
```

Then verify installation:

```bash
groupchat --help
```

## Getting Started

### First Time Setup

1. **Start Groupchat**
   ```bash
   groupchat
   ```

2. **Login (if needed)**
   If you're not already logged in, the app will prompt you to authenticate. Your browser will automatically open. Once approved, return to your terminal to start chatting.

3. **You're in!**
   The main chat interface loads automatically. Start sending messages and connecting with your team.

## How to Use

### Starting Groupchat

```bash
groupchat
```

That's it! The app handles everything else—authentication, logging out, switching channels, and sending messages all happen within the interface.

### Navigation & Controls

**In the Chat Interface:**

| Action | Shortcut |
|--------|----------|
| **View all channels** | `Ctrl+Q` |
| **Toggle user list** | `Ctrl+E` |
| **Logout** | `Ctrl+O` |
| **Exit chat** | `Ctrl+C` |
| **Send message** | `Enter` |
| **Clear input** | `Ctrl+U` |
| **Navigate channels** | Arrow Keys (Up/Down) |
| **Select channel** | `Enter` |
| **Scroll message history** | `Page Up` / `Page Down` |

### The Chat Experience

When you start Groupchat, you'll see:

**Header Section (Top)**
- Your username and connection status
- Logout shortcut reminder

**Message Area (Center)**
- Full chat history with timestamps
- Color-coded usernames for easy identification
- Typing indicators when others are composing
- Unread message counts

**Input Box (Bottom)**
- Type your messages here
- Shows connection status
- Displays helpful hints

**User List (Right)**
- Toggle with `Ctrl+E`
- Shows online/offline status
- Displays user roles and activity

**Status Bar (Bottom)**
- Keyboard shortcuts at a glance
- Connection information

## Channels

### Public Channels
Open to everyone in your workspace. Join any public channel to start conversations with the team.

### Private Channels
Invite-only rooms for team discussions. You'll see a lock icon (🔒) next to private channel names.

### Channel Features
- **Unread indicators** - See at a glance which channels have new messages
- **Real-time updates** - Messages appear instantly as they're sent
- **Search-friendly names** - Channel names help you find relevant conversations
- **Seamless switching** - Jump between channels instantly without losing context

## Configuration

Groupchat works out of the box with default settings. 

## Troubleshooting

### "I'm not logged in. How do I login?"
Just run `groupchat` and it will prompt you to authenticate. Your browser will open automatically.

### "I can't find a channel I need"
Press `Ctrl+Q` to view all available channels. You can browse to find what you're looking for.

### "My credentials aren't saved"
Groupchat stores credentials in your system keychain for security. Make sure your system keychain is accessible and unlocked.

### "The terminal looks broken"
Groupchat requires a modern terminal emulator. Try resizing your terminal window or running `groupchat` again.

### "I want to logout"
Press `Ctrl+O` in the chat interface to logout and exit.

## The Groupchat Experience

Groupchat transforms how you communicate while coding. Instead of alt-tabbing to a browser or chat window, your conversations are right there in the terminal—exactly where your workflows happen.

**Why terminal-native chat?**
- Stay focused on your work
- No context switching between apps
- Fast, efficient communication
- Keep your hands on the keyboard
- Perfect for pair programming and remote teams

## For Developers

### Technology Stack
- **React for Terminals** - Ink provides a React-based TUI framework
- **WebSocket** - Real-time bidirectional communication
- **TypeScript** - Type-safe implementation
- **Node.js** - Cross-platform CLI runtime

### Contributing

Interested in improving Groupchat? We welcome contributions! Check out the main repository:

[https://github.com/svapnil/groupchat-main](https://github.com/svapnil/groupchat-main)

### Development Setup

```bash
cd tui
npm install
npm run dev        # Watch mode with hot reload
npm run typecheck  # Check TypeScript types
npm run build      # Build for production
```

## License

MIT - See LICENSE file in the repository


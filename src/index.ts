#!/usr/bin/env node

import { program } from "commander";
import { render } from "ink";
import React from "react";
import { App } from "./components/App.js";
import { login, logout, isAuthenticated } from "./auth/auth-manager.js";

// Login command
async function handleLogin() {
  console.log("Starting login flow...\n");

  const result = await login((status) => {
    console.log(`  ${status}`);
  });

  if (result.success) {
    console.log("\n✓ Login successful! Run 'terminal-chat' to start chatting.\n");
    process.exit(0);
  } else {
    console.error(`\n✗ Login failed: ${result.error}\n`);
    process.exit(1);
  }
}

// Logout command
async function handleLogout() {
  await logout();
  console.log("✓ Logged out successfully.\n");
  process.exit(0);
}

// Start chat (default command)
async function startChat() {
  // Check if terminal supports our requirements
  if (!process.stdout.isTTY) {
    console.error("Error: terminal-chat requires an interactive terminal.\n");
    process.exit(1);
  }

  // Clear the terminal screen
  process.stdout.write('\x1b[2J\x1b[0f');

  // Render the Ink app in fullscreen mode
  const { waitUntilExit } = render(React.createElement(App), {
    exitOnCtrlC: false, // We handle Ctrl+C manually
  });

  try {
    await waitUntilExit();
  } catch (err) {
    // Clean exit
  }
}

// Set up CLI
program
  .name("terminal-chat")
  .description("CLI chat client for Terminal Chat")
  .version("0.1.0");

program
  .command("login")
  .description("Login to Terminal Chat")
  .action(handleLogin);

program
  .command("logout")
  .description("Logout from Terminal Chat")
  .action(handleLogout);

program
  .command("status")
  .description("Check authentication status")
  .action(async () => {
    const authenticated = await isAuthenticated();
    if (authenticated) {
      console.log("✓ You are logged in.\n");
    } else {
      console.log("✗ Not logged in. Run 'terminal-chat login' to authenticate.\n");
    }
    process.exit(0);
  });

// Default: start chat
program.action(startChat);

program.parse();


import WebSocket from "ws";
import { program } from "commander";
import { render } from "ink";
import React from "react";
import { login, logout, isAuthenticated } from "./auth/auth-manager.js";
import { checkForUpdate, UpdateInfo } from "./lib/update-checker.js";
import { UpdatePrompt } from "./components/UpdatePrompt.js";
import packageJson from "../package.json";

// Ensure WebSocket is available globally for Phoenix in Node.
if (typeof globalThis.WebSocket === "undefined") {
  // Assign via any to avoid type mismatches between ws and undici's WebSocket types.
  (globalThis as Record<string, unknown>).WebSocket = WebSocket;
}

// Login command
async function handleLogin() {
  console.log("Starting login flow...\n");

  const result = await login((status) => {
    console.log(`  ${status}`);
  });

  if (result.success) {
    console.log("\n✓ Login successful! Run 'groupchat' to start chatting.\n");
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

// Show update prompt and wait for user response
async function showUpdatePrompt(updateInfo: UpdateInfo): Promise<void> {
  return new Promise((resolve) => {
    const { unmount, waitUntilExit } = render(
      React.createElement(UpdatePrompt, {
        updateInfo,
        onComplete: () => {
          unmount();
          resolve();
        },
      })
    );

    waitUntilExit().then(() => resolve());
  });
}

// Start chat (default command)
async function startChat() {
  // Check if terminal supports our requirements
  if (!process.stdout.isTTY) {
    console.error("Error: groupchat requires an interactive terminal.\n");
    process.exit(1);
  }

  // Check for updates (don't block on network errors)
  const updateInfo = await checkForUpdate();
  if (updateInfo.updateAvailable) {
    await showUpdatePrompt(updateInfo);
  }

  // Clear the terminal screen
  process.stdout.write('\x1b[2J\x1b[0f');

  // Lazy-load the app so the WebSocket polyfill runs first.
  const { App } = await import("./components/App.js");

  // Render the Ink app in fullscreen mode
  const { waitUntilExit } = render(React.createElement(App), {
    exitOnCtrlC: false, // We handle Ctrl+C manually
  });

  try {
    await waitUntilExit();
  } catch (err) {
    // Clean exit
  }

  // Ensure terminal returns to a new line after exit
  process.stdout.write('\n');
}

// Set up CLI
program
  .name("groupchat")
  .description("CLI chat client for Groupchat")
  .version(packageJson.version);

// Default: start chat
program.action(startChat);

program.parse();

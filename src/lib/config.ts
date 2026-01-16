import { config as loadEnv } from "dotenv";

// Only load .env file in development (not in production)
if (process.env.NODE_ENV !== "production") {
  loadEnv();
}

export interface Config {
  consoleUrl: string;
  wsUrl: string;
}

const DEFAULT_CONFIG: Config = {
  consoleUrl: "https://app.groupchatty.com",
  wsUrl: "wss://api.groupchatty.com/socket",
};

/**
 * Get configuration from environment variables or defaults.
 * Loads from .env file, then environment variables take precedence.
 */
export function getConfig(): Config {
  return {
    consoleUrl:
      process.env.GROUPCHAT_CONSOLE_URL || DEFAULT_CONFIG.consoleUrl,
    wsUrl: process.env.GROUPCHAT_WS_URL || DEFAULT_CONFIG.wsUrl,
  };
}

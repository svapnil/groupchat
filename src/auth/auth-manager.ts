import crypto from "node:crypto";
import http from "node:http";
import open from "open";
import {
  storeToken,
  getToken,
  clearToken,
  hasValidToken,
  type StoredToken,
} from "./token-storage.js";
import { getConfig } from "../lib/config.js";

export type AuthState = "unauthenticated" | "authenticating" | "authenticated";

export interface AuthResult {
  success: boolean;
  error?: string;
}

export interface AuthCallbackResult {
  token: string;
  state: string;
  expiresAt: string;
}

/**
 * Generate a cryptographically secure state token for CSRF protection.
 */
function generateState(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Find an available port in the given range.
 */
async function findAvailablePort(
  startPort: number,
  endPort: number
): Promise<number> {
  for (let port = startPort; port <= endPort; port++) {
    const available = await new Promise<boolean>((resolve) => {
      const server = http.createServer();
      server.once("error", () => resolve(false));
      server.once("listening", () => {
        server.close();
        resolve(true);
      });
      server.listen(port, "127.0.0.1");
    });

    if (available) {
      return port;
    }
  }

  throw new Error(`No available port found in range ${startPort}-${endPort}`);
}

const SUCCESS_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Terminal Chat - Authentication Successful</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
      background: #1F1F1F;
      color: #CCCCCC;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
    }
    .container { text-align: center; padding: 2rem; }
    .success { color: #4EC9B0; font-size: 1.5rem; margin-bottom: 1rem; }
    .message { color: #9D9D9D; }
  </style>
</head>
<body>
  <div class="container">
    <div class="success">✓ Authentication successful!</div>
    <div class="message">You can close this window and return to the terminal.</div>
  </div>
</body>
</html>
`;

const ERROR_HTML = (message: string) => `
<!DOCTYPE html>
<html>
<head>
  <title>Terminal Chat - Authentication Failed</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
      background: #1F1F1F;
      color: #CCCCCC;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
    }
    .container { text-align: center; padding: 2rem; }
    .error { color: #F85149; font-size: 1.5rem; margin-bottom: 1rem; }
    .message { color: #9D9D9D; }
  </style>
</head>
<body>
  <div class="container">
    <div class="error">✗ Authentication failed</div>
    <div class="message">${message}</div>
  </div>
</body>
</html>
`;

/**
 * Start a temporary HTTP server to receive the OAuth callback.
 */
function startAuthServer(
  port: number,
  expectedState: string,
  timeoutMs: number = 5 * 60 * 1000
): Promise<AuthCallbackResult> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const server = http.createServer((req, res) => {
      if (settled) {
        res.writeHead(400);
        res.end();
        return;
      }

      // Only handle GET /callback
      if (!req.url?.startsWith("/callback")) {
        res.writeHead(404);
        res.end();
        return;
      }

      const url = new URL(req.url, `http://localhost:${port}`);
      const token = url.searchParams.get("token");
      const state = url.searchParams.get("state");
      const expiresAt = url.searchParams.get("expiresAt");

      // Validate state parameter
      if (state !== expectedState) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(ERROR_HTML("Invalid state parameter. Please try again."));
        return;
      }

      // Validate token
      if (!token) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(ERROR_HTML("No token received. Please try again."));
        return;
      }

      // Success!
      settled = true;
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(SUCCESS_HTML);

      // Close server and resolve
      server.close();
      clearTimeout(timeout);

      resolve({
        token,
        state,
        expiresAt:
          expiresAt ||
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });
    });

    // Set up timeout
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        server.close();
        reject(new Error("Authentication timed out. Please try again."));
      }
    }, timeoutMs);

    server.on("error", (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(err);
      }
    });

    server.listen(port, "127.0.0.1");
  });
}

/**
 * Initiate the OAuth login flow.
 *
 * 1. Generate state token
 * 2. Find available port and start local HTTP server for callback
 * 3. Open browser to console auth URL
 * 4. Wait for callback with token
 * 5. Store token in keychain
 */
export async function login(
  onStatusChange?: (status: string) => void
): Promise<AuthResult> {
  const config = getConfig();
  const state = generateState();

  // Find available port
  onStatusChange?.("Starting authentication server...");
  let port: number;
  try {
    port = await findAvailablePort(8080, 8099);
  } catch (err) {
    return {
      success: false,
      error: `Failed to find available port: ${err}`,
    };
  }

  // Start server (but don't await yet)
  const serverPromise = startAuthServer(port, state);

  // Build auth URL
  const callbackUrl = `http://localhost:${port}/callback`;
  const authUrl = `${config.consoleUrl}/auth/cli?state=${state}&redirect_uri=${encodeURIComponent(callbackUrl)}`;

  onStatusChange?.("Opening browser for authentication...");

  // Open browser
  try {
    await open(authUrl);
  } catch (err) {
    return {
      success: false,
      error: `Failed to open browser: ${err}`,
    };
  }

  onStatusChange?.("Waiting for authentication...");

  // Wait for callback
  try {
    const result = await serverPromise;

    // Store token
    onStatusChange?.("Storing credentials...");
    await storeToken(result.token, new Date(result.expiresAt));

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Log out by clearing stored credentials.
 */
export async function logout(): Promise<void> {
  await clearToken();
}

/**
 * Check if user is currently authenticated with a valid token.
 */
export async function isAuthenticated(): Promise<boolean> {
  return hasValidToken();
}

/**
 * Get the current stored token if valid.
 */
export async function getCurrentToken(): Promise<StoredToken | null> {
  return getToken();
}

/**
 * Get the current authentication state.
 */
export async function getAuthState(): Promise<AuthState> {
  const authenticated = await isAuthenticated();
  return authenticated ? "authenticated" : "unauthenticated";
}

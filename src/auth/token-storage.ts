import keytar from "keytar";

const SERVICE_NAME = "groupchat";
const TOKEN_ACCOUNT = "auth-token";
const EXPIRY_ACCOUNT = "auth-token-expiry";

export interface StoredToken {
  token: string;
  expiresAt: Date;
}

/**
 * Store authentication token in the OS keychain.
 */
export async function storeToken(
  token: string,
  expiresAt: Date
): Promise<void> {
  await keytar.setPassword(SERVICE_NAME, TOKEN_ACCOUNT, token);
  await keytar.setPassword(SERVICE_NAME, EXPIRY_ACCOUNT, expiresAt.toISOString());
}

/**
 * Retrieve token from keychain if it exists and hasn't expired.
 */
export async function getToken(): Promise<StoredToken | null> {
  const token = await keytar.getPassword(SERVICE_NAME, TOKEN_ACCOUNT);
  const expiryStr = await keytar.getPassword(SERVICE_NAME, EXPIRY_ACCOUNT);

  if (!token || !expiryStr) {
    return null;
  }

  const expiresAt = new Date(expiryStr);

  // Check if token has expired
  if (expiresAt <= new Date()) {
    await clearToken();
    return null;
  }

  return { token, expiresAt };
}

/**
 * Clear stored token from keychain (logout).
 */
export async function clearToken(): Promise<void> {
  await keytar.deletePassword(SERVICE_NAME, TOKEN_ACCOUNT);
  await keytar.deletePassword(SERVICE_NAME, EXPIRY_ACCOUNT);
}

/**
 * Check if a valid (non-expired) token exists.
 */
export async function hasValidToken(): Promise<boolean> {
  const stored = await getToken();
  return stored !== null;
}

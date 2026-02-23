// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
const SERVICE_NAME = "groupchat";
const CREDENTIAL_NAME = "auth-credentials";

export interface StoredToken {
  token: string;
  expiresAt: Date;
}

interface StoredCredentials {
  token: string;
  expiresAt: string;
}

let cachedCredentials: StoredToken | null | undefined = undefined;

/**
 * Store authentication token in the OS keychain.
 */
export async function storeToken(
  token: string,
  expiresAt: Date
): Promise<void> {
  const credentials: StoredCredentials = {
    token,
    expiresAt: expiresAt.toISOString(),
  };
  await Bun.secrets.set({
    service: SERVICE_NAME,
    name: CREDENTIAL_NAME,
    value: JSON.stringify(credentials),
  });
  cachedCredentials = { token, expiresAt };
}

/**
 * Retrieve token from keychain if it exists and hasn't expired.
 */
export async function getToken(): Promise<StoredToken | null> {
  if (cachedCredentials !== undefined) {
    return cachedCredentials;
  }

  const raw = await Bun.secrets.get({
    service: SERVICE_NAME,
    name: CREDENTIAL_NAME,
  });

  if (!raw) {
    cachedCredentials = null;
    return null;
  }

  try {
    const credentials = JSON.parse(raw) as StoredCredentials;
    const expiresAt = new Date(credentials.expiresAt);

    if (expiresAt <= new Date()) {
      await clearToken();
      return null;
    }

    cachedCredentials = { token: credentials.token, expiresAt };
    return cachedCredentials;
  } catch {
    cachedCredentials = null;
    return null;
  }
}

/**
 * Clear stored token from keychain (logout).
 */
export async function clearToken(): Promise<void> {
  await Bun.secrets.delete({ service: SERVICE_NAME, name: CREDENTIAL_NAME });
  cachedCredentials = null;
}

/**
 * Check if a valid (non-expired) token exists.
 */
export async function hasValidToken(): Promise<boolean> {
  const stored = await getToken();
  return stored !== null;
}

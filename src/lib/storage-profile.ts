// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar

/**
 * Keep local development credentials separate from the published CLI while
 * preserving the production credential names used by existing installations.
 */
export function resolveStorageProfile(
  explicitProfile = process.env.GROUPCHAT_PROFILE,
  nodeEnv = process.env.NODE_ENV
): string | null {
  const profile = explicitProfile?.trim()

  if (profile) {
    return profile
  }

  return nodeEnv === "production" ? null : "dev"
}

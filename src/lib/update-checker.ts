// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Svapnil Ankolkar
import { rename, unlink, writeFile, chmod } from "fs/promises"

const PACKAGE_VERSION =
  process.env.__GROUPCHAT_VERSION__ ??
  process.env.npm_package_version ??
  "0.0.0"

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
}

/**
 * Fetches the latest version from GitHub Releases
 */
async function fetchLatestVersion(): Promise<string | null> {
  try {
    const response = await fetch(
      "https://api.github.com/repos/svapnil/groupchat/releases/latest",
      {
        headers: {
          Accept: "application/vnd.github+json",
        },
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { tag_name?: unknown };
    if (typeof data.tag_name !== "string") return null;
    // Strip leading "v" (e.g., "v0.1.7" → "0.1.7")
    return data.tag_name.replace(/^v/, "");
  } catch {
    // Network error or timeout - fail silently
    return null;
  }
}

/**
 * Compares two semver versions
 * Returns true if v2 is greater than v1
 */
function isNewerVersion(current: string, latest: string): boolean {
  const parseVersion = (v: string) =>
    v.split(".").map((n) => parseInt(n, 10) || 0);

  const currentParts = parseVersion(current);
  const latestParts = parseVersion(latest);

  for (let i = 0; i < 3; i++) {
    const c = currentParts[i] || 0;
    const l = latestParts[i] || 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

/**
 * Checks if an update is available for the package
 */
export async function checkForUpdate(): Promise<UpdateInfo> {
  const currentVersion = PACKAGE_VERSION;

  const latestVersion = await fetchLatestVersion();

  if (!latestVersion) {
    return {
      currentVersion,
      latestVersion: currentVersion,
      updateAvailable: false,
    };
  }

  return {
    currentVersion,
    latestVersion,
    updateAvailable: isNewerVersion(currentVersion, latestVersion),
  };
}

/**
 * Returns the GitHub Release asset name for the current platform/arch
 */
function getAssetName(): string {
  const platform = process.platform;
  const arch = process.arch;
  const base = `groupchat-${platform}-${arch}`;
  return platform === "win32" ? `${base}.exe` : base;
}

/**
 * Downloads the latest binary from GitHub Releases and replaces the current one
 */
export async function performUpdate(version: string): Promise<void> {
  const binaryPath = process.execPath;
  const tmpPath = `${binaryPath}.tmp`;
  const assetName = getAssetName();
  const url = `https://github.com/svapnil/groupchat/releases/download/v${version}/${assetName}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Download failed: HTTP ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(tmpPath, buffer);

    if (process.platform !== "win32") {
      await chmod(tmpPath, 0o755);
    }

    await rename(tmpPath, binaryPath);
  } catch (err) {
    // Clean up temp file on failure
    try {
      await unlink(tmpPath);
    } catch {
      // ignore cleanup errors
    }
    throw err;
  }
}

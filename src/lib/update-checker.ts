import { createRequire } from "module";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);
const packageJson = require(join(__dirname, "../package.json"));

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
}

/**
 * Fetches the latest version from npm registry
 */
async function fetchLatestVersion(packageName: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://registry.npmjs.org/${packageName}/latest`,
      {
        headers: {
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(5000), // 5 second timeout
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { version?: unknown };
    return typeof data.version === "string" ? data.version : null;
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
  const currentVersion = packageJson.version;
  const packageName = packageJson.name;

  const latestVersion = await fetchLatestVersion(packageName);

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
 * Returns the npm install command for updating
 */
export function getUpdateCommand(): string {
  return `npm install -g ${packageJson.name}`;
}

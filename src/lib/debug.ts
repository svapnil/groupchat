import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { inspect } from "node:util";

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

const DEBUG_ENABLED = isTruthy(process.env.GROUPCHAT_DEBUG);
const WRITE_TO_STDERR = isTruthy(process.env.GROUPCHAT_DEBUG_STDERR);
const DEBUG_FILE_PATH = resolve(
  process.cwd(),
  process.env.GROUPCHAT_DEBUG_FILE || ".logs/tui-debug.log"
);

let hasPreparedLogPath = false;

function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  return TRUE_VALUES.has(value.toLowerCase());
}

function ensureLogPath(): void {
  if (!DEBUG_ENABLED || hasPreparedLogPath) return;
  mkdirSync(dirname(DEBUG_FILE_PATH), { recursive: true });
  hasPreparedLogPath = true;
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  return inspect(value, { depth: 5, colors: false, breakLength: 120 });
}

export function debugLog(scope: string, ...args: unknown[]): void {
  if (!DEBUG_ENABLED) return;

  ensureLogPath();
  const line = `${new Date().toISOString()} [${scope}] ${args.map(formatValue).join(" ")}`;

  if (WRITE_TO_STDERR) {
    process.stderr.write(`${line}\n`);
  }

  try {
    appendFileSync(DEBUG_FILE_PATH, `${line}\n`, "utf8");
  } catch (error) {
    process.stderr.write(
      `${new Date().toISOString()} [debug-log] failed to append: ${formatValue(error)}\n`
    );
  }
}


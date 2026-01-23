import type { WriteStream } from "tty";

export type NotificationType = "bell" | "alert";

export interface NotificationConfig {
  enabled: boolean;
  minIntervalMs: number; // Rate limiting (default: 500ms)
}

const DEFAULT_CONFIG: NotificationConfig = {
  enabled: true,
  minIntervalMs: 500,
};

export class NotificationManager {
  private stdout: WriteStream | null = null;
  private config: NotificationConfig;
  private lastNotificationTime: number = 0;

  constructor(config?: Partial<NotificationConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setStdout(stdout: WriteStream): void {
    this.stdout = stdout;
  }

  configure(config: Partial<NotificationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  notify(type: NotificationType = "bell"): boolean {
    if (!this.config.enabled) {
      return false;
    }

    const now = Date.now();
    if (now - this.lastNotificationTime < this.config.minIntervalMs) {
      return false; // Rate limited
    }

    this.lastNotificationTime = now;

    if (type === "bell") {
      this.sendBell();
    }

    return true;
  }

  private sendBell(): void {
    this.stdout?.write("\x07");
  }
}

// Singleton instance
let instance: NotificationManager | null = null;

export function getNotificationManager(): NotificationManager {
  if (!instance) {
    instance = new NotificationManager();
  }
  return instance;
}

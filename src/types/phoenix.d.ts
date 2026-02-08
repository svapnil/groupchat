declare module "phoenix" {
  export interface SocketOptions {
    params?: Record<string, unknown>;
    reconnectAfterMs?: (tries: number) => number;
  }

  export class Socket {
    constructor(endPoint: string, opts?: SocketOptions);
    connect(): void;
    disconnect(callback?: () => void, code?: number, reason?: string): void;
    channel(topic: string, chanParams?: Record<string, unknown>): Channel;
    onOpen(callback: () => void): void;
    onClose(callback: () => void): void;
    onError(callback: (error: unknown) => void): void;
  }

  export class Channel {
    join(timeout?: number): Push;
    leave(timeout?: number): Push;
    on(event: string, callback: (payload: unknown) => void): void;
    off(event: string): void;
    push(event: string, payload?: unknown, timeout?: number): Push;
    onClose(callback: () => void): void;
    onError(callback: (reason: unknown) => void): void;
  }

  export class Push {
    receive(status: string, callback: (response: unknown) => void): Push;
  }
}

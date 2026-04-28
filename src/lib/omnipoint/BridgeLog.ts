// BridgeLog — append-only ring buffer of bridge lifecycle events.
// Components subscribe via useSyncExternalStore to render a live console.

export type BridgeLogLevel = "info" | "ok" | "warn" | "error" | "debug";
export type BridgeLogSource =
  | "ws"
  | "probe"
  | "heartbeat"
  | "reconnect"
  | "daemon"
  | "port"
  | "system";

export interface BridgeLogEntry {
  id: number;
  ts: number;
  level: BridgeLogLevel;
  source: BridgeLogSource;
  message: string;
  data?: Record<string, unknown>;
}

const CAP = 250;
let buffer: BridgeLogEntry[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export const BridgeLog = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  get(): BridgeLogEntry[] {
    return buffer;
  },
  push(
    level: BridgeLogLevel,
    source: BridgeLogSource,
    message: string,
    data?: Record<string, unknown>,
  ) {
    const entry: BridgeLogEntry = {
      id: nextId++,
      ts: Date.now(),
      level,
      source,
      message,
      data,
    };
    buffer = [...buffer, entry];
    if (buffer.length > CAP) buffer = buffer.slice(buffer.length - CAP);
    emit();
  },
  clear() {
    buffer = [];
    emit();
  },
};

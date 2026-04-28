// BridgeStatusBanner — non-intrusive top banner that surfaces the current
// HIDBridge auto-reconnect state with a clear, human-friendly message.
// Visible only in BRIDGE control mode and only when something is wrong or
// in-flight. Driven by TelemetryStore.bridgeError populated by HIDBridge.

import { useSyncExternalStore } from "react";
import { TelemetryStore } from "@/lib/omnipoint/TelemetryStore";

interface Props {
  active: boolean;
  onReconnect: () => void;
  onOpenTroubleshooter: () => void;
}

export function BridgeStatusBanner({ active, onReconnect, onOpenTroubleshooter }: Props) {
  const t = useSyncExternalStore(
    (cb) => TelemetryStore.subscribe(cb),
    () => TelemetryStore.get(),
    () => TelemetryStore.get(),
  );

  if (!active) return null;
  const e = t.bridgeError;
  // Hide while idle or while everything is healthy.
  if (e.code === "idle" || e.code === "ok") return null;

  const tone =
    e.code === "connecting" ? "info" :
    e.code === "retrying" ? "warn" :
    "error";

  const colors =
    tone === "info"
      ? "border-primary/50 bg-primary/10 text-primary"
      : tone === "warn"
        ? "border-amber-500/50 bg-amber-500/10 text-amber-300"
        : "border-destructive/60 bg-destructive/10 text-destructive";

  const icon = tone === "error" ? "▲" : tone === "warn" ? "↻" : "●";
  const title =
    e.code === "connecting" ? "CONNECTING TO BRIDGE" :
    e.code === "retrying" ? "BRIDGE UNREACHABLE — AUTO-RETRYING" :
    e.code === "refused" ? "BRIDGE REFUSED CONNECTION" :
    e.code === "timeout" ? "BRIDGE TIMED OUT" :
    e.code === "invalid_url" ? "BRIDGE URL INVALID" :
    "BRIDGE ERROR";

  return (
    <div
      className={`fixed top-2 left-1/2 -translate-x-1/2 z-50 panel border ${colors} px-4 py-2 flex items-center gap-3 max-w-[92vw]`}
      style={{ minWidth: 360 }}
      role="status"
    >
      <span className="font-mono text-[14px] leading-none">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="font-mono text-[10px] tracking-[0.3em] leading-tight">
          {title}
        </div>
        <div className="font-mono text-[10.5px] text-foreground/90 leading-snug truncate">
          {e.message}
        </div>
      </div>
      <button
        onClick={onReconnect}
        className="font-mono text-[10px] tracking-[0.25em] px-3 h-8 border hairline text-foreground hover:bg-card/40"
      >
        ↻ RETRY NOW
      </button>
      {(e.code === "refused" || e.code === "timeout" || e.code === "invalid_url") && (
        <button
          onClick={onOpenTroubleshooter}
          className="font-mono text-[10px] tracking-[0.25em] px-3 h-8 border hairline text-foreground hover:bg-card/40"
        >
          ? HELP
        </button>
      )}
    </div>
  );
}
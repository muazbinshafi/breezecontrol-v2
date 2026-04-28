// DualHandDebugOverlay — floating debug panel that shows MediaPipe's raw
// per-frame hand detection: how many hands were returned, each hand's slot
// index, resolved side, classifier confidence and on-screen bbox. Useful
// when diagnosing "why is only one hand being detected" complaints.

import { useSyncExternalStore, useState } from "react";
import { TelemetryStore } from "@/lib/omnipoint/TelemetryStore";

export function DualHandDebugOverlay() {
  const t = useSyncExternalStore(
    (cb) => TelemetryStore.subscribe(cb),
    () => TelemetryStore.get(),
    () => TelemetryStore.get(),
  );
  const [collapsed, setCollapsed] = useState(false);

  const slotCount = t.handsDetected;
  const slots = t.handsDebug;
  const statusColor =
    slotCount === 0 ? "text-muted-foreground" :
    slotCount === 1 ? "text-amber-400" :
    "text-emerald-glow";

  return (
    <div
      className="pointer-events-auto fixed bottom-4 left-4 z-40 panel font-mono text-[10px] tracking-wider select-none"
      style={{ minWidth: 240, maxWidth: 320 }}
    >
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 border-b hairline hover:bg-card/40"
      >
        <span className="tracking-[0.25em] text-muted-foreground">
          ▌ DUAL-HAND DEBUG
        </span>
        <span className={`tracking-[0.25em] ${statusColor}`}>
          {slotCount}/2 HANDS
        </span>
      </button>
      {!collapsed && (
        <div className="p-3 space-y-2">
          {slotCount === 0 && (
            <div className="text-muted-foreground">
              No hands detected. Show one or both hands to the camera.
            </div>
          )}
          {slotCount === 1 && (
            <div className="text-amber-400 leading-snug">
              Only one hand detected. To enable dual-hand control, show your
              second hand fully in frame and keep them ~20 cm apart.
            </div>
          )}
          {slotCount === 2 && (
            <div className="text-emerald-glow leading-snug">
              ✓ Both hands tracked simultaneously.
            </div>
          )}
          <div className="space-y-1.5 pt-1">
            {slots.map((s) => (
              <div
                key={s.index}
                className={`border hairline p-2 ${
                  s.isPrimary ? "border-primary/60 bg-primary/5" : ""
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-foreground">
                    SLOT {s.index} · {s.side.toUpperCase()}
                    {s.isPrimary && (
                      <span className="ml-2 text-primary">PRIMARY</span>
                    )}
                  </span>
                  <span
                    className={
                      s.confidence >= 0.7 ? "text-emerald-glow" :
                      s.confidence >= 0.4 ? "text-amber-400" :
                      "text-destructive"
                    }
                  >
                    {(s.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="text-muted-foreground">
                  pos {s.wrist.x.toFixed(2)},{s.wrist.y.toFixed(2)} ·
                  {" "}size {s.bbox.w.toFixed(2)}×{s.bbox.h.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
          <div className="pt-1 text-[9px] text-muted-foreground/80 leading-snug border-t hairline mt-2">
            FPS {t.fps} · INF {t.inferenceMs.toFixed(0)}ms · MediaPipe numHands=2
          </div>
        </div>
      )}
    </div>
  );
}
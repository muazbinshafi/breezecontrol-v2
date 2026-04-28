// PerformanceHUD — lightweight, optional overlay showing FPS, inference
// latency and confidence. Polls the TelemetryStore inside an rAF loop to
// avoid hammering React state on every frame.

import { useEffect, useRef, useState } from "react";
import { Activity, X } from "lucide-react";
import { TelemetryStore } from "@/lib/omnipoint/TelemetryStore";

const STORAGE_KEY = "omnipoint.perfHud.visible";

function loadVisible(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "1";
}

export function PerformanceHUD() {
  const [visible, setVisible] = useState<boolean>(() => loadVisible());
  const [stats, setStats] = useState({ fps: 0, ms: 0, conf: 0 });
  const rafRef = useRef(0);
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, visible ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const tick = () => {
      const now = performance.now();
      // throttle React updates to ~5 Hz
      if (now - lastUpdateRef.current > 200) {
        const s = TelemetryStore.get();
        setStats({ fps: s.fps, ms: s.inferenceMs, conf: s.confidence });
        lastUpdateRef.current = now;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [visible]);

  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        title="Show performance HUD"
        className="fixed bottom-3 left-3 z-40 font-mono text-[10px] tracking-[0.3em] px-2.5 h-8 inline-flex items-center gap-1.5 border hairline text-muted-foreground hover:text-foreground bg-card/60 backdrop-blur"
      >
        <Activity className="w-3 h-3" />
        FPS
      </button>
    );
  }

  const fpsColor =
    stats.fps >= 45 ? "text-[hsl(var(--success))]" : stats.fps >= 25 ? "text-warning" : "text-destructive";
  const msColor =
    stats.ms <= 18 ? "text-[hsl(var(--success))]" : stats.ms <= 35 ? "text-warning" : "text-destructive";

  return (
    <div className="fixed bottom-3 left-3 z-40 font-mono text-[10px] tracking-[0.2em] bg-card/80 backdrop-blur border hairline px-2.5 py-2 flex items-center gap-3">
      <div className="flex items-center gap-1.5">
        <Activity className="w-3 h-3 text-primary" />
        <span className="text-muted-foreground">PERF</span>
      </div>
      <Stat label="FPS" value={stats.fps.toFixed(0)} colorClass={fpsColor} />
      <Stat label="MS" value={stats.ms.toFixed(0)} colorClass={msColor} />
      <Stat
        label="CONF"
        value={(stats.conf * 100).toFixed(0)}
        colorClass={stats.conf > 0.7 ? "text-[hsl(var(--success))]" : "text-warning"}
      />
      <button
        onClick={() => setVisible(false)}
        className="text-muted-foreground hover:text-foreground"
        aria-label="Hide HUD"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

function Stat({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: string;
  colorClass: string;
}) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${colorClass}`}>{value}</span>
    </div>
  );
}

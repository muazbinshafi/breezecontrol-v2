// TelemetryQualityBadge — at-a-glance quality readout (FPS · confidence ·
// inference latency) shown in the demo header. Color-coded so users can
// instantly see if their setup is healthy.

import { useTelemetry } from "@/hooks/useTelemetry";
import { Activity, Wifi, WifiOff, Crosshair } from "lucide-react";

export function TelemetryQualityBadge() {
  const t = useTelemetry();

  // Composite quality score (0..100). FPS contributes 50%, confidence 35%,
  // inference latency 15% (lower is better).
  const fpsScore = Math.min(1, t.fps / 30);
  const confScore = Math.min(1, t.confidence);
  const latScore = Math.max(0, Math.min(1, 1 - t.inferenceMs / 60));
  const score = Math.round((fpsScore * 0.5 + confScore * 0.35 + latScore * 0.15) * 100);

  const tier =
    !t.handPresent && t.initialized
      ? { label: "NO HAND", cls: "text-muted-foreground border-border bg-card/60" }
      : score >= 75
        ? { label: "EXCELLENT", cls: "text-primary border-primary/40 bg-primary/10" }
        : score >= 50
          ? { label: "GOOD", cls: "text-[hsl(var(--warning))] border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/10" }
          : { label: "POOR", cls: "text-destructive border-destructive/40 bg-destructive/10" };

  return (
    <div
      className={`hidden sm:inline-flex items-center gap-2 px-2.5 h-9 border backdrop-blur font-mono text-[10px] tracking-[0.25em] ${tier.cls}`}
      title={`Quality ${score}/100 · ${t.fps} FPS · ${(t.confidence * 100).toFixed(0)}% conf · ${t.inferenceMs.toFixed(1)}ms infer`}
      aria-label={`Sensor quality: ${tier.label}, ${score} out of 100`}
    >
      {t.handPresent ? (
        <Activity className="w-3.5 h-3.5" />
      ) : (
        <WifiOff className="w-3.5 h-3.5" />
      )}
      <span>{tier.label}</span>
      <span className="text-foreground/80">{score}</span>
      {t.precisionMode && t.handPresent && (
        <span
          className="hidden md:inline-flex items-center gap-1 ml-1 pl-2 border-l border-current/30 text-primary"
          title="Precision mode active — cursor locked for sub-mm targeting"
        >
          <Crosshair className="w-3 h-3" />
          <span className="tracking-[0.3em]">PRECISION</span>
        </span>
      )}
      <div className="hidden md:flex items-center gap-1.5 ml-1 pl-2 border-l border-current/30 opacity-80">
        <span>{t.fps}</span>
        <span className="opacity-60">FPS</span>
        <Wifi className="w-3 h-3 opacity-60" />
        <span>{(t.confidence * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}

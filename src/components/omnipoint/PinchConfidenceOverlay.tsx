// PinchConfidenceOverlay — a live, on-screen readout of the normalized
// pinch ratio and detection confidence, with the active click/release
// thresholds drawn as horizontal lines so the user can SEE exactly when a
// pinch fires vs releases. Lets people fine-tune draw-tool gestures
// (pinch vs thumb-only) without guesswork.

import { useEffect, useRef, useState } from "react";
import { TelemetryStore } from "@/lib/omnipoint/TelemetryStore";
import { GestureSettingsStore } from "@/lib/omnipoint/GestureSettings";
import { Activity, X } from "lucide-react";

interface Props {
  visible: boolean;
  onClose?: () => void;
}

export function PinchConfidenceOverlay({ visible, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const samplesRef = useRef<{ pinch: number; conf: number }[]>([]);
  const [live, setLive] = useState({ pinch: 0, conf: 0, gesture: "none" as string });

  useEffect(() => {
    if (!visible) return;
    let raf = 0;
    const tick = () => {
      const t = TelemetryStore.get();
      const sample = { pinch: t.pinchDistance, conf: t.confidence };
      samplesRef.current.push(sample);
      if (samplesRef.current.length > 180) samplesRef.current.shift();
      setLive({ pinch: t.pinchDistance, conf: t.confidence, gesture: t.gesture });
      drawGraph();
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  function drawGraph() {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = c.clientWidth, h = c.clientHeight;
    if (c.width !== w * dpr || c.height !== h * dpr) {
      c.width = w * dpr; c.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    ctx.clearRect(0, 0, w, h);

    // Background grid
    ctx.strokeStyle = "hsl(var(--border))";
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.4;
    for (let i = 0; i <= 4; i++) {
      const y = (h / 4) * i;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Pinch ratio range expanded to 0..2.0 to fit new index-MCP-based scale.
    const MAX = 2.0;
    const samples = samplesRef.current;
    const xStep = w / Math.max(60, samples.length);

    // Threshold bands (click/release)
    const cfg = GestureSettingsStore.get().engineConfig;
    const click = cfg?.clickThreshold ?? 0.62;
    const release = cfg?.releaseThreshold ?? 0.78;
    const yClick = h - (click / MAX) * h;
    const yRelease = h - (release / MAX) * h;

    ctx.fillStyle = "hsl(var(--primary) / 0.10)";
    ctx.fillRect(0, yClick, w, h - yClick);
    ctx.fillStyle = "hsl(var(--muted) / 0.18)";
    ctx.fillRect(0, yRelease, w, yClick - yRelease);

    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "hsl(var(--primary))";
    ctx.beginPath(); ctx.moveTo(0, yClick); ctx.lineTo(w, yClick); ctx.stroke();
    ctx.strokeStyle = "hsl(var(--muted-foreground))";
    ctx.beginPath(); ctx.moveTo(0, yRelease); ctx.lineTo(w, yRelease); ctx.stroke();
    ctx.setLineDash([]);

    // Pinch trace
    ctx.strokeStyle = "hsl(var(--primary))";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    samples.forEach((s, i) => {
      const x = i * xStep;
      const y = h - (Math.min(MAX, s.pinch) / MAX) * h;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Confidence trace (thin, accent)
    ctx.strokeStyle = "hsl(var(--accent-foreground) / 0.6)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    samples.forEach((s, i) => {
      const x = i * xStep;
      const y = h - s.conf * h;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  if (!visible) return null;

  const cfg = GestureSettingsStore.get().engineConfig;
  const click = cfg?.clickThreshold ?? 0.62;
  const release = cfg?.releaseThreshold ?? 0.78;
  const pinchPct = Math.min(1, live.pinch / 2.0) * 100;
  const fired = live.pinch > 0 && live.pinch < click;

  return (
    <div className="absolute top-20 right-2 z-[60] panel backdrop-blur w-[280px] sm:w-[320px] p-3 shadow-lg">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-primary" />
          <span className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground">
            PINCH MONITOR
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close pinch overlay"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <canvas
        ref={canvasRef}
        className="w-full h-24 border hairline bg-background/60"
      />

      <div className="grid grid-cols-3 gap-2 mt-2 font-mono text-[10px]">
        <div>
          <div className="tracking-[0.2em] text-muted-foreground">PINCH</div>
          <div className={`text-base ${fired ? "text-primary" : "text-foreground"}`}>
            {live.pinch.toFixed(2)}
          </div>
        </div>
        <div>
          <div className="tracking-[0.2em] text-muted-foreground">CONF</div>
          <div className="text-base">{(live.conf * 100).toFixed(0)}%</div>
        </div>
        <div>
          <div className="tracking-[0.2em] text-muted-foreground">STATE</div>
          <div className={`text-base ${fired ? "text-primary" : "text-muted-foreground"}`}>
            {fired ? "FIRED" : "IDLE"}
          </div>
        </div>
      </div>

      <div className="mt-2 h-1.5 bg-muted/40 rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${pinchPct}%` }}
        />
      </div>

      <div className="mt-2 font-mono text-[9px] tracking-[0.2em] text-muted-foreground leading-relaxed">
        CLICK ≤ {click.toFixed(2)} · RELEASE ≥ {release.toFixed(2)}
        <br />
        TIP: lower CLICK if pinch under-fires, raise it if thumb-only triggers.
      </div>
    </div>
  );
}

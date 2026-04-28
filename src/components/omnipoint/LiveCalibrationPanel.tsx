// LiveCalibrationPanel — floating, always-on calibration & diagnostics overlay.
//
// Why this exists:
// "Searching" / "Sensor Lost" used to get stuck because the engine had no
// recovery path and no way to live-tune the thresholds that gate hand
// acceptance. This panel surfaces every signal that matters (FPS, inference,
// confidence, landmark count, handedness, finger states, pinch ratio) AND
// exposes the live-tunable knobs — plus a Force Reset that hard-clears every
// filter / click-state-machine so the engine can never be "wedged".
//
// The detection-confidence floors are baked into the MediaPipe model at init
// time, so we let the user tune them and persist the choice for the next
// session (with a clear "Apply on next start" hint).

import { useEffect, useState } from "react";
import { Activity, X, RefreshCw, Eye, EyeOff } from "lucide-react";
import { useTelemetry } from "@/hooks/useTelemetry";
import type { EngineConfig } from "@/lib/omnipoint/GestureEngine";

const FLOORS_STORAGE = "omnipoint.detectionFloors.v1";

export interface DetectionFloors {
  minHandDetectionConfidence: number;
  minHandPresenceConfidence: number;
  minTrackingConfidence: number;
}

export const defaultDetectionFloors: DetectionFloors = {
  minHandDetectionConfidence: 0.3,
  minHandPresenceConfidence: 0.3,
  minTrackingConfidence: 0.3,
};

export function loadDetectionFloors(): DetectionFloors {
  try {
    const raw = localStorage.getItem(FLOORS_STORAGE);
    if (!raw) return defaultDetectionFloors;
    const parsed = JSON.parse(raw);
    return { ...defaultDetectionFloors, ...parsed };
  } catch {
    return defaultDetectionFloors;
  }
}

export function saveDetectionFloors(floors: DetectionFloors) {
  try {
    localStorage.setItem(FLOORS_STORAGE, JSON.stringify(floors));
  } catch {
    /* ignore */
  }
}

interface Props {
  open: boolean;
  onClose: () => void;
  config: EngineConfig;
  setConfig: (patch: Partial<EngineConfig>) => void;
  onForceReset: () => void;
}

export function LiveCalibrationPanel({
  open,
  onClose,
  config,
  setConfig,
  onForceReset,
}: Props) {
  const t = useTelemetry();
  const [floors, setFloors] = useState<DetectionFloors>(() => loadDetectionFloors());
  const [showOverlay, setShowOverlay] = useState(true);

  useEffect(() => {
    saveDetectionFloors(floors);
  }, [floors]);

  if (!open) return null;

  const stuck = t.sensorLost && t.fps > 0;
  const status: { label: string; tone: "ok" | "warn" | "err" } = !t.initialized
    ? { label: "ENGINE NOT STARTED", tone: "warn" }
    : t.sensorLost
    ? { label: "SENSOR LOST · RAISE/RECENTER HAND", tone: "err" }
    : t.handPresent
    ? { label: `TRACKING · ${t.handedness.toUpperCase()} HAND`, tone: "ok" }
    : { label: "SEARCHING…", tone: "warn" };

  return (
    <aside
      className={`fixed z-[2147483644] right-3 top-20 w-[320px] max-h-[calc(100dvh-6rem)] overflow-y-auto bg-card/95 backdrop-blur border border-border shadow-2xl ${
        showOverlay ? "" : "translate-x-[calc(100%-44px)]"
      } transition-transform`}
    >
      <header className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b hairline px-3 h-10 flex items-center justify-between">
        <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.3em] text-emerald-glow">
          <Activity className="w-3.5 h-3.5" />
          LIVE CALIBRATION
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowOverlay((v) => !v)}
            className="text-muted-foreground hover:text-foreground p-1"
            aria-label={showOverlay ? "Collapse panel" : "Expand panel"}
            title={showOverlay ? "Collapse" : "Expand"}
          >
            {showOverlay ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1"
            aria-label="Close calibration panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {showOverlay && (
        <div className="p-3 space-y-3">
          {/* Status */}
          <div
            className={`px-2 py-2 border font-mono text-[10px] tracking-[0.2em] ${
              status.tone === "ok"
                ? "border-emerald-glow/60 text-emerald-glow"
                : status.tone === "err"
                ? "border-destructive/70 text-destructive"
                : "border-amber-500/60 text-amber-400"
            }`}
          >
            {status.label}
          </div>

          {stuck && (
            <button
              onClick={onForceReset}
              className="w-full inline-flex items-center justify-center gap-2 h-9 border border-destructive text-destructive hover:bg-destructive/10 font-mono text-[10px] tracking-[0.3em]"
            >
              <RefreshCw className="w-3.5 h-3.5" /> FORCE RESET DETECTOR
            </button>
          )}

          {/* Live metrics */}
          <Section title="LIVE METRICS">
            <Metric label="FPS" value={t.fps.toFixed(0)} />
            <Metric label="INFER MS" value={t.inferenceMs.toFixed(1)} />
            <Metric
              label="CONF"
              value={t.confidence.toFixed(2)}
              barPct={t.confidence * 100}
            />
            <Metric
              label="LANDMARKS"
              value={`${t.landmarks.length}/21`}
              barPct={(t.landmarks.length / 21) * 100}
            />
            <Metric
              label="FINGERS"
              value={`${t.fingerCount}/5 · ${t.fingersExtended
                .map((b) => (b ? "1" : "0"))
                .join("")}`}
            />
            <Metric label="PINCH RATIO" value={t.pinchDistance.toFixed(3)} />
            <Metric label="HAND" value={t.handedness.toUpperCase()} />
            <Metric label="GESTURE" value={t.gesture.toUpperCase()} />
          </Section>

          {/* Live thresholds */}
          <Section title="LIVE THRESHOLDS (apply now)">
            <Slider
              label="CLICK PINCH"
              value={config.clickThreshold}
              min={0.2}
              max={1.2}
              step={0.01}
              onChange={(v) =>
                setConfig({
                  clickThreshold: v,
                  releaseThreshold: Math.max(v + 0.05, config.releaseThreshold),
                })
              }
              hint="Lower = easier to click (closer fingers required)"
            />
            <Slider
              label="RELEASE"
              value={config.releaseThreshold}
              min={config.clickThreshold + 0.02}
              max={1.5}
              step={0.01}
              onChange={(v) => setConfig({ releaseThreshold: v })}
              hint="Hysteresis — must exceed to release click"
            />
            <Slider
              label="SMOOTHING"
              value={config.smoothingAlpha}
              min={0.3}
              max={4}
              step={0.05}
              onChange={(v) => setConfig({ smoothingAlpha: v })}
              hint="Higher = snappier, lower = silkier"
            />
            <Slider
              label="DEAD ZONE"
              value={config.deadZone}
              min={0}
              max={0.005}
              step={0.0001}
              onChange={(v) => setConfig({ deadZone: v })}
              hint="Ignore micro-jitter below this speed"
            />
            <Slider
              label="SENSITIVITY"
              value={config.sensitivity}
              min={0.5}
              max={4}
              step={0.05}
              onChange={(v) => setConfig({ sensitivity: v })}
            />
          </Section>

          {/* Detection floors (apply on restart) */}
          <Section title="DETECTION FLOORS (next start)">
            <Slider
              label="DETECT CONF"
              value={floors.minHandDetectionConfidence}
              min={0.05}
              max={0.9}
              step={0.05}
              onChange={(v) =>
                setFloors((f) => ({ ...f, minHandDetectionConfidence: v }))
              }
              hint="Lower = picks up weaker / further hands"
            />
            <Slider
              label="PRESENCE"
              value={floors.minHandPresenceConfidence}
              min={0.05}
              max={0.9}
              step={0.05}
              onChange={(v) =>
                setFloors((f) => ({ ...f, minHandPresenceConfidence: v }))
              }
            />
            <Slider
              label="TRACK CONF"
              value={floors.minTrackingConfidence}
              min={0.05}
              max={0.9}
              step={0.05}
              onChange={(v) =>
                setFloors((f) => ({ ...f, minTrackingConfidence: v }))
              }
            />
            <button
              onClick={() => setFloors(defaultDetectionFloors)}
              className="w-full mt-1 h-7 font-mono text-[10px] tracking-[0.3em] border hairline text-muted-foreground hover:text-foreground"
            >
              RESET FLOORS TO DEFAULTS
            </button>
            <p className="font-mono text-[9px] tracking-[0.18em] text-muted-foreground/80 leading-relaxed">
              These are baked into the model at init. Restart the sensor to
              apply.
            </p>
          </Section>

          {/* Always-available manual reset */}
          <button
            onClick={onForceReset}
            className="w-full inline-flex items-center justify-center gap-2 h-8 border hairline text-muted-foreground hover:text-foreground font-mono text-[10px] tracking-[0.3em]"
          >
            <RefreshCw className="w-3.5 h-3.5" /> RESET DETECTOR STATE
          </button>
        </div>
      )}
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground border-b hairline pb-1">
        {title}
      </div>
      {children}
    </div>
  );
}

function Metric({
  label,
  value,
  barPct,
}: {
  label: string;
  value: string;
  barPct?: number;
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.2em]">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground tabular-nums">{value}</span>
      </div>
      {barPct !== undefined && (
        <div className="h-1 bg-secondary overflow-hidden">
          <div
            className="h-full bg-primary transition-[width] duration-150"
            style={{ width: `${Math.max(0, Math.min(100, barPct))}%` }}
          />
        </div>
      )}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  hint?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.2em]">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground tabular-nums">
          {value.toFixed(step < 0.01 ? 4 : 2)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 mt-1 appearance-none bg-secondary accent-primary cursor-pointer"
      />
      {hint && (
        <p className="font-mono text-[9px] tracking-[0.18em] text-muted-foreground/70 mt-0.5">
          {hint}
        </p>
      )}
    </div>
  );
}

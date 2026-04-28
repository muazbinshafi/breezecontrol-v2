import { useTelemetry } from "@/hooks/useTelemetry";
import type { GestureKind } from "@/lib/omnipoint/TelemetryStore";

const FINGER_LABELS = ["THUMB", "INDEX", "MIDDLE", "RING", "PINKY"] as const;

const GESTURE_META: Record<GestureKind, { label: string; tone: "ok" | "warn" | "danger" | "muted" }> = {
  none:        { label: "—",            tone: "muted" },
  point:       { label: "POINT",        tone: "ok" },
  click:       { label: "CLICK",        tone: "ok" },
  right_click: { label: "RIGHT CLICK",  tone: "ok" },
  drag:        { label: "DRAG",         tone: "ok" },
  scroll_up:   { label: "SCROLL ▲",     tone: "ok" },
  scroll_down: { label: "SCROLL ▼",     tone: "ok" },
  thumbs_up:   { label: "THUMBS UP",    tone: "ok" },
  open_palm:   { label: "OPEN PALM · UNDO/BACK", tone: "warn" },
  palm_back:   { label: "PALM BACK · REDO", tone: "warn" },
  fist:        { label: "FIST",         tone: "danger" },
  pinky_only:  { label: "PINKY · ZOOM −", tone: "ok" },
  four_fingers:{ label: "FOUR · NEXT →",  tone: "ok" },
  middle_only: { label: "MIDDLE ONLY",   tone: "ok" },
  ring_only:   { label: "RING ONLY",     tone: "ok" },
  two_finger_point: { label: "TWO FINGERS", tone: "ok" },
  three_fingers: { label: "THREE FINGERS", tone: "ok" },
  peace:       { label: "PEACE",         tone: "ok" },
  rock:        { label: "ROCK",          tone: "warn" },
  phone_call:  { label: "PHONE CALL",    tone: "ok" },
};

/**
 * Detection HUD — overlay shown on top of the live camera feed.
 *
 * Designed for high contrast against arbitrary lighting:
 *   - Solid card surface (95% opacity) instead of low-opacity glass
 *   - Strong outer ring + drop shadow for separation from any background
 *   - 11–13px text (up from 9–11px) with bolder weights
 *   - Color-coded gesture banner with full-tone badge
 */
export function DetectionHUD() {
  const t = useTelemetry();
  const meta = GESTURE_META[t.gesture] ?? GESTURE_META.none;

  const gestureBanner =
    meta.tone === "ok"
      ? "bg-primary text-primary-foreground border-primary"
      : meta.tone === "warn"
      ? "bg-warning text-[hsl(224_40%_8%)] border-warning"
      : meta.tone === "danger"
      ? "bg-destructive text-destructive-foreground border-destructive"
      : "bg-secondary text-muted-foreground border-border";

  return (
    <div className="absolute top-3 left-3 z-30 w-[272px] select-none animate-fade-in">
      <div
        className="rounded-xl border border-border bg-card text-card-foreground"
        style={{
          // Strong, lighting-independent separation
          boxShadow:
            "0 0 0 1px hsl(0 0% 0% / 0.15), 0 12px 28px -8px hsl(0 0% 0% / 0.45), 0 2px 6px hsl(0 0% 0% / 0.25)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-3 h-9">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary led" />
            <span className="font-mono text-[11px] font-semibold tracking-[0.22em] text-foreground">
              DETECTION
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                t.handPresent ? "bg-primary led" : "bg-muted-foreground/60"
              }`}
            />
            <span
              className={`font-mono text-[10px] font-semibold tracking-[0.18em] ${
                t.handPresent ? "text-primary" : "text-muted-foreground"
              }`}
            >
              {t.handPresent ? "LOCKED" : "SEARCHING"}
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="p-3 space-y-3">
          {/* Hand */}
          <Row label="HAND" value={t.handedness === "none" ? "—" : `${t.handedness.toUpperCase()} HAND`} />

          {/* Fingers */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-mono text-[10px] font-medium tracking-[0.2em] text-muted-foreground">FINGERS</span>
              <span className="font-mono text-[12px] font-semibold text-foreground tabular-nums">
                {t.fingerCount}<span className="text-muted-foreground">/5</span>
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {t.fingersExtended.map((up, i) => (
                <FingerCell key={i} label={FINGER_LABELS[i]} active={up && t.handPresent} />
              ))}
            </div>
          </div>

          {/* Gesture banner */}
          <div>
            <div className="font-mono text-[10px] font-medium tracking-[0.2em] text-muted-foreground mb-1.5">
              GESTURE
            </div>
            <div
              className={`h-10 rounded-md border-2 flex items-center justify-center font-mono text-[13px] font-bold tracking-[0.25em] transition-colors ${gestureBanner}`}
            >
              {meta.label}
            </div>
          </div>

          {/* Pinch */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-mono text-[10px] font-medium tracking-[0.2em] text-muted-foreground">PINCH</span>
              <span className="font-mono text-[11px] font-semibold text-foreground tabular-nums">
                {t.pinchDistance.toFixed(3)}
              </span>
            </div>
            <PinchBar value={t.pinchDistance} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-mono text-[10px] font-medium tracking-[0.2em] text-muted-foreground">{label}</span>
      <span className="font-mono text-[12px] font-semibold text-foreground tracking-[0.12em]">{value}</span>
    </div>
  );
}

function FingerCell({ label, active }: { label: string; active: boolean }) {
  return (
    <div
      className={`flex flex-col items-center gap-1 py-1.5 rounded-md border transition-colors ${
        active
          ? "border-primary bg-primary/15 text-primary"
          : "border-border bg-secondary/60 text-muted-foreground/70"
      }`}
      title={label}
    >
      <div className={`w-1.5 h-3.5 rounded-sm ${active ? "bg-primary led" : "bg-muted-foreground/40"}`} />
      <span className="font-mono text-[8.5px] font-semibold tracking-[0.12em]">{label.slice(0, 3)}</span>
    </div>
  );
}

function PinchBar({ value }: { value: number }) {
  // value is now a hand-scale ratio: ~0.2 closed, ~1.5 fully open.
  // Higher bar = tighter pinch (more "pressure").
  const pct = Math.min(100, Math.max(0, (1 - value / 1.2) * 100));
  return (
    <div className="h-2 rounded-full bg-secondary border border-border overflow-hidden relative">
      <div
        className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-[hsl(var(--primary-glow))] transition-[width] duration-150"
        style={{ width: `${pct}%`, boxShadow: "0 0 8px hsl(var(--primary) / 0.6)" }}
      />
    </div>
  );
}

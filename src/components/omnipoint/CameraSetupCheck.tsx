// CameraSetupCheck — pre-flight wizard that confirms BOTH hands are visible
// in frame, not clipped at the edges, and not too close together (which
// causes MediaPipe to merge them into a single detection). The user must
// pass each check for ~1.5s of stable detection before "ENABLE DUAL-HAND
// CONTROL" unlocks. Reads from TelemetryStore — no extra MediaPipe work.

import { useEffect, useState, useSyncExternalStore } from "react";
import { TelemetryStore } from "@/lib/omnipoint/TelemetryStore";

interface Props {
  open: boolean;
  onClose: () => void;
  onPass: () => void;
}

type CheckId = "two_hands" | "in_frame" | "separation";
interface CheckState {
  id: CheckId;
  label: string;
  hint: string;
  ok: boolean;
  detail: string;
}

const STABLE_MS = 1200;

export function CameraSetupCheck({ open, onClose, onPass }: Props) {
  const t = useSyncExternalStore(
    (cb) => TelemetryStore.subscribe(cb),
    () => TelemetryStore.get(),
    () => TelemetryStore.get(),
  );
  const [stableSince, setStableSince] = useState<number | null>(null);
  const [allowed, setAllowed] = useState(false);

  // ---- Per-frame analysis ----
  const checks: CheckState[] = (() => {
    const slots = t.handsDebug;
    const twoHands = slots.length === 2;

    // In-frame: every hand's bbox must sit inside [0.03, 0.97] on both axes.
    let inFrame = twoHands;
    let inFrameDetail = "Waiting for two hands…";
    if (twoHands) {
      const bad = slots.find((s) =>
        s.bbox.x < 0.03 || s.bbox.y < 0.03 ||
        s.bbox.x + s.bbox.w > 0.97 || s.bbox.y + s.bbox.h > 0.97,
      );
      inFrame = !bad;
      inFrameDetail = bad
        ? `${bad.side} hand is clipped at the edge — pull it inward.`
        : "Both hands fully visible.";
    }

    // Separation: distance between wrists must be ≥ 0.18 in normalized
    // camera space (≈18% of frame width). MediaPipe tends to merge hands
    // into one detection below ~10–15%.
    let separated = twoHands;
    let sepDetail = "Waiting for two hands…";
    if (twoHands) {
      const a = slots[0].wrist;
      const b = slots[1].wrist;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      separated = dist >= 0.18;
      sepDetail = separated
        ? `Spacing OK (${(dist * 100).toFixed(0)}% of frame).`
        : `Hands too close (${(dist * 100).toFixed(0)}% of frame). Move them ~20 cm apart.`;
    }

    return [
      {
        id: "two_hands",
        label: "Both hands detected",
        hint: "Show your left and right hand to the camera.",
        ok: twoHands,
        detail: twoHands
          ? `Detected ${slots.map((s) => s.side).join(" + ")}.`
          : t.handsDetected === 1
            ? "Only one hand visible. Add your second hand."
            : "No hands visible. Raise both hands in front of the camera.",
      },
      {
        id: "in_frame",
        label: "Both hands fully in frame",
        hint: "Keep wrists and fingertips inside the camera view.",
        ok: inFrame,
        detail: inFrameDetail,
      },
      {
        id: "separation",
        label: "Hands not too close together",
        hint: "Keep ~20 cm between your hands so the model can separate them.",
        ok: separated,
        detail: sepDetail,
      },
    ];
  })();

  const allOk = checks.every((c) => c.ok);

  // Require checks to stay green for STABLE_MS before unlocking.
  useEffect(() => {
    if (!open) {
      setStableSince(null);
      setAllowed(false);
      return;
    }
    if (allOk) {
      if (stableSince == null) setStableSince(performance.now());
    } else {
      setStableSince(null);
      setAllowed(false);
    }
  }, [open, allOk, stableSince]);

  useEffect(() => {
    if (!open || stableSince == null) return;
    const id = window.setInterval(() => {
      if (performance.now() - stableSince >= STABLE_MS) {
        setAllowed(true);
        window.clearInterval(id);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [open, stableSince]);

  if (!open) return null;

  const stableProgress =
    stableSince == null
      ? 0
      : Math.min(100, ((performance.now() - stableSince) / STABLE_MS) * 100);

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="panel w-full max-w-lg p-6">
        <div className="font-mono text-[10px] tracking-[0.4em] text-emerald-glow mb-2">
          DUAL-HAND SETUP CHECK
        </div>
        <h2 className="font-mono text-lg text-foreground tracking-wider mb-1">
          CAMERA READINESS
        </h2>
        <p className="font-mono text-[11px] text-muted-foreground tracking-wider mb-5">
          Verify both hands are tracked cleanly before enabling dual-hand control.
        </p>

        <div className="space-y-2 mb-5">
          {checks.map((c) => (
            <div
              key={c.id}
              className={`border p-3 transition-colors ${
                c.ok ? "border-emerald-glow/40 bg-emerald-glow/5" : "hairline"
              }`}
            >
              <div className="flex items-center justify-between font-mono text-[11px]">
                <span className="text-foreground tracking-[0.15em]">
                  {c.ok ? "✓" : "○"} {c.label.toUpperCase()}
                </span>
                <span
                  className={`text-[9.5px] tracking-[0.25em] ${
                    c.ok ? "text-emerald-glow" : "text-amber-400"
                  }`}
                >
                  {c.ok ? "PASS" : "PENDING"}
                </span>
              </div>
              <div className="mt-1 font-mono text-[10px] text-muted-foreground leading-snug">
                {c.ok ? c.detail : c.hint}
              </div>
              {!c.ok && c.detail !== c.hint && (
                <div className="mt-1 font-mono text-[10px] text-amber-400/90 leading-snug">
                  → {c.detail}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mb-4">
          <div className="flex justify-between font-mono text-[9px] tracking-[0.3em] text-muted-foreground mb-1">
            <span>STABILITY</span>
            <span>{Math.round(stableProgress)}%</span>
          </div>
          <div className="h-1 bg-secondary overflow-hidden">
            <div
              className="h-full bg-emerald-glow transition-all"
              style={{
                width: `${stableProgress}%`,
                boxShadow: "0 0 8px hsl(var(--primary))",
              }}
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 h-10 font-mono text-[10px] tracking-[0.3em] border hairline text-muted-foreground hover:text-foreground"
          >
            ✕ SKIP
          </button>
          <button
            disabled={!allowed}
            onClick={() => {
              onPass();
              onClose();
            }}
            className="flex-1 h-10 font-mono text-[10px] tracking-[0.3em] border border-primary text-primary bg-primary/10 hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {allowed ? "▶ ENABLE DUAL-HAND" : "● VERIFYING…"}
          </button>
        </div>

        <div className="mt-4 font-mono text-[9.5px] text-muted-foreground/80 leading-relaxed">
          Tip: stand ~60 cm from the camera in even lighting. Avoid bright
          backlight (windows). MediaPipe merges hands when they overlap, so
          keep a clear gap between them.
        </div>
      </div>
    </div>
  );
}
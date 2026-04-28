// CalibrationWizard — first-run guided setup. 4 quick steps:
//   1) Camera framing  2) Set origin  3) Sensitivity  4) Done
// Persists "completed" flag in localStorage so it auto-shows once.

import { useEffect, useState } from "react";
import { Check, ChevronRight, X, Hand, Crosshair, Gauge as GaugeIcon, Sparkles } from "lucide-react";
import type { EngineConfig } from "@/lib/omnipoint/GestureEngine";

const STORAGE_KEY = "omnipoint.calibration.v1.done";

interface Props {
  /** When true the wizard is forced visible; otherwise it autoshows once. */
  forceOpen?: boolean;
  config: EngineConfig;
  setConfig: (patch: Partial<EngineConfig>) => void;
  onSetOrigin: () => void;
  onClose: () => void;
}

const STEPS = [
  { id: "frame",  label: "FRAMING",    icon: Hand },
  { id: "origin", label: "ORIGIN",     icon: Crosshair },
  { id: "sense",  label: "SENSITIVITY", icon: GaugeIcon },
  { id: "done",   label: "READY",      icon: Sparkles },
] as const;

export function CalibrationWizard({ forceOpen, config, setConfig, onSetOrigin, onClose }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (forceOpen) {
      setOpen(true);
      setStep(0);
      return;
    }
    try {
      if (localStorage.getItem(STORAGE_KEY) !== "1") setOpen(true);
    } catch {
      /* ignore */
    }
  }, [forceOpen]);

  const finish = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
    onClose();
  };

  if (!open) return null;

  const Icon = STEPS[step].icon;

  return (
    <div className="fixed inset-0 z-[2147483645] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card border border-border shadow-2xl">
        <header className="border-b hairline px-4 h-12 flex items-center justify-between">
          <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.3em] text-emerald-glow">
            <Icon className="w-3.5 h-3.5" />
            CALIBRATION · {step + 1}/{STEPS.length}
          </div>
          <button
            onClick={finish}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Skip calibration"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="px-4 pt-3 flex items-center gap-1">
          {STEPS.map((s, i) => (
            <div
              key={s.id}
              className={`h-1 flex-1 ${i <= step ? "bg-primary" : "bg-border"}`}
            />
          ))}
        </div>

        <div className="p-5 min-h-[220px]">
          {step === 0 && (
            <StepBody
              title="Frame your hand"
              body="Sit ~50–70 cm from the camera. Make sure your dominant hand is fully visible inside the dotted ACTIVE ZONE box. Good lighting helps a lot."
              tip="If your hand keeps disappearing, move back or raise the camera."
            />
          )}
          {step === 1 && (
            <StepBody
              title="Set your neutral pose"
              body="Hold your index finger at a comfortable resting position — this becomes your screen-center. Tap SET ORIGIN below."
              tip="You can re-do this anytime from the sensor toolbar."
            >
              <button
                onClick={onSetOrigin}
                className="mt-3 w-full h-10 font-mono text-[11px] tracking-[0.3em] border border-primary text-primary hover:bg-primary/10 inline-flex items-center justify-center gap-2"
              >
                <Crosshair className="w-3.5 h-3.5" />
                SET ORIGIN
              </button>
            </StepBody>
          )}
          {step === 2 && (
            <StepBody
              title="Tune sensitivity"
              body="Higher = cursor flies further with small hand moves. Start around 1.6 and adjust to taste."
            >
              <div className="mt-4">
                <div className="flex justify-between font-mono text-[10px] tracking-[0.2em] text-muted-foreground">
                  <span>SENSITIVITY</span>
                  <span className="text-foreground tabular-nums">
                    {config.sensitivity.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={4}
                  step={0.05}
                  value={config.sensitivity}
                  onChange={(e) => setConfig({ sensitivity: parseFloat(e.target.value) })}
                  className="w-full h-1 mt-1 appearance-none bg-secondary accent-primary cursor-pointer"
                />
                <div className="flex justify-between font-mono text-[10px] tracking-[0.2em] text-muted-foreground mt-3">
                  <span>SMOOTHING</span>
                  <span className="text-foreground tabular-nums">
                    {config.smoothingAlpha.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={0.8}
                  step={0.02}
                  value={config.smoothingAlpha}
                  onChange={(e) => setConfig({ smoothingAlpha: parseFloat(e.target.value) })}
                  className="w-full h-1 mt-1 appearance-none bg-secondary accent-primary cursor-pointer"
                />
              </div>
            </StepBody>
          )}
          {step === 3 && (
            <StepBody
              title="You're set."
              body="Try pinch-to-click, two-finger scroll, and open palm to undo / go back. You can re-run calibration anytime from the gestures panel."
              tip="Pro tip: open the FPS HUD (bottom-left) if your cursor feels laggy."
            />
          )}
        </div>

        <footer className="border-t hairline px-4 h-12 flex items-center justify-between">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground disabled:opacity-30 hover:text-foreground"
          >
            BACK
          </button>
          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              className="font-mono text-[10px] tracking-[0.3em] px-3 h-8 border border-primary text-primary hover:bg-primary/10 inline-flex items-center gap-2"
            >
              NEXT <ChevronRight className="w-3 h-3" />
            </button>
          ) : (
            <button
              onClick={finish}
              className="font-mono text-[10px] tracking-[0.3em] px-3 h-8 border border-primary bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2"
            >
              <Check className="w-3 h-3" /> FINISH
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

function StepBody({
  title,
  body,
  tip,
  children,
}: {
  title: string;
  body: string;
  tip?: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="font-display text-lg text-foreground">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{body}</p>
      {tip && (
        <p className="mt-3 font-mono text-[10px] tracking-[0.18em] text-muted-foreground/80 border-l-2 border-primary/40 pl-3">
          TIP · {tip}
        </p>
      )}
      {children}
    </div>
  );
}

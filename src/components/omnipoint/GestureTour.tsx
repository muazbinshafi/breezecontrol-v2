// GestureTour — a friendly, step-by-step pop-up tour that teaches new users
// which hand gesture does what.
//
// "Try it now" practice mode (per step):
//   Each step declares a `match` predicate against the live TelemetrySnapshot.
//   When the user clicks "Try it now" we:
//     1) Show a pulsing prompt with the target gesture.
//     2) Subscribe to the TelemetryStore and check `match` on every tick.
//     3) When the match holds for the step's required dwell window, mark
//        the step as "passed", play a small success state, and auto-advance
//        after a short celebratory pause.
//   The "Done" step has no practice — it's just a celebration card.
//
// The tour itself stays informational by default; practice is opt-in per
// step so users who just want to read can keep clicking Next.

import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft, ChevronRight, X, Hand, MousePointer2,
  Pointer, Grab, Move, Sparkles, CheckCircle2, Play, Loader2,
} from "lucide-react";
import { TelemetryStore, type TelemetrySnapshot } from "@/lib/omnipoint/TelemetryStore";
import { setSuppressStaticGestureActions } from "@/lib/omnipoint/BrowserCursor";

const STORAGE_KEY = "omnipoint:gesture-tour-seen-v1";

interface Step {
  emoji: string;
  title: string;
  description: string;
  hint: string;
  Icon: typeof Hand;
  /**
   * Predicate against the live telemetry snapshot. When this returns true
   * for `dwellMs` continuously, the step is considered "passed".
   * Omit (or return undefined) for purely informational steps.
   */
  match?: (s: TelemetrySnapshot) => boolean;
  /** How long the match must hold (ms). Default 350. */
  dwellMs?: number;
  /** Short instruction shown while practicing. */
  practicePrompt?: string;
}

const STEPS: Step[] = [
  {
    emoji: "👆",
    title: "Point to move",
    description:
      "Hold up your index finger. Your fingertip becomes the cursor — move it around to navigate.",
    hint: "Try drawing a slow circle in the air.",
    Icon: MousePointer2,
    practicePrompt: "Raise just your index finger and move it around.",
    // Index extended; allow thumb to be either way (thumb detection is noisy).
    match: (s) =>
      s.handPresent &&
      s.gesture !== "open_palm" &&
      s.fingersExtended[1] === true &&
      s.fingersExtended[2] === false &&
      s.fingersExtended[3] === false &&
      s.fingersExtended[4] === false,
    dwellMs: 350,
  },
  {
    emoji: "🤏",
    title: "Pinch to click",
    description:
      "Bring your thumb and index finger together briefly to perform a click. Pinch twice for a double-click.",
    hint: "Quick, deliberate pinches work best.",
    Icon: Pointer,
    practicePrompt: "Touch your thumb and index fingertip together.",
    // Either the engine's gesture state machine fires "click", or the raw
    // pinch distance is tight enough.
    match: (s) =>
      s.handPresent &&
      (s.gesture === "click" ||
        s.gesture === "drag" ||
        s.gesture === "right_click" ||
        (s.pinchDistance > 0 && s.pinchDistance < 0.55)),
    dwellMs: 100,
  },
  {
    emoji: "🤏",
    title: "Hold pinch to drag",
    description:
      "Pinch and keep holding to drag. Release your pinch to drop the item.",
    hint: "Start with a click, then keep the pinch closed a little longer.",
    Icon: Grab,
    practicePrompt: "Pinch and hold your thumb and index finger together.",
    match: (s) =>
      s.handPresent && (s.gesture === "drag" || (s.pinchDistance > 0 && s.pinchDistance < 0.45)),
    dwellMs: 220,
  },
  {
    emoji: "🤝",
    title: "Three-finger pinch for right-click",
    description:
      "Touch your thumb to BOTH your index and middle fingertips at once. This fires a right-click (context menu).",
    hint: "Keep ring + pinky folded so the detector reads it cleanly.",
    Icon: Pointer,
    practicePrompt: "Pinch thumb + index + middle together.",
    match: (s) =>
      s.handPresent &&
      (s.gesture === "right_click" ||
        (s.fingersExtended[1] === true &&
          s.fingersExtended[2] === true &&
          s.pinchDistance > 0 &&
          s.pinchDistance < 0.6)),
    dwellMs: 220,
  },
  {
    emoji: "✌️",
    title: "Two fingers to scroll",
    description:
      "Raise your index and middle fingers together, then move them up or down to scroll.",
    hint: "Keep ring and pinky folded for more reliable scroll detection.",
    Icon: Move,
    practicePrompt: "Raise your index and middle fingers together.",
    match: (s) =>
      s.handPresent &&
      s.fingersExtended[1] === true &&
      s.fingersExtended[2] === true &&
      s.fingersExtended[3] === false &&
      s.fingersExtended[4] === false,
    dwellMs: 350,
  },
  {
    emoji: "✋",
    title: "Open palm for shortcuts",
    description:
      "Open palm is a configurable static gesture. By default it is safe in pointer mode and acts as undo in draw mode.",
    hint: "Use the Gestures panel if you want to bind open palm to another action.",
    Icon: Sparkles,
    practicePrompt: "Show your full open palm to the camera.",
    match: (s) =>
      s.handPresent &&
      (s.gesture === "open_palm" ||
        s.gesture === "scroll_up" ||
        s.gesture === "scroll_down" ||
        s.fingerCount >= 4),
    dwellMs: 400,
  },
  {
    emoji: "🤟",
    title: "Three fingers for shortcuts",
    description:
      "Raise index, middle, and ring fingers for a configurable static shortcut pose.",
    hint: "Thumb can vary — the detector mainly cares about the three center fingers.",
    Icon: Sparkles,
    practicePrompt: "Raise three fingers (index, middle, and ring).",
    // Accept index+middle+ring extended regardless of thumb state.
    match: (s) =>
      s.handPresent &&
      s.fingersExtended[1] === true &&
      s.fingersExtended[2] === true &&
      s.fingersExtended[3] === true &&
      s.fingersExtended[4] === false,
    dwellMs: 400,
  },
  {
    emoji: "🎉",
    title: "You're ready!",
    description:
      "You've practiced every core gesture. Open Settings any time to tune sensitivity, and press the GUIDE button to replay this tour.",
    hint: "Have fun exploring — calibrate from the top bar if needed.",
    Icon: CheckCircle2,
  },
];

interface GestureTourProps {
  forceOpen?: boolean;
  onClose?: () => void;
  autoShow?: boolean;
}

type PracticeState = "idle" | "active" | "passed";

export function GestureTour({ forceOpen, onClose, autoShow = true }: GestureTourProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [practice, setPractice] = useState<PracticeState>("idle");
  const [passed, setPassed] = useState<Record<number, boolean>>({});

  // Keep the latest "is this step matching" timestamp so we can require dwell.
  const matchSinceRef = useRef<number | null>(null);
  // Hold a short delay before auto-advancing after a pass so the user sees
  // the success state.
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const Icon = current.Icon;
  const canPractice = !!current.match;

  // ---------- open/close lifecycle ----------
  useEffect(() => {
    if (forceOpen) {
      setOpen(true);
      setStep(0);
      setPractice("idle");
      setPassed({});
      return;
    }
    if (!autoShow) return;
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        const t = setTimeout(() => setOpen(true), 600);
        return () => clearTimeout(t);
      }
    } catch {
      setOpen(true);
    }
  }, [forceOpen, autoShow]);

  useEffect(() => {
    if (forceOpen) {
      setOpen(true);
      setStep(0);
      setPractice("idle");
      setPassed({});
    }
  }, [forceOpen]);

  // Reset practice state whenever we change steps.
  useEffect(() => {
    setPractice("idle");
    matchSinceRef.current = null;
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  }, [step]);

  // ---------- practice subscription ----------
  useEffect(() => {
    if (!open || practice !== "active" || !current.match) return;
    const dwell = current.dwellMs ?? 350;

    const check = () => {
      const snap = TelemetryStore.get();
      const isMatch = current.match!(snap);
      if (isMatch) {
        if (matchSinceRef.current == null) {
          matchSinceRef.current = performance.now();
        } else if (performance.now() - matchSinceRef.current >= dwell) {
          // Passed!
          setPractice("passed");
          setPassed((p) => ({ ...p, [step]: true }));
          matchSinceRef.current = null;
          // Auto-advance after a short celebration.
          advanceTimerRef.current = setTimeout(() => {
            advanceTimerRef.current = null;
            handleNext();
          }, 900);
        }
      } else {
        matchSinceRef.current = null;
      }
    };

    // Subscribe to telemetry changes AND poll on a short interval so we keep
    // checking even if the snapshot doesn't change between frames (the engine
    // emits frequently, but we want a guarantee).
    const unsub = TelemetryStore.subscribe(check);
    const interval = setInterval(check, 80);
    check();
    return () => {
      unsub();
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, practice, step]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    };
  }, []);

  // While the tour is open, suppress destructive static-gesture actions
  // (back, emergency-stop, next, zoom, etc.) so practicing the poses
  // doesn't navigate the page away or kill input.
  useEffect(() => {
    setSuppressStaticGestureActions(open);
    return () => setSuppressStaticGestureActions(false);
  }, [open]);

  // ---------- keyboard ----------
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose(true);
      else if (e.key === "ArrowRight") handleNext();
      else if (e.key === "ArrowLeft") handlePrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step]);

  // ---------- handlers ----------
  const handleClose = (markSeen: boolean) => {
    if (markSeen) {
      try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
    }
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    setOpen(false);
    setPractice("idle");
    onClose?.();
  };

  const handleNext = () => {
    if (step >= STEPS.length - 1) {
      handleClose(true);
    } else {
      setStep((s) => s + 1);
    }
  };

  const handlePrev = () => setStep((s) => Math.max(0, s - 1));

  const handleStartPractice = () => {
    matchSinceRef.current = null;
    setPractice("active");
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3 sm:p-6 bg-background/40 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
    >
      <div className="relative w-full max-w-md border border-border bg-card shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
        {/* Skip button */}
        <button
          onClick={() => handleClose(true)}
          className="absolute top-2.5 right-2.5 z-10 inline-flex items-center gap-1.5 px-2.5 h-8 font-mono text-[10px] tracking-[0.25em] text-muted-foreground hover:text-foreground border hairline bg-background/60 backdrop-blur transition-colors"
          aria-label="Skip tour"
        >
          SKIP
          <X className="w-3 h-3" />
        </button>

        {/* Header */}
        <div className="px-5 pt-5 pb-1 flex items-center gap-2">
          <Hand className="w-3.5 h-3.5 text-primary" />
          <span className="font-mono text-[10px] tracking-[0.3em] text-emerald-glow">
            GESTURE GUIDE · {String(step + 1).padStart(2, "0")}/{String(STEPS.length).padStart(2, "0")}
          </span>
        </div>

        {/* Body */}
        <div className="px-5 pt-3 pb-5">
          <div className="flex items-start gap-4">
            <div
              className={`shrink-0 w-20 h-20 rounded-xl border grid place-items-center text-5xl select-none transition-all ${
                practice === "active"
                  ? "border-primary/60 bg-primary/15 animate-pulse"
                  : practice === "passed" || passed[step]
                    ? "border-[hsl(var(--success))] bg-[hsl(var(--success))]/10"
                    : "border-primary/20 bg-gradient-primary/10"
              }`}
            >
              {practice === "passed" ? (
                <CheckCircle2 className="w-10 h-10 text-[hsl(var(--success))]" />
              ) : (
                <span aria-hidden="true">{current.emoji}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2
                id="tour-title"
                className="text-lg sm:text-xl font-semibold tracking-tight text-foreground flex items-center gap-2"
              >
                <Icon className="w-4 h-4 text-primary shrink-0" />
                {current.title}
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                {current.description}
              </p>
            </div>
          </div>

          {/* Practice / hint band */}
          {practice === "active" && current.practicePrompt ? (
            <div className="mt-4 px-3 py-2.5 border border-primary/40 bg-primary/10 flex items-center gap-2.5">
              <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
              <p className="text-xs text-foreground flex-1">
                <span className="font-mono text-[10px] tracking-[0.25em] text-primary mr-2">
                  TRY IT
                </span>
                {current.practicePrompt}
              </p>
            </div>
          ) : practice === "passed" ? (
            <div className="mt-4 px-3 py-2.5 border border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/10 flex items-center gap-2.5 animate-in fade-in zoom-in-95 duration-300">
              <CheckCircle2 className="w-4 h-4 text-[hsl(var(--success))] shrink-0" />
              <p className="text-xs text-foreground flex-1">
                <span className="font-mono text-[10px] tracking-[0.25em] text-[hsl(var(--success))] mr-2">
                  NICE!
                </span>
                Gesture detected — moving on…
              </p>
            </div>
          ) : (
            <div className="mt-4 px-3 py-2 border-l-2 border-primary/40 bg-primary/5">
              <p className="text-xs text-foreground/80">
                <span className="font-mono text-[10px] tracking-[0.25em] text-primary mr-2">TIP</span>
                {current.hint}
              </p>
            </div>
          )}

          {/* Progress dots */}
          <div className="mt-5 flex items-center justify-center gap-1.5">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                aria-label={`Go to step ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${
                  i === step
                    ? "w-6 bg-primary"
                    : passed[i]
                      ? "w-1.5 bg-[hsl(var(--success))]"
                      : i < step
                        ? "w-1.5 bg-primary/60"
                        : "w-1.5 bg-border hover:bg-muted-foreground/40"
                }`}
              />
            ))}
          </div>

          {/* Controls */}
          <div className="mt-5 flex items-center gap-2 flex-wrap">
            <button
              onClick={handlePrev}
              disabled={step === 0}
              className="h-10 px-3 inline-flex items-center gap-1.5 border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
            <button
              onClick={() => handleClose(true)}
              className="h-10 px-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip guide
            </button>
            <div className="flex-1" />

            {canPractice && practice === "idle" && !passed[step] && (
              <button
                onClick={handleStartPractice}
                className="h-10 px-3 inline-flex items-center gap-1.5 border border-primary/40 text-primary hover:bg-primary/10 text-sm font-medium transition-colors"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Try it now
              </button>
            )}
            {canPractice && practice === "active" && (
              <button
                onClick={() => setPractice("idle")}
                className="h-10 px-3 inline-flex items-center gap-1.5 border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Stop
              </button>
            )}

            <button
              onClick={handleNext}
              className="h-10 px-4 inline-flex items-center gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium transition-colors"
            >
              {isLast ? "Got it" : "Next"}
              {!isLast && <ChevronRight className="w-4 h-4" />}
              {isLast && <CheckCircle2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Reset helper so a "Replay tour" button can re-trigger autoShow. */
export function resetGestureTour() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

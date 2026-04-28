// GesturePreview — lightweight live camera preview that runs the real
// GestureEngine (no HID bridge, no drawing) and shows the currently
// detected gesture, finger states, and pinch ratio. Used on /auth so users
// can verify their camera + lighting + hand pose before entering the demo.

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Loader2, Hand } from "lucide-react";
import { GestureEngine, defaultConfig } from "@/lib/omnipoint/GestureEngine";
import { HIDBridge } from "@/lib/omnipoint/HIDBridge";
import { useTelemetry } from "@/hooks/useTelemetry";
import type { GestureKind } from "@/lib/omnipoint/TelemetryStore";

const FINGER_LABELS = ["T", "I", "M", "R", "P"] as const;

const GESTURE_LABEL: Record<GestureKind, string> = {
  none: "—",
  point: "POINT",
  click: "CLICK",
  right_click: "RIGHT CLICK",
  drag: "DRAG",
  scroll_up: "SCROLL ▲",
  scroll_down: "SCROLL ▼",
  thumbs_up: "THUMBS UP",
  open_palm: "OPEN PALM",
  palm_back: "PALM BACK",
  fist: "FIST",
  pinky_only: "PINKY",
  four_fingers: "FOUR FINGERS",
  middle_only: "MIDDLE ONLY",
  ring_only: "RING ONLY",
  two_finger_point: "TWO FINGERS",
  three_fingers: "THREE FINGERS",
  peace: "PEACE",
  rock: "ROCK",
  phone_call: "PHONE CALL",
};

export function GesturePreview() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GestureEngine | null>(null);
  const bridgeRef = useRef<HIDBridge | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("Camera off");
  const [error, setError] = useState<string | null>(null);
  const t = useTelemetry();

  useEffect(() => {
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    setError(null);
    setStatus("Requesting camera…");
    try {
      if (!window.isSecureContext) {
        throw new Error("Camera requires HTTPS or localhost.");
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera API unavailable in this browser.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      const canvas = canvasRef.current!;
      video.srcObject = stream;
      await new Promise<void>((res) => {
        if (video.readyState >= 1 && video.videoWidth > 0) return res();
        video.addEventListener("loadedmetadata", () => res(), { once: true });
      });
      try { await video.play(); } catch { /* autoplay deferred */ }

      setStatus("Loading hand model…");
      // Bridge is required by the engine constructor but we never connect it.
      const bridge = new HIDBridge("ws://localhost:8765");
      bridgeRef.current = bridge;
      const engine = new GestureEngine(video, canvas, bridge, { ...defaultConfig });
      engineRef.current = engine;
      await engine.init((m) => setStatus(m));
      engine.start();
      setStatus("Detecting…");
      setRunning(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setStatus("Camera off");
      stop();
    }
  }

  function stop() {
    engineRef.current?.stop();
    engineRef.current = null;
    bridgeRef.current?.emergencyStop?.();
    bridgeRef.current = null;
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setRunning(false);
  }

  return (
    <div className="border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-3 h-9">
        <div className="flex items-center gap-2">
          <Hand className="w-3.5 h-3.5 text-primary" />
          <span className="font-mono text-[11px] tracking-[0.25em] text-foreground">
            LIVE GESTURE PREVIEW
          </span>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">
          {running ? `${t.fps} fps` : "OFFLINE"}
        </span>
      </div>

      <div className="relative aspect-video bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: "scaleX(-1)" }}
        />
        <canvas
          ref={canvasRef}
          width={640}
          height={480}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />

        {/* Gesture badge */}
        {running && (
          <div className="absolute top-2 left-2 rounded-md bg-primary text-primary-foreground px-3 py-1.5 font-mono text-[12px] font-bold tracking-[0.25em] shadow-lg">
            {GESTURE_LABEL[t.gesture] ?? "—"}
          </div>
        )}

        {/* Hand status */}
        {running && (
          <div className="absolute top-2 right-2 rounded-md bg-card/90 border border-border px-2 py-1 font-mono text-[10px] tracking-[0.2em] text-foreground">
            {t.handPresent ? `LOCKED · ${t.handedness.toUpperCase()}` : "SEARCHING…"}
          </div>
        )}

        {/* Fingers */}
        {running && (
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2">
            <div className="flex gap-1">
              {t.fingersExtended.map((up, i) => (
                <div
                  key={i}
                  className={`w-6 h-6 rounded-sm border flex items-center justify-center font-mono text-[10px] font-bold ${
                    up && t.handPresent
                      ? "border-primary bg-primary/20 text-primary"
                      : "border-border bg-background/60 text-muted-foreground"
                  }`}
                >
                  {FINGER_LABELS[i]}
                </div>
              ))}
            </div>
            <div className="font-mono text-[10px] text-muted-foreground bg-card/80 px-2 py-1 rounded-sm border border-border">
              PINCH <span className="text-foreground">{t.pinchDistance.toFixed(2)}</span>
            </div>
          </div>
        )}

        {!running && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center p-6">
            <CameraOff className="w-8 h-8 text-muted-foreground" />
            <div className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground">
              {status}
            </div>
            {error && (
              <div className="text-[11px] text-destructive max-w-xs">{error}</div>
            )}
          </div>
        )}

        {running && status !== "Detecting…" && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm">
            <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.2em] text-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {status}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-border p-2">
        {!running ? (
          <button
            type="button"
            onClick={start}
            className="flex-1 h-9 inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground font-mono text-[11px] tracking-[0.25em] hover:bg-primary/90 transition-colors"
          >
            <Camera className="w-3.5 h-3.5" />
            START PREVIEW
          </button>
        ) : (
          <button
            type="button"
            onClick={stop}
            className="flex-1 h-9 inline-flex items-center justify-center gap-2 border border-border text-foreground font-mono text-[11px] tracking-[0.25em] hover:bg-secondary transition-colors"
          >
            <CameraOff className="w-3.5 h-3.5" />
            STOP
          </button>
        )}
      </div>
    </div>
  );
}

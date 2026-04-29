// GestureEngine - MediaPipe HandLandmarker with One-Euro filter smoothing,
// active-zone clamp, adaptive cursor acceleration, gesture stability voting,
// and a strict click/drag state machine. Tuned for low-latency, jitter-free
// pointer tracking comparable to native trackpads.

import {
  HandLandmarker,
  FilesetResolver,
  type HandLandmarkerResult,
} from "@mediapipe/tasks-vision";
import { TelemetryStore, type GestureKind, type HandLandmarks, type HandDebugInfo } from "./TelemetryStore";
import type { HIDBridge } from "./HIDBridge";
import { OneEuroFilter2D, OneEuroFilter3D } from "./OneEuroFilter";

export interface EngineConfig {
  sensitivity: number;       // multiplier for velocity curve (1..5)
  smoothingAlpha: number;    // One-Euro minCutoff (0.5=very smooth, 4=very responsive)
  clickThreshold: number;    // pinch distance < this triggers click (default 0.03)
  releaseThreshold: number;  // hysteresis (default 0.04)
  scrollSensitivity: number; // pixels per delta unit (1..50)
  aspectRatio: number;       // monitor aspect (e.g. 16/9)
  deadZone: number;          // velocity dead-zone (default 0.0008)
}

export const defaultConfig: EngineConfig = {
  sensitivity: 1.4,
  // Lower minCutoff → smoother. With our adaptive precision-mode below, the
  // engine drops cutoff further when the hand is nearly still, so we can keep
  // the baseline snappy here without sacrificing sub-mm steadiness.
  smoothingAlpha: 1.0,
  // pinch is now a *ratio* of hand size (pinchDist / index-MCP→wrist).
  // index-MCP→wrist is ~70% of middle-MCP→wrist, so the same physical gap
  // yields a *larger* ratio — making sub-cm pinches far easier to trigger.
  // Tight closed pinch ≈ 0.25, ~2-3 cm gap ≈ 0.55, fully open ≈ 1.2+.
  // Default click at 0.62 fires at ~2 cm; release at 0.78 prevents flutter.
  clickThreshold: 0.62,
  releaseThreshold: 0.78,
  scrollSensitivity: 14,
  aspectRatio: 16 / 9,
  deadZone: 0.0004,
};

const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

type ClickState = "IDLE" | "CLICK_DOWN" | "DRAG";

/**
 * Per-hand state. Both hands are tracked simultaneously; each owns its own
 * filters, click state machine, scroll/pinch history, and cursor target so
 * they never step on each other. Whichever hand has stronger intent on any
 * given frame drives the OS cursor — the other hand can still fire a click
 * or scroll independently.
 */
class HandState {
  fThumb = new OneEuroFilter3D(1.4, 0.05);
  fIndex = new OneEuroFilter3D(1.4, 0.05);
  fIndexMcp = new OneEuroFilter3D(1.2, 0.04);
  fWrist = new OneEuroFilter3D(1.2, 0.04);
  fMiddleTip = new OneEuroFilter3D(1.4, 0.05);
  fCursor = new OneEuroFilter2D(2.0, 0.03);
  smoothedThumb: [number, number, number] | null = null;
  smoothedIndex: [number, number, number] | null = null;
  prevPinch: number | null = null;
  prevPinchT = 0;
  pinchVelocity = 0;
  cursorSpeed = 0;
  cursor = { x: 0.5, y: 0.5 };
  prevIndex: { x: number; y: number; t: number } | null = null;
  clickState: ClickState = "IDLE";
  pinchStartTs = 0;
  gestureCandidate: GestureKind = "none";
  gestureCandidateCount = 0;
  committedGesture: GestureKind = "none";
  lastScrollY: number | null = null;
  lastScrollEmit = 0;
  // Last frame where this hand was visible — used to expire stale state.
  lastSeenAt = 0;

  reset() {
    this.fThumb.reset();
    this.fIndex.reset();
    this.fIndexMcp.reset();
    this.fWrist.reset();
    this.fMiddleTip.reset();
    this.fCursor.reset();
    this.smoothedThumb = null;
    this.smoothedIndex = null;
    this.prevPinch = null;
    this.prevPinchT = 0;
    this.pinchVelocity = 0;
    this.cursorSpeed = 0;
    this.prevIndex = null;
    this.clickState = "IDLE";
    this.pinchStartTs = 0;
    this.gestureCandidate = "none";
    this.gestureCandidateCount = 0;
    this.committedGesture = "none";
    this.lastScrollY = null;
  }
}

export class GestureEngine {
  private landmarker: HandLandmarker | null = null;
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bridge: HIDBridge;
  public config: EngineConfig;

  // Per-hand state, keyed by handedness ("Left" | "Right"). Both hands run
  // through the full pipeline simultaneously; each frame we pick a "primary"
  // hand to drive the OS cursor based on which has stronger intent, but the
  // OTHER hand still runs its click/scroll state machine — so e.g. you can
  // be moving the cursor with the right hand and tap a click with the left.
  private hands: Map<"Left" | "Right", HandState> = new Map();
  // Identity of the hand that drove the cursor last frame — used so the
  // primary-hand selection doesn't flicker frame-to-frame when both hands
  // have similar intent scores.
  private lastPrimary: "Left" | "Right" | null = null;

  // Active zone center (set via Set Origin)
  private originOffset = { x: 0, y: 0 };

  private readonly debounceMs = 25;

  private readonly gestureStabilityFrames = 3;

  private readonly scrollMinIntervalMs = 1000 / 120;

  // FPS / latency
  private frameTimes: number[] = [];
  private running = false;
  private rafId = 0;
  private lastVideoTime = -1;

  constructor(video: HTMLVideoElement, canvas: HTMLCanvasElement, bridge: HIDBridge, config: EngineConfig) {
    this.video = video;
    this.canvas = canvas;
    this.bridge = bridge;
    this.config = config;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    this.ctx = ctx;
  }

  /**
   * Map config.smoothingAlpha → One-Euro params for landmarks + cursor.
   *
   * Adaptive precision-mode: when the cursor is barely moving (sub-pixel
   * intent — the user is targeting a small UI element), we crush the cutoff
   * frequency to lock the cursor in place. As soon as the user moves with
   * intent, the filter snaps wide-open via beta. This is what gives the
   * system its "millimeter accuracy" feel — micro-tremor is filtered out
   * but real micro-motion still passes through.
   */
  /** Tune One-Euro params for ONE hand based on its own cursor speed. */
  private applySmoothingParams(h: HandState) {
    const baseCutoff = Math.max(0.3, Math.min(6, this.config.smoothingAlpha));
    // Stillness is per-hand now. If the hand has never produced a sample
    // (just appeared), keep stillness at 0 so the filter doesn't lock.
    const stillness = h.smoothedIndex
      ? Math.max(0, Math.min(1, 1 - h.cursorSpeed * 8))
      : 0;
    const minCutoff = baseCutoff * (1 - 0.55 * stillness) + 0.6 * stillness;
    const beta = 0.015 + baseCutoff * 0.012;
    h.fThumb.setParams(minCutoff, beta);
    h.fIndex.setParams(minCutoff, beta);
    h.fIndexMcp.setParams(minCutoff * 0.9, beta);
    h.fWrist.setParams(minCutoff * 0.9, beta);
    h.fMiddleTip.setParams(minCutoff, beta);
    h.fCursor.setParams(Math.min(6, minCutoff + 0.8), beta + 0.015);
  }

  async init(
    onProgress?: (msg: string) => void,
    floors?: {
      minHandDetectionConfidence?: number;
      minHandPresenceConfidence?: number;
      minTrackingConfidence?: number;
    },
  ) {
    onProgress?.("Loading vision fileset...");
    const fileset = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm",
    );
    onProgress?.("Loading HandLandmarker model...");
    const baseOpts = {
      // Detect up to 2 hands so users can use either / both. The active
      // controller hand is selected per-frame by handedness + confidence.
      numHands: 2,
      runningMode: "VIDEO" as const,
      // Lowered floors: 0.5 was too aggressive — slightly off-axis or
      // dim-lit hands were rejected entirely. 0.3 still cuts background
      // noise but recovers far more weak/distant detections. The user
      // can override these from the Live Calibration panel.
      minHandDetectionConfidence: floors?.minHandDetectionConfidence ?? 0.3,
      minHandPresenceConfidence: floors?.minHandPresenceConfidence ?? 0.3,
      minTrackingConfidence: floors?.minTrackingConfidence ?? 0.3,
    };
    const modelAssetPath =
      "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
    try {
      this.landmarker = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath, delegate: "GPU" },
        ...baseOpts,
      });
      console.info("[OmniPoint] HandLandmarker initialized (GPU delegate)", baseOpts);
    } catch (gpuErr) {
      console.warn("[OmniPoint] GPU delegate failed, falling back to CPU:", gpuErr);
      onProgress?.("GPU unavailable — falling back to CPU...");
      this.landmarker = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath, delegate: "CPU" },
        ...baseOpts,
      });
      console.info("[OmniPoint] HandLandmarker initialized (CPU delegate)", baseOpts);
    }
    onProgress?.("Sensor ready.");
  }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.tick();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  setOrigin() {
    // Use whichever hand currently has a smoothed sample (prefer the
    // last primary hand). This lets the user calibrate origin with either
    // hand and have both hands respect the same active-zone center.
    const candidate =
      (this.lastPrimary && this.hands.get(this.lastPrimary)) ||
      this.hands.get("Right") || this.hands.get("Left");
    if (!candidate?.smoothedIndex) return;
    this.originOffset.x = candidate.smoothedIndex[0] - 0.5;
    this.originOffset.y = candidate.smoothedIndex[1] - 0.5;
  }

  /**
   * Hard-reset all transient detection state. Useful when the calibration UI
   * detects the engine is "stuck" in SENSOR LOST / searching — clears every
   * filter and the click state machine so the next frame starts fresh.
   */
  resetState() {
    for (const h of this.hands.values()) h.reset();
    this.hands.clear();
    this.lastPrimary = null;
    this.lastVideoTime = -1;
    TelemetryStore.set({
      sensorLost: false,
      handPresent: false,
      handedness: "none",
      fingersExtended: [false, false, false, false, false],
      fingerCount: 0,
      pinchDistance: 0,
      gesture: "none",
      landmarks: [],
      confidence: 0,
      precisionMode: false,
    });
  }


  private tick() {
    if (!this.landmarker || this.video.readyState < 2) return;
    const tNow = performance.now();
    if (this.video.currentTime === this.lastVideoTime) {
      this.draw(null);
      return;
    }
    this.lastVideoTime = this.video.currentTime;

    const t0 = performance.now();
    const result = this.landmarker.detectForVideo(this.video, tNow);
    const inferMs = performance.now() - t0;

    // FPS calc
    this.frameTimes.push(tNow);
    while (this.frameTimes.length && tNow - this.frameTimes[0] > 1000) this.frameTimes.shift();

    const snap = TelemetryStore.get();
    if (snap.emergencyStop) {
      this.draw(result);
      return;
    }

    let confidence = 0;
    if (result.landmarks.length > 0) {
      // ===== Dual-hand processing =====
      // We process EVERY detected hand through its own independent state
      // (filters, click state, scroll history). Both hands produce gestures
      // and motion in parallel; we then merge them into a single OS cursor
      // stream — the hand with the strongest intent this frame drives the
      // cursor, but click/scroll fired by the OTHER hand are still emitted.
      const seenSides = new Set<"Left" | "Right">();
      const perHand: {
        side: "Left" | "Right";
        h: HandState;
        intent: number;
        score: number;
        gesture: GestureKind;
        pressure: number;
        landmarks: HandLandmarks;
        fingersExtended: [boolean, boolean, boolean, boolean, boolean];
        fingerCount: number;
        pinch: number;
        rawIndex: number;
        cursorIntent: boolean;
      }[] = [];

      const rawSides = result.landmarks.map((lm, i) => {
        const handednessSrc = result.handedness?.[i]?.[0]?.categoryName ?? "";
        // Selfie-mirror correction: MediaPipe reports the camera-frame side.
        const classifierSide: "Left" | "Right" =
          handednessSrc === "Left" ? "Right" :
          handednessSrc === "Right" ? "Left" :
          (i === 0 ? "Right" : "Left");
        const mirroredWristX = 1 - (lm[0]?.x ?? 0.5);
        const positionSide: "Left" | "Right" = mirroredWristX < 0.5 ? "Left" : "Right";
        return { classifierSide, positionSide };
      });
      const hasDuplicateClassifierSide = new Set(rawSides.map((s) => s.classifierSide)).size < rawSides.length;

      for (let i = 0; i < result.landmarks.length; i++) {
        // Do NOT drop a hand just because MediaPipe assigns both detections
        // the same handedness. That was the main reason dual-hand control
        // appeared to only detect one hand. When classifier sides collide,
        // resolve by the hand's mirrored on-screen position instead.
        let side: "Left" | "Right" = hasDuplicateClassifierSide
          ? rawSides[i].positionSide
          : rawSides[i].classifierSide;
        if (seenSides.has(side)) {
          const other: "Left" | "Right" = side === "Left" ? "Right" : "Left";
          if (!seenSides.has(other)) side = other;
          else continue;
        }
        seenSides.add(side);

        let h = this.hands.get(side);
        if (!h) {
          h = new HandState();
          this.hands.set(side, h);
        }
        h.lastSeenAt = tNow;

        const out = this.processHand(result, tNow, i, side, h);
        // Compute intent score for primary-hand selection.
        const score = result.handedness?.[i]?.[0]?.score ?? 0.8;
        const indexControlPose = out.fingersExtended[1] && !out.fingersExtended[2] && !out.fingersExtended[3] && !out.fingersExtended[4];
        const cursorIntent = indexControlPose || out.gesture === "scroll_up" || out.gesture === "scroll_down";
        const fingers = out.fingerCount - (out.fingersExtended[0] ? 1 : 0);
        const poseIntent = cursorIntent ? 0.9 : (fingers === 4 || fingers === 0 ? 0.25 : 0.1);
        // Active gestures get only a tiny boost. Previously pinch/click got a
        // huge boost and stole primary control from the pointing hand, making
        // dual-hand use feel like "only one hand works".
        const actionBoost =
          out.gesture === "click" || out.gesture === "drag" ||
          out.gesture === "scroll_up" || out.gesture === "scroll_down" ||
          out.gesture === "right_click" ? 0.12 : 0;
        const intent = poseIntent + score * 0.25 + actionBoost;
        perHand.push({
          side, h, intent, score,
          gesture: out.gesture,
          pressure: out.pressure,
          landmarks: out.landmarks,
          fingersExtended: out.fingersExtended,
          fingerCount: out.fingerCount,
          pinch: out.pinch,
          rawIndex: i,
          cursorIntent,
        });
      }

      // Drop hand state for sides that disappeared this frame.
      for (const side of Array.from(this.hands.keys())) {
        if (!seenSides.has(side)) {
          const h = this.hands.get(side)!;
          // If a hand has been gone for >300 ms, fully discard its state.
          if (tNow - h.lastSeenAt > 300) {
            this.hands.delete(side);
          }
        }
      }

      if (perHand.length > 0) {
        // Pick primary: highest-intent. Add a small bias for the previous
        // primary so we don't flicker frame-to-frame on near-ties.
        const cursorCandidates = perHand.filter((p) => p.cursorIntent);
        const primaryPool = cursorCandidates.length > 0 ? cursorCandidates : perHand;
        let primary = primaryPool[0];
        for (const p of primaryPool) {
          const bias = p.side === this.lastPrimary ? 0.15 : 0;
          const pBias = primary.side === this.lastPrimary ? 0.15 : 0;
          if (p.intent + bias > primary.intent + pBias) primary = p;
        }
        this.lastPrimary = primary.side;
        confidence = primary.score;

        // Emit motion from the primary hand. Then, for any OTHER hand
        // that is firing a click/scroll/right-click, emit its event too
        // (without moving the cursor) so both hands can act in parallel.
        this.emitMotion(primary.h, primary.gesture, primary.pressure);
        for (const p of perHand) {
          if (p.side === primary.side) continue;
          if (p.gesture === "click" || p.gesture === "right_click" ||
              p.gesture === "scroll_up" || p.gesture === "scroll_down") {
            // Use the primary cursor coordinates — secondary hand contributes
            // the gesture, but the click target is wherever the primary
            // cursor currently is. This matches the user's mental model:
            // "right hand aims, left hand taps to click".
            this.emitMotion(primary.h, p.gesture, p.pressure);
          }
        }

        // Telemetry reflects the primary hand for the live overlay, but we
        // include landmarks from BOTH hands so the HUD draws them all.
        const allLandmarks: HandLandmarks = [];
        for (const p of perHand) {
          for (const pt of p.landmarks) allLandmarks.push(pt);
        }
        // Build per-hand debug snapshots for the dual-hand overlay.
        const handsDebug: HandDebugInfo[] = perHand.map((p) => {
          let minX = 1, minY = 1, maxX = 0, maxY = 0;
          for (const pt of p.landmarks) {
            if (pt.x < minX) minX = pt.x;
            if (pt.y < minY) minY = pt.y;
            if (pt.x > maxX) maxX = pt.x;
            if (pt.y > maxY) maxY = pt.y;
          }
          const wristPt = p.landmarks[0] ?? { x: 0.5, y: 0.5 };
          return {
            index: p.rawIndex,
            side: p.side,
            confidence: p.score,
            wrist: { x: wristPt.x, y: wristPt.y },
            bbox: { x: minX, y: minY, w: Math.max(0, maxX - minX), h: Math.max(0, maxY - minY) },
            isPrimary: p.side === primary.side,
          };
        });
        TelemetryStore.set({
          cursorX: primary.h.cursor.x,
          cursorY: primary.h.cursor.y,
          gesture: primary.gesture,
          handPresent: true,
          handedness: primary.side,
          fingersExtended: primary.fingersExtended,
          fingerCount: primary.fingerCount,
          pinchDistance: primary.pinch,
          landmarks: allLandmarks,
          precisionMode: primary.h.cursorSpeed < 0.05,
          handsDetected: perHand.length,
          handsDebug,
        });
      }
    } else {
      confidence = 0;
      for (const h of this.hands.values()) h.reset();
      this.hands.clear();
      this.lastPrimary = null;
      TelemetryStore.set({
        handPresent: false,
        handedness: "none",
        fingersExtended: [false, false, false, false, false],
        fingerCount: 0,
        pinchDistance: 0,
        gesture: "none",
        landmarks: [],
        precisionMode: false,
        handsDetected: 0,
        handsDebug: [],
      });
    }

    const sensorLost = result.landmarks.length === 0;
    TelemetryStore.set({
      fps: this.frameTimes.length,
      inferenceMs: inferMs,
      confidence,
      sensorLost,
    });

    this.draw(result);
  }

  /**
   * Run the full per-hand pipeline (filters, click state, gesture detection)
   * for a single hand using its own HandState. Returns the gesture & metadata
   * — caller decides which hand becomes primary and is responsible for
   * emitting motion to the bridge.
   */
  private processHand(
    result: HandLandmarkerResult,
    tNow: number,
    handIdx: number,
    handedness: "Left" | "Right",
    h: HandState,
  ): {
    gesture: GestureKind;
    pressure: number;
    landmarks: HandLandmarks;
    fingersExtended: [boolean, boolean, boolean, boolean, boolean];
    fingerCount: number;
    pinch: number;
  } {
    const lm = result.landmarks[handIdx];
    const thumbTip = lm[4];
    const indexTip = lm[8];
    const middleTip = lm[12];
    const ringTip = lm[16];
    const pinkyTip = lm[20];
    const indexPip = lm[6];
    const middlePip = lm[10];
    const ringPip = lm[14];
    const pinkyPip = lm[18];
    const wrist = lm[0];

    this.applySmoothingParams(h);
    const [tx, ty, tz] = h.fThumb.filter(thumbTip.x, thumbTip.y, thumbTip.z, tNow);
    const [ixs, iys, izs] = h.fIndex.filter(indexTip.x, indexTip.y, indexTip.z, tNow);
    const [imx, imy, imz] = h.fIndexMcp.filter(lm[5].x, lm[5].y, lm[5].z, tNow);
    const [wx, wy, wz] = h.fWrist.filter(wrist.x, wrist.y, wrist.z, tNow);
    const [mx, my, mz] = h.fMiddleTip.filter(middleTip.x, middleTip.y, middleTip.z, tNow);
    h.smoothedThumb = [tx, ty, tz];
    h.smoothedIndex = [ixs, iys, izs];

    const ix = h.smoothedIndex[0];
    const iy = h.smoothedIndex[1];

    const camAspect = this.canvas.width / this.canvas.height || 16 / 9;
    let zoneW = 1, zoneH = 1;
    if (this.config.aspectRatio >= camAspect) {
      zoneH = camAspect / this.config.aspectRatio;
    } else {
      zoneW = this.config.aspectRatio / camAspect;
    }
    const cx = 0.5 + this.originOffset.x;
    const cy = 0.5 + this.originOffset.y;
    const zx0 = cx - zoneW / 2;
    const zy0 = cy - zoneH / 2;
    const mirroredX = 1 - ix;
    const inZoneX = (mirroredX - zx0) / zoneW;
    const inZoneY = (iy - zy0) / zoneH;

    const mirroredLandmarks: HandLandmarks =
      lm.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z }));

    // ---- Finger state ----
    const indexExt = indexTip.y < indexPip.y - 0.02;
    const middleExt = middleTip.y < middlePip.y - 0.02;
    const ringExt = ringTip.y < ringPip.y - 0.02;
    const pinkyExt = pinkyTip.y < pinkyPip.y - 0.02;
    const thumbIp = lm[3];
    const thumbExt = Math.hypot(thumbTip.x - wrist.x, thumbTip.y - wrist.y) >
                     Math.hypot(thumbIp.x - wrist.x, thumbIp.y - wrist.y) + 0.01;
    const fingersExtended: [boolean, boolean, boolean, boolean, boolean] =
      [thumbExt, indexExt, middleExt, ringExt, pinkyExt];
    const fingerCount = fingersExtended.filter(Boolean).length;

    // Out-of-active-zone: still report pose but freeze cursor + click state.
    if (inZoneX < 0 || inZoneX > 1 || inZoneY < 0 || inZoneY > 1) {
      h.clickState = "IDLE";
      h.pinchStartTs = 0;
      h.lastScrollY = null;
      return {
        gesture: "none",
        pressure: 0,
        landmarks: mirroredLandmarks,
        fingersExtended,
        fingerCount,
        pinch: 0,
      };
    }

    // Cursor with velocity² acceleration + dead-zone.
    let cx2 = inZoneX;
    let cy2 = inZoneY;
    if (h.prevIndex) {
      const dt = Math.max(1, tNow - h.prevIndex.t) / 1000;
      const dx = inZoneX - h.prevIndex.x;
      const dy = inZoneY - h.prevIndex.y;
      const speed = Math.hypot(dx, dy) / dt;
      if (speed < this.config.deadZone) {
        cx2 = h.cursor.x;
        cy2 = h.cursor.y;
      } else {
        const accel = speed * this.config.sensitivity;
        const gain = Math.max(1, accel);
        cx2 = h.cursor.x + dx * gain;
        cy2 = h.cursor.y + dy * gain;
      }
    }
    const rawCx = Math.min(1, Math.max(0, cx2));
    const rawCy = Math.min(1, Math.max(0, cy2));
    const [smCx, smCy] = h.fCursor.filter(rawCx, rawCy, tNow);
    if (h.prevIndex) {
      const dtc = Math.max(0.001, (tNow - h.prevIndex.t) / 1000);
      const instSpeed = Math.hypot(smCx - h.cursor.x, smCy - h.cursor.y) / dtc;
      h.cursorSpeed = h.cursorSpeed * 0.7 + instSpeed * 0.3;
    }
    // We DEFER committing the cursor update until we know the pose.
    // Per spec, cursor only moves when:
    //   - index is extended (pointing / drawing-pinch / scroll)
    //   - OR a fist is held (grab-drag) so user can drag things around
    // For any other pose (open palm, thumbs up, peace, etc.), the cursor
    // FREEZES so static shortcut poses don't slide the pointer around.
    const pendingCursor = { x: smCx, y: smCy };
    h.prevIndex = { x: inZoneX, y: inZoneY, t: tNow };

    // Pinch ratio.
    const dxp = h.smoothedThumb[0] - h.smoothedIndex[0];
    const dyp = h.smoothedThumb[1] - h.smoothedIndex[1];
    const dzp = h.smoothedThumb[2] - h.smoothedIndex[2];
    const pinchRaw = Math.hypot(dxp, dyp, dzp);
    const handScale = Math.max(0.05, Math.hypot(imx - wx, imy - wy, imz - wz));
    const pinch = pinchRaw / handScale;

    if (h.prevPinch != null && h.prevPinchT > 0) {
      const dtp = Math.max(0.001, (tNow - h.prevPinchT) / 1000);
      const instV = (pinch - h.prevPinch) / dtp;
      h.pinchVelocity = h.pinchVelocity * 0.5 + instV * 0.5;
    }
    h.prevPinch = pinch;
    h.prevPinchT = tNow;
    const closingBoost = h.pinchVelocity < -0.4
      ? Math.min(0.12, Math.abs(h.pinchVelocity) * 0.06)
      : 0;
    const effClickThreshold = this.config.clickThreshold + closingBoost;
    const pressure = Math.min(1, Math.max(0, 1 - pinch / 0.7));

    // Three-finger pinch (right click).
    const tmPinchRaw = Math.hypot(tx - mx, ty - my, tz - mz);
    const tmPinch = tmPinchRaw / handScale;

    const scrollMode = indexExt && middleExt && !thumbExt && !ringExt && !pinkyExt;
    const isFist = !indexExt && !middleExt && !ringExt && !pinkyExt && !thumbExt;
    const isOpenPalm = fingerCount === 5;
    let palmFacing: "front" | "back" | "unknown" = "unknown";
    if (isOpenPalm) {
      const pinkyMcp = lm[17];
      const ax = lm[5].x - wrist.x;
      const ay = lm[5].y - wrist.y;
      const bx = pinkyMcp.x - wrist.x;
      const by = pinkyMcp.y - wrist.y;
      const crossZ = ax * by - ay * bx;
      if (handedness === "Right") palmFacing = crossZ > 0 ? "front" : "back";
      else palmFacing = crossZ < 0 ? "front" : "back";
    }
    const isThumbsUp = thumbExt && !indexExt && !middleExt && !ringExt && !pinkyExt;
    const isPinkyOnly = pinkyExt && !indexExt && !middleExt && !ringExt && !thumbExt;
    const isFourFingers = indexExt && middleExt && ringExt && pinkyExt && !thumbExt;
    const isMiddleOnly = middleExt && !thumbExt && !indexExt && !ringExt && !pinkyExt;
    const isRingOnly = ringExt && !thumbExt && !indexExt && !middleExt && !pinkyExt;
    const isTwoFingerPoint = indexExt && ringExt && !thumbExt && !middleExt && !pinkyExt;
    const isThreeFingers = indexExt && middleExt && ringExt && !thumbExt && !pinkyExt;
    const isPeace = thumbExt && indexExt && middleExt && !ringExt && !pinkyExt;
    const isRock = indexExt && pinkyExt && !middleExt && !ringExt;
    const isPhoneCall = thumbExt && pinkyExt && !indexExt && !middleExt && !ringExt;
    // Cursor should move ONLY from the index finger. A natural pinch keeps
    // the index extended; if the index is folded, treat the pose as a static
    // shortcut/no-op rather than moving or clicking.
    const isIndexControlPose = indexExt && !middleExt && !ringExt && !pinkyExt;
    const isPointing = isIndexControlPose && !thumbExt;
    const isThreePinch = pinch < effClickThreshold &&
                         tmPinch < effClickThreshold * 1.4 &&
                         indexExt && middleExt;
    const isPinchClick = isIndexControlPose && pinch < effClickThreshold && !isThreePinch;

    // ===== Cursor-motion gate (per user spec) =====
    // Move only when intentionally pointing with the index finger, pinching
    // with the index finger, or scrolling. Static poses/fist do not move the
    // cursor, matching the requested "move cursor only when index moves" rule.
    // This prevents the cursor from sliding while the user holds open-palm
    // (undo) or other static shortcut poses.
    const cursorAllowed =
      isPointing || isPinchClick || isThreePinch || scrollMode;
    if (cursorAllowed) {
      h.cursor.x = pendingCursor.x;
      h.cursor.y = pendingCursor.y;
    }
    // ===== Fist exclusivity =====
    // While a fist is held, no other gesture should fire. Return the fist
    // gesture immediately so BrowserCursor can run its grab-drag loop and
    // every other detection (palm/peace/pinch) is suppressed on this hand.
    if (isFist) {
      h.clickState = "IDLE";
      h.pinchStartTs = 0;
      h.lastScrollY = null;
      h.gestureCandidate = "fist";
      h.gestureCandidateCount = Math.max(h.gestureCandidateCount + 1, this.gestureStabilityFrames);
      h.committedGesture = "fist";
      return {
        gesture: "fist",
        pressure: 0,
        landmarks: mirroredLandmarks,
        fingersExtended,
        fingerCount,
        pinch,
      };
    }

    let gesture: GestureKind = "none";
    if (isPinchClick) {
      h.lastScrollY = null;
      if (h.clickState === "IDLE") {
        if (h.pinchStartTs === 0) h.pinchStartTs = tNow;
        if (tNow - h.pinchStartTs >= this.debounceMs) {
          h.clickState = "CLICK_DOWN";
          gesture = "click";
        }
      } else if (h.clickState === "CLICK_DOWN") {
        gesture = "drag";
        h.clickState = "DRAG";
      } else if (h.clickState === "DRAG") {
        gesture = "drag";
      }
    } else if (isOpenPalm) {
      gesture = palmFacing === "back" ? "palm_back" : "open_palm";
      h.clickState = "IDLE"; h.lastScrollY = null;
    } else if (isThumbsUp) {
      gesture = "thumbs_up"; h.clickState = "IDLE"; h.lastScrollY = null;
    } else if (isPinkyOnly) {
      gesture = "pinky_only"; h.clickState = "IDLE"; h.lastScrollY = null;
    } else if (isFourFingers) {
      gesture = "four_fingers"; h.clickState = "IDLE"; h.lastScrollY = null;
    } else if (isPhoneCall) {
      gesture = "phone_call"; h.clickState = "IDLE"; h.lastScrollY = null;
    } else if (isRock) {
      gesture = "rock"; h.clickState = "IDLE"; h.lastScrollY = null;
    } else if (isThreeFingers) {
      gesture = "three_fingers"; h.clickState = "IDLE"; h.lastScrollY = null;
    } else if (isPeace) {
      gesture = "peace"; h.clickState = "IDLE"; h.lastScrollY = null;
    } else if (isTwoFingerPoint) {
      gesture = "two_finger_point"; h.clickState = "IDLE"; h.lastScrollY = null;
    } else if (isMiddleOnly) {
      gesture = "middle_only"; h.clickState = "IDLE"; h.lastScrollY = null;
    } else if (isRingOnly) {
      gesture = "ring_only"; h.clickState = "IDLE"; h.lastScrollY = null;
    } else if (isThreePinch) {
      gesture = "right_click"; h.clickState = "IDLE"; h.lastScrollY = null;
    } else if (scrollMode) {
      if (h.lastScrollY != null) {
        const sdy = iy - h.lastScrollY;
        if (Math.abs(sdy) > 0.003 && tNow - h.lastScrollEmit >= this.scrollMinIntervalMs) {
          gesture = sdy < 0 ? "scroll_up" : "scroll_down";
          h.lastScrollEmit = tNow;
        }
      }
      h.lastScrollY = iy;
      h.clickState = "IDLE";
    } else {
      h.lastScrollY = null;
      if (h.clickState === "IDLE") {
        if (isPinchClick) {
          if (h.pinchStartTs === 0) h.pinchStartTs = tNow;
          if (tNow - h.pinchStartTs >= this.debounceMs) {
            h.clickState = "CLICK_DOWN";
            gesture = "click";
          }
        } else {
          h.pinchStartTs = 0;
          if (isPointing) gesture = "point";
        }
      } else if (h.clickState === "CLICK_DOWN") {
        if (pinch >= this.config.releaseThreshold) {
          h.clickState = "IDLE"; h.pinchStartTs = 0; gesture = "none";
        } else {
          gesture = "drag"; h.clickState = "DRAG";
        }
      } else if (h.clickState === "DRAG") {
        if (pinch >= this.config.releaseThreshold) {
          h.clickState = "IDLE"; h.pinchStartTs = 0; gesture = "none";
        } else {
          gesture = "drag";
        }
      }
    }

    // Static-pose stability voting (per hand).
    const isStaticPose =
      gesture === "open_palm" || gesture === "palm_back" || gesture === "thumbs_up" ||
      gesture === "pinky_only" || gesture === "four_fingers" ||
      gesture === "middle_only" ||
      gesture === "ring_only" || gesture === "two_finger_point" ||
      gesture === "three_fingers" || gesture === "peace" ||
      gesture === "rock" || gesture === "phone_call" ||
      gesture === "right_click";
    let committed: GestureKind = gesture;
    if (isStaticPose) {
      if (gesture === h.gestureCandidate) h.gestureCandidateCount++;
      else { h.gestureCandidate = gesture; h.gestureCandidateCount = 1; }
      if (h.gestureCandidateCount >= this.gestureStabilityFrames) {
        h.committedGesture = gesture;
      }
      committed = h.committedGesture === gesture ? gesture : "none";
    } else {
      h.gestureCandidate = gesture;
      h.gestureCandidateCount = 0;
      h.committedGesture = gesture;
      committed = gesture;
    }

    return {
      gesture: committed,
      pressure,
      landmarks: mirroredLandmarks,
      fingersExtended,
      fingerCount,
      pinch,
    };
  }

  private emitMotion(h: HandState, gesture: GestureKind, pressure: number) {
    this.bridge.send({
      event: "motion",
      data: {
        x: h.cursor.x,
        y: h.cursor.y,
        pressure,
        gesture,
      },
      timestamp: Date.now(),
    });
  }

  private draw(result: HandLandmarkerResult | null) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Active zone box (mirrored to match mirrored video)
    const camAspect = w / h || 16 / 9;
    let zoneW = 1, zoneH = 1;
    if (this.config.aspectRatio >= camAspect) {
      zoneH = camAspect / this.config.aspectRatio;
    } else {
      zoneW = this.config.aspectRatio / camAspect;
    }
    const cx = 0.5 + this.originOffset.x;
    const cy = 0.5 + this.originOffset.y;
    const zx0 = (cx - zoneW / 2) * w;
    const zy0 = (cy - zoneH / 2) * h;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1;
    ctx.strokeRect(zx0, zy0, zoneW * w, zoneH * h);
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillText("ACTIVE ZONE", zx0 + 6, zy0 + 14);
    ctx.restore();

    if (!result || result.landmarks.length === 0) return;

    // Draw EVERY detected hand. The non-controller hand is rendered in a
    // muted tone so the user can see they're being tracked even though
    // only one hand drives the cursor.
    for (let hi = 0; hi < result.landmarks.length; hi++) {
      const lm = result.landmarks[hi];
      const isPrimary =
        hi ===
        result.landmarks
          .map((_, i) => result.handedness?.[i]?.[0]?.score ?? 0)
          .reduce((bi, s, i, arr) => (s > arr[bi] ? i : bi), 0);

      // Mirror landmarks horizontally to match mirrored video
      const pts = lm.map((p) => ({ x: (1 - p.x) * w, y: p.y * h }));

      const boneColor = isPrimary ? "hsl(160 84% 50%)" : "hsl(160 30% 45%)";
      const jointColor = isPrimary ? "hsl(160 84% 60%)" : "hsl(160 25% 55%)";
      const tipColor = isPrimary ? "white" : "hsl(0 0% 75%)";

      // Bones
      ctx.strokeStyle = boneColor;
      ctx.lineWidth = isPrimary ? 2 : 1.5;
      ctx.shadowColor = boneColor;
      ctx.shadowBlur = isPrimary ? 6 : 0;
      for (const [a, b] of HAND_CONNECTIONS) {
        ctx.beginPath();
        ctx.moveTo(pts[a].x, pts[a].y);
        ctx.lineTo(pts[b].x, pts[b].y);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;

      // Joints — skip wrist (0), it gets a special diamond marker below.
      ctx.fillStyle = jointColor;
      for (let i = 1; i < pts.length; i++) {
        ctx.beginPath();
        ctx.arc(pts[i].x, pts[i].y, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Highlight thumb (4) and index (8)
      ctx.fillStyle = tipColor;
      for (const i of [4, 8]) {
        ctx.beginPath();
        ctx.arc(pts[i].x, pts[i].y, isPrimary ? 3.5 : 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // 4-SIDED HAND-CENTER MARKER on the wrist (landmark 0).
      // Drawn as a rotated square (diamond) with an outlined fill so it
      // reads as the hand's anchor point at any zoom level.
      const wp = pts[0];
      const r = isPrimary ? 7 : 5;
      ctx.save();
      ctx.translate(wp.x, wp.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = isPrimary
        ? "hsla(160, 84%, 55%, 0.85)"
        : "hsla(160, 30%, 55%, 0.6)";
      ctx.strokeStyle = isPrimary ? "white" : "hsl(0 0% 80%)";
      ctx.lineWidth = isPrimary ? 1.5 : 1;
      ctx.shadowColor = boneColor;
      ctx.shadowBlur = isPrimary ? 8 : 0;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.strokeRect(-r, -r, r * 2, r * 2);
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // Cursor crosshair from primary hand (active zone → camera coords).
    const primary =
      (this.lastPrimary && this.hands.get(this.lastPrimary)) ||
      this.hands.values().next().value;
    if (!primary) return;
    const curCamX = (zx0 + primary.cursor.x * zoneW * w);
    const curCamY = (zy0 + primary.cursor.y * zoneH * h);
    ctx.strokeStyle = "hsl(160 84% 60%)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(curCamX - 10, curCamY);
    ctx.lineTo(curCamX + 10, curCamY);
    ctx.moveTo(curCamX, curCamY - 10);
    ctx.lineTo(curCamX, curCamY + 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(curCamX, curCamY, 6, 0, Math.PI * 2);
    ctx.stroke();
  }
}

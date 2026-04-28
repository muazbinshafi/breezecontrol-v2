// GestureEngine - MediaPipe HandLandmarker with One-Euro filter smoothing,
// active-zone clamp, adaptive cursor acceleration, gesture stability voting,
// and a strict click/drag state machine. Tuned for low-latency, jitter-free
// pointer tracking comparable to native trackpads.

import {
  HandLandmarker,
  FilesetResolver,
  type HandLandmarkerResult,
} from "@mediapipe/tasks-vision";
import { TelemetryStore, type GestureKind } from "./TelemetryStore";
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

export class GestureEngine {
  private landmarker: HandLandmarker | null = null;
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bridge: HIDBridge;
  public config: EngineConfig;

  // One-Euro filters for jitter-free thumb / index landmarks (3D each).
  // Lower minCutoff + higher beta = preserves micro-motion of fingertips
  // (critical for sub-cm pinch precision) while still killing static jitter.
  private fThumb = new OneEuroFilter3D(1.4, 0.05);
  private fIndex = new OneEuroFilter3D(1.4, 0.05);
  // Extra landmarks we filter so the on-screen skeleton is rock-steady too.
  private fIndexMcp = new OneEuroFilter3D(1.2, 0.04);
  private fWrist = new OneEuroFilter3D(1.2, 0.04);
  private fMiddleTip = new OneEuroFilter3D(1.4, 0.05);
  private smoothedThumb: [number, number, number] | null = null;
  private smoothedIndex: [number, number, number] | null = null;
  // Final cursor low-pass (after acceleration). Slightly snappier than landmarks.
  private fCursor = new OneEuroFilter2D(2.0, 0.03);
  // Pinch ratio history for velocity-based "closing intent" detection.
  private prevPinch: number | null = null;
  private prevPinchT = 0;
  private pinchVelocity = 0;
  // Cursor speed (in normalized units / sec) — drives precision-mode boost.
  private cursorSpeed = 0;

  // Cursor state (smoothed, post-acceleration), normalized to active zone 0..1
  private cursor = { x: 0.5, y: 0.5 };
  private prevIndex: { x: number; y: number; t: number } | null = null;

  // Active zone center (set via Set Origin)
  private originOffset = { x: 0, y: 0 };

  // Click state machine
  private clickState: ClickState = "IDLE";
  private pinchStartTs = 0;
  private readonly debounceMs = 25;

  // Gesture stability voting — require N consecutive frames of the same
  // candidate gesture before committing. Eliminates 1-frame flickers.
  private gestureCandidate: GestureKind = "none";
  private gestureCandidateCount = 0;
  private committedGesture: GestureKind = "none";
  private readonly gestureStabilityFrames = 3;

  // Scroll state
  private lastScrollY: number | null = null;
  private lastScrollEmit = 0;
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
    this.applySmoothingParams();
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
  private applySmoothingParams() {
    const baseCutoff = Math.max(0.3, Math.min(6, this.config.smoothingAlpha));
    // Speed-adaptive precision boost: 0..1 where 1 = nearly motionless.
    // cursorSpeed is in normalized-units/sec — idle ≈ 0.01, sweep ≈ 1+.
    // We require the hand to actually be PRESENT before applying any boost,
    // otherwise the very first frames (when cursorSpeed is still 0 from init)
    // would lock the filter wide-shut and detection would feel "frozen".
    const handPresent = TelemetryStore.get().handPresent;
    const stillness = handPresent
      ? Math.max(0, Math.min(1, 1 - this.cursorSpeed * 8))
      : 0;
    // When still, blend cutoff toward 0.6 Hz (firm lock-in but not paralyzed).
    // When moving, sit at baseCutoff so motion is followed faithfully.
    const minCutoff = baseCutoff * (1 - 0.55 * stillness) + 0.6 * stillness;
    // beta scales gently with cutoff so fast motion is always followed.
    const beta = 0.015 + baseCutoff * 0.012;
    this.fThumb.setParams(minCutoff, beta);
    this.fIndex.setParams(minCutoff, beta);
    this.fIndexMcp.setParams(minCutoff * 0.9, beta);
    this.fWrist.setParams(minCutoff * 0.9, beta);
    this.fMiddleTip.setParams(minCutoff, beta);
    // Cursor filter is always slightly snappier than landmarks.
    this.fCursor.setParams(Math.min(6, minCutoff + 0.8), beta + 0.015);
    TelemetryStore.set({ precisionMode: stillness > 0.6 });
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
    if (!this.smoothedIndex) return;
    this.originOffset.x = this.smoothedIndex[0] - 0.5;
    this.originOffset.y = this.smoothedIndex[1] - 0.5;
  }

  /**
   * Hard-reset all transient detection state. Useful when the calibration UI
   * detects the engine is "stuck" in SENSOR LOST / searching — clears every
   * filter and the click state machine so the next frame starts fresh.
   */
  resetState() {
    this.fThumb.reset();
    this.fIndex.reset();
    this.fIndexMcp.reset();
    this.fWrist.reset();
    this.fMiddleTip.reset();
    this.fCursor.reset();
    this.smoothedThumb = null;
    this.smoothedIndex = null;
    this.prevIndex = null;
    this.prevPinch = null;
    this.prevPinchT = 0;
    this.pinchVelocity = 0;
    this.cursorSpeed = 0;
    this.clickState = "IDLE";
    this.pinchStartTs = 0;
    this.gestureCandidate = "none";
    this.gestureCandidateCount = 0;
    this.committedGesture = "none";
    this.lastScrollY = null;
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
      // Pick the most-confident hand as the controller (handedness score is
      // MediaPipe's per-hand confidence). This way the user can use either
      // hand and the system always tracks the strongest signal.
      let bestIdx = 0;
      let bestScore = result.handedness?.[0]?.[0]?.score ?? 0;
      for (let i = 1; i < result.landmarks.length; i++) {
        const s = result.handedness?.[i]?.[0]?.score ?? 0;
        if (s > bestScore) {
          bestScore = s;
          bestIdx = i;
        }
      }
      confidence = bestScore || 0.8;
      this.processLandmarks(result, tNow, bestIdx);
    } else {
      confidence = 0;
      this.smoothedIndex = null;
      this.smoothedThumb = null;
      this.fThumb.reset();
      this.fIndex.reset();
      this.fIndexMcp.reset();
      this.fWrist.reset();
      this.fMiddleTip.reset();
      this.fCursor.reset();
      this.gestureCandidate = "none";
      this.gestureCandidateCount = 0;
      this.committedGesture = "none";
      this.prevIndex = null;
      this.clickState = "IDLE";
      this.lastScrollY = null;
      this.prevPinch = null;
      this.prevPinchT = 0;
      this.pinchVelocity = 0;
      TelemetryStore.set({
        handPresent: false,
        handedness: "none",
        fingersExtended: [false, false, false, false, false],
        fingerCount: 0,
        pinchDistance: 0,
        gesture: "none",
        landmarks: [],
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

  private processLandmarks(result: HandLandmarkerResult, tNow: number, handIdx = 0) {
    const lm = result.landmarks[handIdx];
    const handednessSrc = result.handedness?.[handIdx]?.[0]?.categoryName ?? "";
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

    // Apply 3D One-Euro filter to the critical landmarks. Each axis adapts its
    // cutoff to the motion speed of THAT axis, so micro-tremor (sub-mm) is
    // killed while real motion passes through with no perceptible lag.
    this.applySmoothingParams();
    const [tx, ty, tz] = this.fThumb.filter(thumbTip.x, thumbTip.y, thumbTip.z, tNow);
    const [ixs, iys, izs] = this.fIndex.filter(indexTip.x, indexTip.y, indexTip.z, tNow);
    // Smooth the reference landmarks too — they feed the hand-scale denominator
    // for pinch-ratio. Noisy reference = noisy ratio = false-positive clicks.
    const [imx, imy, imz] = this.fIndexMcp.filter(lm[5].x, lm[5].y, lm[5].z, tNow);
    const [wx, wy, wz] = this.fWrist.filter(wrist.x, wrist.y, wrist.z, tNow);
    const [mx, my, mz] = this.fMiddleTip.filter(middleTip.x, middleTip.y, middleTip.z, tNow);
    this.smoothedThumb = [tx, ty, tz];
    this.smoothedIndex = [ixs, iys, izs];

    const ix = this.smoothedIndex[0];
    const iy = this.smoothedIndex[1];

    // Active zone: clamp to monitor aspect ratio centered at origin offset
    // Camera viewport is [0..1] x [0..1] (normalized). Build the largest rect
    // with this.config.aspectRatio that fits. Camera input aspect ~16:9 already.
    const camAspect = this.canvas.width / this.canvas.height || 16 / 9;
    let zoneW = 1;
    let zoneH = 1;
    if (this.config.aspectRatio >= camAspect) {
      zoneW = 1;
      zoneH = camAspect / this.config.aspectRatio;
    } else {
      zoneH = 1;
      zoneW = this.config.aspectRatio / camAspect;
    }
    const cx = 0.5 + this.originOffset.x;
    const cy = 0.5 + this.originOffset.y;
    const zx0 = cx - zoneW / 2;
    const zy0 = cy - zoneH / 2;

    // Mirror X (selfie view): cursor right when hand moves right in mirror.
    const mirroredX = 1 - ix;
    const inZoneX = (mirroredX - zx0) / zoneW;
    const inZoneY = (iy - zy0) / zoneH;

    if (inZoneX < 0 || inZoneX > 1 || inZoneY < 0 || inZoneY > 1) {
      // Out of active zone -> stop motion but still emit gesture state
      this.emitMotion("none", 0);
      return;
    }

    // Velocity² acceleration with dead-zone, applied to delta from previous index sample.
    let cx2 = inZoneX;
    let cy2 = inZoneY;
    if (this.prevIndex) {
      const dt = Math.max(1, tNow - this.prevIndex.t) / 1000;
      const dx = inZoneX - this.prevIndex.x;
      const dy = inZoneY - this.prevIndex.y;
      const speed = Math.hypot(dx, dy) / dt;
      if (speed < this.config.deadZone) {
        cx2 = this.cursor.x;
        cy2 = this.cursor.y;
      } else {
        const accel = speed * this.config.sensitivity;
        const gain = Math.max(1, accel); // V_cursor = V_hand² (squared via speed*sensitivity)
        cx2 = this.cursor.x + dx * gain;
        cy2 = this.cursor.y + dy * gain;
      }
    }
    // Final cursor low-pass: clamp first, then run through One-Euro for the
    // last bit of polish (kills any residual sub-pixel jitter under stillness).
    const rawCx = Math.min(1, Math.max(0, cx2));
    const rawCy = Math.min(1, Math.max(0, cy2));
    const [smCx, smCy] = this.fCursor.filter(rawCx, rawCy, tNow);
    // Track cursor speed for the adaptive precision-mode in applySmoothingParams.
    if (this.prevIndex) {
      const dtc = Math.max(0.001, (tNow - this.prevIndex.t) / 1000);
      const instSpeed = Math.hypot(smCx - this.cursor.x, smCy - this.cursor.y) / dtc;
      // EMA so the speed estimate doesn't flicker frame-to-frame.
      this.cursorSpeed = this.cursorSpeed * 0.7 + instSpeed * 0.3;
    }
    this.cursor.x = smCx;
    this.cursor.y = smCy;
    this.prevIndex = { x: inZoneX, y: inZoneY, t: tNow };

    // Pinch distance (3D Euclidean) on smoothed landmarks
    const dxp = this.smoothedThumb[0] - this.smoothedIndex[0];
    const dyp = this.smoothedThumb[1] - this.smoothedIndex[1];
    const dzp = this.smoothedThumb[2] - this.smoothedIndex[2];
    const pinchRaw = Math.hypot(dxp, dyp, dzp);
    // Hand scale = SMOOTHED wrist → INDEX MCP. Filtering the reference points
    // before dividing eliminates noise amplification near the threshold —
    // this is what unlocks mm-level discrimination of small thumb-index gaps.
    const handScale = Math.max(
      0.05,
      Math.hypot(imx - wx, imy - wy, imz - wz),
    );
    // pinch is now expressed as a ratio of hand size — robust at any distance.
    const pinch = pinchRaw / handScale;

    // Pinch velocity (ratio per second). Negative = fingers closing.
    if (this.prevPinch != null && this.prevPinchT > 0) {
      const dtp = Math.max(0.001, (tNow - this.prevPinchT) / 1000);
      // Light EMA on velocity to filter outliers without hiding intent.
      const instV = (pinch - this.prevPinch) / dtp;
      this.pinchVelocity = this.pinchVelocity * 0.5 + instV * 0.5;
    }
    this.prevPinch = pinch;
    this.prevPinchT = tNow;
    // Effective threshold: when fingers are actively closing fast, lower the
    // bar slightly so the click fires *as the user reaches* the gap — not
    // after they've already overshot. Cap the boost so static hands don't
    // accidentally trigger.
    const closingBoost = this.pinchVelocity < -0.4
      ? Math.min(0.12, Math.abs(this.pinchVelocity) * 0.06)
      : 0;
    const effClickThreshold = this.config.clickThreshold + closingBoost;

    const pressure = Math.min(1, Math.max(0, 1 - pinch / 0.7));

    // ---- Finger state detection (extended/folded) ----
    // Index/middle/ring/pinky: tip above PIP (lower y) means extended.
    const indexExt = indexTip.y < indexPip.y - 0.02;
    const middleExt = middleTip.y < middlePip.y - 0.02;
    const ringExt = ringTip.y < ringPip.y - 0.02;
    const pinkyExt = pinkyTip.y < pinkyPip.y - 0.02;
    // Thumb: compare horizontal distance from wrist (handedness-aware approximation).
    const thumbIp = lm[3];
    const thumbExt = Math.hypot(thumbTip.x - wrist.x, thumbTip.y - wrist.y) >
                     Math.hypot(thumbIp.x - wrist.x, thumbIp.y - wrist.y) + 0.01;

    const fingersExtended: [boolean, boolean, boolean, boolean, boolean] =
      [thumbExt, indexExt, middleExt, ringExt, pinkyExt];
    const fingerCount = fingersExtended.filter(Boolean).length;
    // MediaPipe returns mirrored handedness for selfie cam — flip it.
    const handedness = handednessSrc === "Left" ? "Right" : handednessSrc === "Right" ? "Left" : "none";

    // Three-finger pinch (thumb + index + middle close together) → right click
    const tmPinchRaw = Math.hypot(
      tx - mx,
      ty - my,
      tz - mz,
    );
    const tmPinch = tmPinchRaw / handScale;

    const scrollMode = indexExt && middleExt && !thumbExt && !ringExt && !pinkyExt;
    const isFist = !indexExt && !middleExt && !ringExt && !pinkyExt && !thumbExt;
    const isOpenPalm = fingerCount === 5;
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
    const isPointing = indexExt && !middleExt && !ringExt && !pinkyExt;
    const isThreePinch = pinch < effClickThreshold &&
                         tmPinch < effClickThreshold * 1.4 &&
                         indexExt && middleExt;

    let gesture: GestureKind = "none";

    // Pinch-as-click takes priority over static pose detection. Whenever the
    // thumb + index tips come within the click threshold, treat it as a click
    // regardless of whether the other fingers are curled (which would
    // otherwise be misclassified as "fist") or extended.
    const isPinchClick = pinch < effClickThreshold && !isThreePinch;

    if (isPinchClick) {
      // Run the click/drag state machine directly so pinch behaves like a
      // real mouse button — quick pinch = click, sustained = drag.
      this.lastScrollY = null;
      if (this.clickState === "IDLE") {
        if (this.pinchStartTs === 0) this.pinchStartTs = tNow;
        if (tNow - this.pinchStartTs >= this.debounceMs) {
          this.clickState = "CLICK_DOWN";
          gesture = "click";
        }
      } else if (this.clickState === "CLICK_DOWN") {
        gesture = "drag";
        this.clickState = "DRAG";
      } else if (this.clickState === "DRAG") {
        gesture = "drag";
      }
    } else if (isFist) {
      gesture = "fist";
      this.clickState = "IDLE";
      this.pinchStartTs = 0;
      this.lastScrollY = null;
    } else if (isOpenPalm) {
      gesture = "open_palm";
      this.clickState = "IDLE";
      this.lastScrollY = null;
    } else if (isThumbsUp) {
      gesture = "thumbs_up";
      this.clickState = "IDLE";
      this.lastScrollY = null;
    } else if (isPinkyOnly) {
      gesture = "pinky_only";
      this.clickState = "IDLE";
      this.lastScrollY = null;
    } else if (isFourFingers) {
      gesture = "four_fingers";
      this.clickState = "IDLE";
      this.lastScrollY = null;
    } else if (isPhoneCall) {
      gesture = "phone_call";
      this.clickState = "IDLE";
      this.lastScrollY = null;
    } else if (isRock) {
      gesture = "rock";
      this.clickState = "IDLE";
      this.lastScrollY = null;
    } else if (isThreeFingers) {
      gesture = "three_fingers";
      this.clickState = "IDLE";
      this.lastScrollY = null;
    } else if (isPeace) {
      gesture = "peace";
      this.clickState = "IDLE";
      this.lastScrollY = null;
    } else if (isTwoFingerPoint) {
      gesture = "two_finger_point";
      this.clickState = "IDLE";
      this.lastScrollY = null;
    } else if (isMiddleOnly) {
      gesture = "middle_only";
      this.clickState = "IDLE";
      this.lastScrollY = null;
    } else if (isRingOnly) {
      gesture = "ring_only";
      this.clickState = "IDLE";
      this.lastScrollY = null;
    } else if (isThreePinch) {
      gesture = "right_click";
      this.clickState = "IDLE";
      this.lastScrollY = null;
    } else if (scrollMode) {
      // Scroll: vertical delta of index tip
      if (this.lastScrollY != null) {
        const sdy = iy - this.lastScrollY;
        if (Math.abs(sdy) > 0.003 && tNow - this.lastScrollEmit >= this.scrollMinIntervalMs) {
          gesture = sdy < 0 ? "scroll_up" : "scroll_down";
          this.lastScrollEmit = tNow;
        }
      }
      this.lastScrollY = iy;
      this.clickState = "IDLE";
    } else {
      this.lastScrollY = null;
      // Click / drag state machine with hysteresis + debounce
      if (this.clickState === "IDLE") {
        if (pinch < effClickThreshold) {
          if (this.pinchStartTs === 0) this.pinchStartTs = tNow;
          if (tNow - this.pinchStartTs >= this.debounceMs) {
            this.clickState = "CLICK_DOWN";
            gesture = "click";
          }
        } else {
          this.pinchStartTs = 0;
          if (isPointing) gesture = "point";
        }
      } else if (this.clickState === "CLICK_DOWN") {
        if (pinch >= this.config.releaseThreshold) {
          this.clickState = "IDLE";
          this.pinchStartTs = 0;
          gesture = "none";
        } else {
          // Sustained pinch -> drag
          gesture = "drag";
          this.clickState = "DRAG";
        }
      } else if (this.clickState === "DRAG") {
        if (pinch >= this.config.releaseThreshold) {
          this.clickState = "IDLE";
          this.pinchStartTs = 0;
          gesture = "none";
        } else {
          gesture = "drag";
        }
      }
    }

    // Gesture stability voting — keep the same gesture for N frames before
    // committing it. Pointer/click/drag/scroll are time-critical and bypass
    // voting; static poses (open_palm/thumbs_up/etc) get the full vote.
    const isStaticPose =
      gesture === "open_palm" || gesture === "thumbs_up" ||
      gesture === "pinky_only" || gesture === "four_fingers" ||
      gesture === "fist" || gesture === "middle_only" ||
      gesture === "ring_only" || gesture === "two_finger_point" ||
      gesture === "three_fingers" || gesture === "peace" ||
      gesture === "rock" || gesture === "phone_call" ||
      gesture === "right_click";
    let committed: GestureKind = gesture;
    if (isStaticPose) {
      if (gesture === this.gestureCandidate) {
        this.gestureCandidateCount++;
      } else {
        this.gestureCandidate = gesture;
        this.gestureCandidateCount = 1;
      }
      if (this.gestureCandidateCount >= this.gestureStabilityFrames) {
        this.committedGesture = gesture;
      }
      committed = this.committedGesture === gesture ? gesture : "none";
    } else {
      this.gestureCandidate = gesture;
      this.gestureCandidateCount = 0;
      this.committedGesture = gesture;
      committed = gesture;
    }

    // Mirrored normalized landmarks for live overlay (selfie view).
    const mirroredLandmarks = lm.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z }));

    TelemetryStore.set({
      cursorX: this.cursor.x,
      cursorY: this.cursor.y,
      gesture: committed,
      handPresent: true,
      handedness,
      fingersExtended,
      fingerCount,
      pinchDistance: pinch,
      landmarks: mirroredLandmarks,
    });

    this.emitMotion(committed, pressure);
  }

  private emitMotion(gesture: GestureKind, pressure: number) {
    this.bridge.send({
      event: "motion",
      data: {
        x: this.cursor.x,
        y: this.cursor.y,
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

    // Cursor crosshair (in active zone -> camera coords)
    const curCamX = (zx0 + this.cursor.x * zoneW * w);
    const curCamY = (zy0 + this.cursor.y * zoneH * h);
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

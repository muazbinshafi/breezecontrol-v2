// GestureEngine - rebuilt dual-hand MediaPipe pipeline.
//
// Design goals:
//   • continuous pointer motion with no hard dead-zone freezes
//   • explicit locked roles: one hand points, the other clicks/drags/scrolls
//   • resilient hand identity when MediaPipe flips/duplicates handedness
//   • pinch actions from either hand without stealing pointer control

import {
  HandLandmarker,
  FilesetResolver,
  type HandLandmarkerResult,
} from "@mediapipe/tasks-vision";
import { TelemetryStore, type GestureKind, type HandLandmarks, type HandDebugInfo, type HandLiveFrame } from "./TelemetryStore";
import type { HIDBridge } from "./HIDBridge";
import { OneEuroFilter2D, OneEuroFilter3D } from "./OneEuroFilter";

export interface EngineConfig {
  sensitivity: number;
  smoothingAlpha: number;
  clickThreshold: number;
  releaseThreshold: number;
  scrollSensitivity: number;
  aspectRatio: number;
  deadZone: number;
}

export const defaultConfig: EngineConfig = {
  sensitivity: 1.08,
  smoothingAlpha: 2.15,
  clickThreshold: 0.62,
  releaseThreshold: 0.78,
  scrollSensitivity: 14,
  aspectRatio: 16 / 9,
  deadZone: 0,
};

const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

type Side = "Left" | "Right";
type ClickState = "UP" | "DOWN" | "DRAG";

interface Vec3 { x: number; y: number; z: number }

interface HandFrame {
  side: Side;
  state: HandState;
  rawIndex: number;
  score: number;
  landmarks: HandLandmarks;
  rawLandmarks: Vec3[];
  cursor: { x: number; y: number };
  cursorIntent: boolean;
  actionIntent: boolean;
  gesture: GestureKind;
  pressure: number;
  fingersExtended: [boolean, boolean, boolean, boolean, boolean];
  fingerCount: number;
  pinch: number;
  indexOnly: boolean;
  scrollDelta: number;
}

class HandState {
  readonly thumb = new OneEuroFilter3D(2.0, 0.14);
  readonly index = new OneEuroFilter3D(2.2, 0.16);
  readonly indexMcp = new OneEuroFilter3D(1.8, 0.12);
  readonly wrist = new OneEuroFilter3D(1.8, 0.12);
  readonly middle = new OneEuroFilter3D(2.0, 0.14);
  readonly cursorFilter = new OneEuroFilter2D(2.8, 0.18);

  cursor = { x: 0.5, y: 0.5 };
  rawCursor = { x: 0.5, y: 0.5 };
  lastPointerSample: { x: number; y: number; t: number } | null = null;
  smoothedIndex: [number, number, number] | null = null;
  smoothedThumb: [number, number, number] | null = null;
  cursorSpeed = 0;
  pinchVelocity = 0;
  lastPinch: number | null = null;
  lastPinchAt = 0;
  clickState: ClickState = "UP";
  pinchBeganAt = 0;
  lastScrollY: number | null = null;
  lastScrollEmit = 0;
  staticCandidate: GestureKind = "none";
  staticCandidateFrames = 0;
  staticCommitted: GestureKind = "none";
  lastSeenAt = 0;

  setSmoothness(alpha: number) {
    const cutoff = Math.max(0.8, Math.min(6, alpha));
    const beta = 0.12 + cutoff * 0.055;
    this.thumb.setParams(cutoff, beta);
    this.index.setParams(cutoff + 0.15, beta + 0.02);
    this.indexMcp.setParams(cutoff * 0.85, beta);
    this.wrist.setParams(cutoff * 0.85, beta);
    this.middle.setParams(cutoff, beta);
    this.cursorFilter.setParams(cutoff + 0.55, beta + 0.05);
  }

  reset() {
    this.thumb.reset();
    this.index.reset();
    this.indexMcp.reset();
    this.wrist.reset();
    this.middle.reset();
    this.cursorFilter.reset();
    this.cursor = { x: 0.5, y: 0.5 };
    this.rawCursor = { x: 0.5, y: 0.5 };
    this.lastPointerSample = null;
    this.smoothedIndex = null;
    this.smoothedThumb = null;
    this.cursorSpeed = 0;
    this.pinchVelocity = 0;
    this.lastPinch = null;
    this.lastPinchAt = 0;
    this.clickState = "UP";
    this.pinchBeganAt = 0;
    this.lastScrollY = null;
    this.lastScrollEmit = 0;
    this.staticCandidate = "none";
    this.staticCandidateFrames = 0;
    this.staticCommitted = "none";
  }
}

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}

function dist3(a: Vec3 | { x: number; y: number; z: number }, b: Vec3 | { x: number; y: number; z: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function landmarkToVec(p: { x: number; y: number; z?: number }): Vec3 {
  return { x: p.x, y: p.y, z: p.z ?? 0 };
}

export class GestureEngine {
  private landmarker: HandLandmarker | null = null;
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bridge: HIDBridge;
  public config: EngineConfig;

  private hands = new Map<Side, HandState>();
  private lastPrimary: Side | null = null;
  private originOffset = { x: 0, y: 0 };
  private running = false;
  private rafId = 0;
  private lastVideoTime = -1;
  private frameTimes: number[] = [];

  private readonly debounceMs = 18;
  private readonly staticFrames = 2;
  private readonly scrollMinIntervalMs = 1000 / 120;

  constructor(video: HTMLVideoElement, canvas: HTMLCanvasElement, bridge: HIDBridge, config: EngineConfig) {
    this.video = video;
    this.canvas = canvas;
    this.bridge = bridge;
    this.config = config;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    this.ctx = ctx;
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
    const options = {
      numHands: 2,
      runningMode: "VIDEO" as const,
      minHandDetectionConfidence: floors?.minHandDetectionConfidence ?? 0.25,
      minHandPresenceConfidence: floors?.minHandPresenceConfidence ?? 0.25,
      minTrackingConfidence: floors?.minTrackingConfidence ?? 0.25,
    };
    const modelAssetPath =
      "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
    try {
      this.landmarker = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath, delegate: "GPU" },
        ...options,
      });
      console.info("[OmniPoint] HandLandmarker initialized (GPU delegate)", options);
    } catch (err) {
      console.warn("[OmniPoint] GPU delegate failed, falling back to CPU:", err);
      onProgress?.("GPU unavailable — falling back to CPU...");
      this.landmarker = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath, delegate: "CPU" },
        ...options,
      });
      console.info("[OmniPoint] HandLandmarker initialized (CPU delegate)", options);
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
    const hand = (this.lastPrimary && this.hands.get(this.lastPrimary)) || this.hands.get("Right") || this.hands.get("Left");
    if (!hand?.smoothedIndex) return;
    this.originOffset.x = hand.smoothedIndex[0] - 0.5;
    this.originOffset.y = hand.smoothedIndex[1] - 0.5;
  }

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
      handsDetected: 0,
      handsDebug: [],
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
    const inferenceMs = performance.now() - t0;

    this.frameTimes.push(tNow);
    while (this.frameTimes.length && tNow - this.frameTimes[0] > 1000) this.frameTimes.shift();

    if (TelemetryStore.get().emergencyStop) {
      this.draw(result);
      return;
    }

    const frames = this.buildHandFrames(result, tNow);
    if (frames.length === 0) {
      this.handleNoHands();
      TelemetryStore.set({ fps: this.frameTimes.length, inferenceMs, confidence: 0, sensorLost: true });
      this.draw(result);
      return;
    }

    const primary = this.choosePrimary(frames);
    const action = this.chooseAction(frames, primary);
    const finalGesture = action?.gesture ?? primary.gesture;
    const finalPressure = action?.pressure ?? primary.pressure;
    const finalHand = action?.side ?? primary.side;

    this.emitMotion(primary.state, finalGesture, finalPressure, finalHand);
    this.lastPrimary = primary.side;

    const allLandmarks = frames.flatMap((f) => f.landmarks);
    const handsDebug = this.createDebug(frames, primary.side);
    const handsLive: HandLiveFrame[] = frames.map((f) => ({
      side: f.side,
      cursorX: f.state.cursor.x,
      cursorY: f.state.cursor.y,
      gesture: f.gesture,
      pressure: f.pressure,
      fingersExtended: f.fingersExtended,
      pinchDistance: f.pinch,
      isPrimary: f.side === primary.side,
    }));
    TelemetryStore.set({
      cursorX: primary.state.cursor.x,
      cursorY: primary.state.cursor.y,
      gesture: finalGesture,
      handPresent: true,
      handedness: primary.side,
      fingersExtended: primary.fingersExtended,
      fingerCount: primary.fingerCount,
      pinchDistance: action?.pinch ?? primary.pinch,
      landmarks: primary.landmarks.length ? primary.landmarks : allLandmarks,
      precisionMode: primary.state.cursorSpeed < 0.02,
      handsDetected: frames.length,
      handsDebug,
      hands: handsLive,
      fps: this.frameTimes.length,
      inferenceMs,
      confidence: primary.score,
      sensorLost: false,
    });

    this.draw(result);
  }

  private handleNoHands() {
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

  private buildHandFrames(result: HandLandmarkerResult, tNow: number): HandFrame[] {
    const assignments = this.resolveHandSides(result);
    const frames: HandFrame[] = [];
    const seen = new Set<Side>();

    for (const a of assignments) {
      if (seen.has(a.side)) continue;
      seen.add(a.side);
      let state = this.hands.get(a.side);
      if (!state) {
        state = new HandState();
        this.hands.set(a.side, state);
      }
      state.lastSeenAt = tNow;
      frames.push(this.processHand(result, a.index, a.side, a.score, state, tNow));
    }

    for (const [side, state] of Array.from(this.hands.entries())) {
      if (!seen.has(side) && tNow - state.lastSeenAt > 220) this.hands.delete(side);
    }

    return frames;
  }

  private resolveHandSides(result: HandLandmarkerResult): { index: number; side: Side; score: number }[] {
    const detections = result.landmarks.map((lm, index) => {
      const raw = result.handedness?.[index]?.[0];
      const reported = raw?.categoryName;
      const classifierSide: Side = reported === "Left" ? "Right" : reported === "Right" ? "Left" : "Right";
      const score = raw?.score ?? 0.75;
      const mirroredWristX = 1 - (lm[0]?.x ?? 0.5);
      const positionSide: Side = mirroredWristX < 0.5 ? "Left" : "Right";
      return { index, classifierSide, positionSide, score, x: mirroredWristX };
    });

    if (detections.length <= 1) {
      return detections.map((d) => ({ index: d.index, side: d.positionSide, score: d.score }));
    }

    const classifierUnique = new Set(detections.map((d) => d.classifierSide)).size === detections.length;
    const sorted = [...detections].sort((a, b) => a.x - b.x);
    return sorted.map((d, order) => ({
      index: d.index,
      side: classifierUnique ? d.classifierSide : (order === 0 ? "Left" : "Right"),
      score: d.score,
    }));
  }

  private processHand(
    result: HandLandmarkerResult,
    handIdx: number,
    side: Side,
    score: number,
    state: HandState,
    tNow: number,
  ): HandFrame {
    const lm = result.landmarks[handIdx].map(landmarkToVec);
    state.setSmoothness(this.config.smoothingAlpha);

    const [tx, ty, tz] = state.thumb.filter(lm[4].x, lm[4].y, lm[4].z, tNow);
    const [ix, iy, iz] = state.index.filter(lm[8].x, lm[8].y, lm[8].z, tNow);
    const [imx, imy, imz] = state.indexMcp.filter(lm[5].x, lm[5].y, lm[5].z, tNow);
    const [wx, wy, wz] = state.wrist.filter(lm[0].x, lm[0].y, lm[0].z, tNow);
    const [mx, my, mz] = state.middle.filter(lm[12].x, lm[12].y, lm[12].z, tNow);
    state.smoothedThumb = [tx, ty, tz];
    state.smoothedIndex = [ix, iy, iz];

    const mirroredLandmarks = result.landmarks[handIdx].map((p) => ({ x: 1 - p.x, y: p.y, z: p.z ?? 0 }));
    const fingersExtended = this.detectFingers(lm);
    const fingerCount = fingersExtended.filter(Boolean).length;
    const [thumbExt, indexExt, middleExt, ringExt, pinkyExt] = fingersExtended;
    const indexOnly = indexExt && !middleExt && !ringExt && !pinkyExt;
    const twoFingerScroll = indexExt && middleExt && !ringExt && !pinkyExt;
    const fist = !thumbExt && !indexExt && !middleExt && !ringExt && !pinkyExt;
    const openPalm = fingerCount === 5;

    const target = this.mapIndexToCursor(ix, iy);
    this.updateContinuousCursor(state, target.x, target.y, tNow);

    const handScale = Math.max(0.045, Math.hypot(imx - wx, imy - wy, imz - wz));
    // Absolute 3D thumb-tip ↔ index-tip distance (in normalized image space).
    // We use the RAW tip distance for the "actually touching" test so the
    // pinch only fires when fingertips physically meet, not just when they
    // are merely close in the smoothed coordinate space.
    const rawTipDist = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y, lm[4].z - lm[8].z);
    const pinch = Math.hypot(tx - ix, ty - iy, tz - iz) / handScale;
    const middlePinch = Math.hypot(tx - mx, ty - my, tz - mz) / handScale;
    // Touch requires fingertip distance < ~ a fingertip radius relative to
    // the hand. Empirically ~22% of the index-MCP-to-wrist span ≈ touching.
    const touchAbs = rawTipDist < handScale * 0.22;
    if (state.lastPinch != null && state.lastPinchAt > 0) {
      const dt = Math.max(0.001, (tNow - state.lastPinchAt) / 1000);
      state.pinchVelocity = state.pinchVelocity * 0.55 + ((pinch - state.lastPinch) / dt) * 0.45;
    }
    state.lastPinch = pinch;
    state.lastPinchAt = tNow;

    const closingBoost = state.pinchVelocity < -0.35 ? Math.min(0.14, Math.abs(state.pinchVelocity) * 0.06) : 0;
    const clickThreshold = this.config.clickThreshold + closingBoost;
    const releaseThreshold = Math.max(this.config.releaseThreshold, this.config.clickThreshold + 0.08);
    const isThreePinch = twoFingerScroll && pinch < clickThreshold && middlePinch < clickThreshold * 1.45;
    // STRICT pinch: fingertips must ACTUALLY touch (touchAbs) AND the
    // smoothed pinch distance must be under threshold AND the index finger
    // must be extended. Once a pinch is active we relax the touchAbs gate
    // (use ratio-based release) so a held drag doesn't drop on micro-jitter.
    const pinchActive = state.clickState !== "UP";
    const isPinch = indexExt && !isThreePinch && (
      pinchActive
        ? pinch < releaseThreshold
        : (touchAbs && pinch < clickThreshold)
    );
    const pressure = clamp01(1 - pinch / releaseThreshold);

    let scrollDelta = 0;
    let gesture: GestureKind = "none";
    const cursorIntent = indexExt || isPinch || twoFingerScroll;

    if (isPinch) {
      state.lastScrollY = null;
      if (state.clickState === "UP") {
        if (state.pinchBeganAt === 0) state.pinchBeganAt = tNow;
        if (tNow - state.pinchBeganAt >= this.debounceMs) {
          state.clickState = "DOWN";
          gesture = "click";
        } else {
          gesture = "point";
        }
      } else {
        state.clickState = "DRAG";
        gesture = "drag";
      }
    } else if (state.clickState !== "UP" && pinch < releaseThreshold) {
      state.clickState = "DRAG";
      gesture = "drag";
    } else {
      if (state.clickState !== "UP") {
        state.clickState = "UP";
        state.pinchBeganAt = 0;
      }
      if (isThreePinch) {
        gesture = "right_click";
        state.lastScrollY = null;
      } else if (twoFingerScroll) {
        if (state.lastScrollY != null && tNow - state.lastScrollEmit >= this.scrollMinIntervalMs) {
          const dy = iy - state.lastScrollY;
          if (Math.abs(dy) > 0.0015) {
            scrollDelta = dy;
            gesture = dy < 0 ? "scroll_up" : "scroll_down";
            state.lastScrollEmit = tNow;
          } else {
            gesture = "point";
          }
        } else {
          gesture = "point";
        }
        state.lastScrollY = iy;
      } else if (indexOnly) {
        gesture = "point";
        state.lastScrollY = null;
      } else {
        state.lastScrollY = null;
        gesture = this.detectStaticGesture(lm, side, fingersExtended, fist, openPalm);
      }
    }

    const committed = this.commitStaticGesture(state, gesture);
    return {
      side,
      state,
      rawIndex: handIdx,
      score,
      landmarks: mirroredLandmarks,
      rawLandmarks: lm,
      cursor: state.cursor,
      cursorIntent,
      actionIntent: committed === "click" || committed === "drag" || committed === "right_click" || committed === "scroll_up" || committed === "scroll_down" || committed === "fist",
      gesture: committed,
      pressure,
      fingersExtended,
      fingerCount,
      pinch,
      indexOnly,
      scrollDelta,
    };
  }

  private mapIndexToCursor(ix: number, iy: number) {
    const camAspect = this.canvas.width / this.canvas.height || 16 / 9;
    let zoneW = 1;
    let zoneH = 1;
    if (this.config.aspectRatio >= camAspect) zoneH = camAspect / this.config.aspectRatio;
    else zoneW = this.config.aspectRatio / camAspect;
    const cx = 0.5 + this.originOffset.x;
    const cy = 0.5 + this.originOffset.y;
    const zx0 = cx - zoneW / 2;
    const zy0 = cy - zoneH / 2;
    return {
      x: clamp01(((1 - ix) - zx0) / zoneW),
      y: clamp01((iy - zy0) / zoneH),
    };
  }

  private updateContinuousCursor(state: HandState, x: number, y: number, tNow: number) {
    let nextX = x;
    let nextY = y;
    if (state.lastPointerSample) {
      const dt = Math.max(0.001, (tNow - state.lastPointerSample.t) / 1000);
      const dx = x - state.lastPointerSample.x;
      const dy = y - state.lastPointerSample.y;
      const speed = Math.hypot(dx, dy) / dt;
      const gain = 1 + Math.min(1.8, Math.sqrt(speed) * 0.18 * this.config.sensitivity);
      nextX = state.rawCursor.x + dx * gain;
      nextY = state.rawCursor.y + dy * gain;
      state.cursorSpeed = state.cursorSpeed * 0.65 + speed * 0.35;
    }
    state.lastPointerSample = { x, y, t: tNow };
    state.rawCursor = { x: clamp01(nextX), y: clamp01(nextY) };
    const [sx, sy] = state.cursorFilter.filter(state.rawCursor.x, state.rawCursor.y, tNow);
    state.cursor = { x: clamp01(sx), y: clamp01(sy) };
  }

  private detectFingers(lm: Vec3[]): [boolean, boolean, boolean, boolean, boolean] {
    const wrist = lm[0];
    const palmScale = Math.max(0.05, Math.hypot(lm[9].x - wrist.x, lm[9].y - wrist.y, lm[9].z - wrist.z));
    const extendedByDistance = (tip: number, pip: number, mcp: number) => {
      const tipToWrist = dist3(lm[tip], wrist);
      const pipToWrist = dist3(lm[pip], wrist);
      const tipAbovePip = lm[tip].y < lm[pip].y - palmScale * 0.10;
      const farEnough = tipToWrist > pipToWrist + palmScale * 0.08;
      const notFoldedIntoPalm = dist3(lm[tip], lm[mcp]) > palmScale * 0.52;
      return (tipAbovePip || farEnough) && notFoldedIntoPalm;
    };
    const thumbTip = lm[4];
    const thumbIp = lm[3];
    const thumbMcp = lm[2];
    const thumbExt = dist3(thumbTip, wrist) > dist3(thumbIp, wrist) + palmScale * 0.05 &&
      dist3(thumbTip, thumbMcp) > palmScale * 0.30;
    return [
      thumbExt,
      extendedByDistance(8, 6, 5),
      extendedByDistance(12, 10, 9),
      extendedByDistance(16, 14, 13),
      extendedByDistance(20, 18, 17),
    ];
  }

  private detectStaticGesture(
    lm: Vec3[],
    side: Side,
    fingers: [boolean, boolean, boolean, boolean, boolean],
    fist: boolean,
    openPalm: boolean,
  ): GestureKind {
    const [thumb, index, middle, ring, pinky] = fingers;
    if (fist) return "fist";
    if (openPalm) return this.isPalmBack(lm, side) ? "palm_back" : "open_palm";
    if (thumb && !index && !middle && !ring && !pinky) return "thumbs_up";
    if (pinky && !thumb && !index && !middle && !ring) return "pinky_only";
    if (index && middle && ring && pinky && !thumb) return "four_fingers";
    if (middle && !thumb && !index && !ring && !pinky) return "middle_only";
    if (ring && !thumb && !index && !middle && !pinky) return "ring_only";
    if (index && ring && !thumb && !middle && !pinky) return "two_finger_point";
    if (index && middle && ring && !thumb && !pinky) return "three_fingers";
    if (thumb && index && middle && !ring && !pinky) return "peace";
    if (index && pinky && !middle && !ring) return "rock";
    if (thumb && pinky && !index && !middle && !ring) return "phone_call";
    return "none";
  }

  private isPalmBack(lm: Vec3[], side: Side) {
    // Use a true 3D palm normal: cross( indexMCP-wrist , pinkyMCP-wrist ).
    // The sign of the normal's Z component (camera-space depth) tells us
    // whether the palm is facing the camera or facing away. We add a small
    // dead-band so a hand at near-perpendicular doesn't flicker.
    const wrist = lm[0];
    const ax = lm[5].x - wrist.x;
    const ay = lm[5].y - wrist.y;
    const az = lm[5].z - wrist.z;
    const bx = lm[17].x - wrist.x;
    const by = lm[17].y - wrist.y;
    const bz = lm[17].z - wrist.z;
    // Right-handed cross product
    const nz = ax * by - ay * bx;
    // For the user's RIGHT hand seen by a selfie camera, palm-toward-camera
    // produces nz > 0; LEFT hand is mirrored. Use a small magnitude gate to
    // avoid noise near edge-on poses.
    const DEAD = 0.004;
    if (Math.abs(nz) < DEAD) return false; // ambiguous → treat as palm-front
    return side === "Right" ? nz < 0 : nz > 0;
  }

  private commitStaticGesture(state: HandState, gesture: GestureKind): GestureKind {
    const dynamic = gesture === "point" || gesture === "click" || gesture === "drag" || gesture === "scroll_up" || gesture === "scroll_down";
    if (dynamic || gesture === "none") {
      state.staticCandidate = gesture;
      state.staticCandidateFrames = 0;
      state.staticCommitted = gesture;
      return gesture;
    }
    if (state.staticCandidate === gesture) state.staticCandidateFrames += 1;
    else {
      state.staticCandidate = gesture;
      state.staticCandidateFrames = 1;
    }
    if (state.staticCandidateFrames >= this.staticFrames) state.staticCommitted = gesture;
    return state.staticCommitted === gesture ? gesture : "none";
  }

  private choosePrimary(frames: HandFrame[]): HandFrame {
    const lock = TelemetryStore.get().handRoleLock;
    const lockedSide: Side | null = lock === "left_pointer" ? "Left" : lock === "right_pointer" ? "Right" : null;
    if (lockedSide) {
      const locked = frames.find((f) => f.side === lockedSide);
      if (locked) return locked;
    }

    const candidates = frames.filter((f) => f.cursorIntent);
    const pool = candidates.length ? candidates : frames;
    return pool.reduce((best, f) => {
      const lastBias = f.side === this.lastPrimary ? 0.22 : 0;
      const bestBias = best.side === this.lastPrimary ? 0.22 : 0;
      const score = f.score + (f.cursorIntent ? 0.6 : 0) + Math.min(0.25, f.state.cursorSpeed * 0.03) + lastBias;
      const bestScore = best.score + (best.cursorIntent ? 0.6 : 0) + Math.min(0.25, best.state.cursorSpeed * 0.03) + bestBias;
      return score > bestScore ? f : best;
    }, pool[0]);
  }

  private chooseAction(frames: HandFrame[], primary: HandFrame): HandFrame | null {
    const actionable = frames.filter((f) => f.actionIntent);
    if (actionable.length === 0) return null;
    const secondary = actionable.find((f) => f.side !== primary.side);
    if (secondary) return secondary;
    return actionable.find((f) => f.side === primary.side) ?? null;
  }

  private createDebug(frames: HandFrame[], primarySide: Side): HandDebugInfo[] {
    return frames.map((f) => {
      let minX = 1, minY = 1, maxX = 0, maxY = 0;
      for (const pt of f.landmarks) {
        minX = Math.min(minX, pt.x);
        minY = Math.min(minY, pt.y);
        maxX = Math.max(maxX, pt.x);
        maxY = Math.max(maxY, pt.y);
      }
      const wrist = f.landmarks[0] ?? { x: 0.5, y: 0.5 };
      return {
        index: f.rawIndex,
        side: f.side,
        confidence: f.score,
        wrist: { x: wrist.x, y: wrist.y },
        bbox: { x: minX, y: minY, w: Math.max(0, maxX - minX), h: Math.max(0, maxY - minY) },
        isPrimary: f.side === primarySide,
      };
    });
  }

  private emitMotion(pointer: HandState, gesture: GestureKind, pressure: number, hand: Side) {
    this.bridge.send({
      event: "motion",
      data: {
        x: pointer.cursor.x,
        y: pointer.cursor.y,
        pressure,
        gesture,
        hand,
      },
      timestamp: Date.now(),
    });
  }

  private draw(result: HandLandmarkerResult | null) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    const camAspect = w / h || 16 / 9;
    let zoneW = 1;
    let zoneH = 1;
    if (this.config.aspectRatio >= camAspect) zoneH = camAspect / this.config.aspectRatio;
    else zoneW = this.config.aspectRatio / camAspect;
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
    const frames = this.resolveHandSides(result);
    const primarySide = this.lastPrimary;
    for (const f of frames) {
      const lm = result.landmarks[f.index];
      const pts = lm.map((p) => ({ x: (1 - p.x) * w, y: p.y * h }));
      const isPrimary = f.side === primarySide;
      const boneColor = isPrimary ? "hsl(160 84% 50%)" : "hsl(160 30% 45%)";
      const jointColor = isPrimary ? "hsl(160 84% 60%)" : "hsl(160 25% 55%)";
      const tipColor = isPrimary ? "white" : "hsl(0 0% 75%)";

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

      ctx.fillStyle = jointColor;
      for (let i = 1; i < pts.length; i++) {
        ctx.beginPath();
        ctx.arc(pts[i].x, pts[i].y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = tipColor;
      for (const i of [4, 8]) {
        ctx.beginPath();
        ctx.arc(pts[i].x, pts[i].y, isPrimary ? 3.5 : 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      const wp = pts[0];
      const r = isPrimary ? 7 : 5;
      ctx.save();
      ctx.translate(wp.x, wp.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = isPrimary ? "hsla(160, 84%, 55%, 0.85)" : "hsla(160, 30%, 55%, 0.6)";
      ctx.strokeStyle = isPrimary ? "white" : "hsl(0 0% 80%)";
      ctx.lineWidth = isPrimary ? 1.5 : 1;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.strokeRect(-r, -r, r * 2, r * 2);
      ctx.restore();
    }

    const primary = (this.lastPrimary && this.hands.get(this.lastPrimary)) || this.hands.values().next().value as HandState | undefined;
    if (!primary) return;
    const curCamX = zx0 + primary.cursor.x * zoneW * w;
    const curCamY = zy0 + primary.cursor.y * zoneH * h;
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

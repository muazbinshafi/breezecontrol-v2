// OmniPoint Telemetry Store - reactive store via useSyncExternalStore
// Avoids re-rendering the canvas loop on metric updates.

export type WSState = "disconnected" | "connecting" | "connected" | "stopped";
export type GestureKind =
  | "none"
  | "point"
  | "click"
  | "right_click"
  | "drag"
  | "scroll_up"
  | "scroll_down"
  | "thumbs_up"
  | "open_palm"
  | "palm_back"
  | "fist"
  | "pinky_only"
  | "four_fingers"
  | "middle_only"
  | "ring_only"
  | "two_finger_point"
  | "three_fingers"
  | "peace"
  | "rock"
  | "phone_call";
export type BridgeProbe = "idle" | "probing" | "ok" | "failed";
export type Handedness = "none" | "Left" | "Right";

/**
 * Hand role lock — when not "auto", the chosen hand is FORCED to drive the
 * cursor while the other hand is reserved for click/drag/scroll actions.
 * This prevents the "stealing control" feel when both hands are active.
 */
export type HandRoleLock = "auto" | "left_pointer" | "right_pointer";

// thumb, index, middle, ring, pinky
export type FingerStates = [boolean, boolean, boolean, boolean, boolean];

// 21 MediaPipe HandLandmarker points, normalized [0..1] in mirrored
// (selfie) camera space. Empty array = no hand.
export type HandLandmarks = { x: number; y: number; z: number }[];

/**
 * Per-hand debug snapshot — one entry per hand MediaPipe detected this frame.
 * Used by the dual-hand debug overlay and the camera setup check to surface
 * raw detection counts, confidences and on-screen positions.
 */
export interface HandDebugInfo {
  /** Raw detection slot index from MediaPipe (0 or 1). */
  index: number;
  /** Resolved (selfie-mirrored) handedness shown to the user. */
  side: "Left" | "Right";
  /** Handedness classifier confidence in [0..1]. */
  confidence: number;
  /** Wrist position in mirrored normalized camera space. */
  wrist: { x: number; y: number };
  /** Hand bounding box in mirrored normalized camera space. */
  bbox: { x: number; y: number; w: number; h: number };
  /** True when this hand drove the OS cursor this frame. */
  isPrimary: boolean;
}

/**
 * Per-hand actionable snapshot — one entry per tracked hand each frame.
 * Lets downstream consumers (BrowserCursor) react to BOTH hands at the
 * same time so each hand is its own independent pointer + clicker.
 */
export interface HandLiveFrame {
  side: "Left" | "Right";
  cursorX: number;
  cursorY: number;
  gesture: GestureKind;
  pressure: number;
  fingersExtended: FingerStates;
  pinchDistance: number;
  isPrimary: boolean;
}

export interface TelemetrySnapshot {
  fps: number;
  inferenceMs: number;
  confidence: number;
  packetsPerSec: number;
  gesture: GestureKind;
  cursorX: number; // 0..1
  cursorY: number; // 0..1
  wsState: WSState;
  bridgeUrl: string;
  emergencyStop: boolean;
  sensorLost: boolean;
  initialized: boolean;
  bridgeProbe: BridgeProbe;
  bridgeValidated: boolean;
  bridgeProbeMsg: string;
  bridgeProbeRttMs: number;
  // detection state for live HUD
  handPresent: boolean;
  handedness: Handedness;
  fingersExtended: FingerStates;
  fingerCount: number;
  pinchDistance: number;
  /** Mirrored, normalized 21-point hand skeleton for live overlay rendering. */
  landmarks: HandLandmarks;
  /** True when the engine has dropped into adaptive precision-mode (hand near-still). */
  precisionMode: boolean;
  /** Last daemon status snapshot — populated after a successful probe. */
  daemon: {
    version?: string;
    os?: string;
    sessionType?: string;
    screen?: { w: number; h: number };
    uinput?: boolean;
    evdev?: boolean;
  } | null;
  /** Number of hands MediaPipe returned this frame (0, 1 or 2). */
  handsDetected: number;
  /** Per-hand debug snapshots, ordered by detection slot. */
  handsDebug: HandDebugInfo[];
  /** Per-hand live frames usable for independent pointer/click routing. */
  hands: HandLiveFrame[];
  /**
   * Bridge connection diagnostic for the UI banner. `code` is one of:
   *  - "ok"             — connected
   *  - "idle"           — not in bridge mode
   *  - "connecting"     — first attempt in flight
   *  - "retrying"       — auto-reconnect scheduled
   *  - "refused"        — daemon not running / port closed
   *  - "timeout"        — opened but no response
   *  - "invalid_url"    — URL malformed
   */
  bridgeError: {
    code: "ok" | "idle" | "connecting" | "retrying" | "refused" | "timeout" | "invalid_url";
    message: string;
    nextRetryMs?: number;
    attempt?: number;
  };
  /** Locked-roles mode: pointer hand vs action hand. */
  handRoleLock: HandRoleLock;
}

const initial: TelemetrySnapshot = {
  fps: 0,
  inferenceMs: 0,
  confidence: 0,
  packetsPerSec: 0,
  gesture: "none",
  cursorX: 0.5,
  cursorY: 0.5,
  wsState: "disconnected",
  bridgeUrl: "ws://localhost:8765",
  emergencyStop: false,
  sensorLost: false,
  initialized: false,
  bridgeProbe: "idle",
  bridgeValidated: false,
  bridgeProbeMsg: "Not tested",
  bridgeProbeRttMs: 0,
  handPresent: false,
  handedness: "none",
  fingersExtended: [false, false, false, false, false],
  fingerCount: 0,
  pinchDistance: 0,
  landmarks: [],
  precisionMode: false,
  daemon: null,
  handsDetected: 0,
  handsDebug: [],
  hands: [],
  bridgeError: { code: "idle", message: "Bridge not active" },
  handRoleLock: "auto",
};

let snapshot: TelemetrySnapshot = { ...initial };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export const TelemetryStore = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  get(): TelemetrySnapshot {
    return snapshot;
  },
  set(patch: Partial<TelemetrySnapshot>) {
    snapshot = { ...snapshot, ...patch };
    emit();
  },
};

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

// thumb, index, middle, ring, pinky
export type FingerStates = [boolean, boolean, boolean, boolean, boolean];

// 21 MediaPipe HandLandmarker points, normalized [0..1] in mirrored
// (selfie) camera space. Empty array = no hand.
export type HandLandmarks = { x: number; y: number; z: number }[];

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

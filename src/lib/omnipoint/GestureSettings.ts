// GestureSettings - user-customizable gesture → action bindings, persisted
// in localStorage. Backed by a tiny reactive store so any UI/cursor layer
// can subscribe via useSyncExternalStore.
//
// We separate "static" gestures (held poses like open_palm, thumbs_up,
// pinky_only, four_fingers, fist) from "dynamic" gestures (point/click/
// right_click/drag/scroll) because static poses benefit from a confirmation
// hold-time to suppress false positives (= higher accuracy).

import type { GestureKind } from "./TelemetryStore";

export type GestureAction =
  | "none"
  | "back"
  | "forward"
  | "undo"
  | "redo"
  | "zoom_in"
  | "zoom_out"
  | "next"
  | "prev"
  | "home"
  | "end"
  | "page_up"
  | "page_down"
  | "tab"
  | "shift_tab"
  | "copy"
  | "paste"
  | "cut"
  | "save"
  | "clear"
  | "crop_selection"
  | "commit_selection"
  | "switch_pointer"
  | "switch_draw"
  | "cursor_off"
  | "play_pause"
  | "fullscreen"
  | "screenshot"
  | "escape"
  | "enter"
  | "space"
  | "emergency_stop";

export type PalmScope = "draw_only" | "pointer_only" | "both";

// Only "configurable" gestures appear in the binding table. Click/drag/
// scroll/point are core pointer behaviors and not remappable.
export type ConfigurableGesture =
  | "open_palm"
  | "palm_back"
  | "thumbs_up"
  | "pinky_only"
  | "four_fingers"
  | "fist"
  | "middle_only"
  | "ring_only"
  | "two_finger_point"
  | "three_fingers"
  | "peace"
  | "rock"
  | "phone_call";

export interface GestureBinding {
  /** What this gesture does in pointer mode */
  pointerAction: GestureAction;
  /** What this gesture does in draw mode */
  drawAction: GestureAction;
  /** Ms the pose must be held before firing (accuracy tuning) */
  holdMs: number;
  /** Ms minimum gap between two firings */
  cooldownMs: number;
  /** Whether this gesture is enabled at all */
  enabled: boolean;
}

export interface GestureSettings {
  /** Per-gesture bindings */
  bindings: Record<ConfigurableGesture, GestureBinding>;
  /** Where open palm "back/undo" should be active */
  palmScope: PalmScope;
  /** Min confidence (0..1) to accept any gesture firing */
  minConfidence: number;
  /** Global multiplier on holdMs — pull down for snappier, up for stricter */
  accuracyBias: number;
  /** Pinch ratio fallback used by draw mode when click/drag briefly flickers */
  drawPinchThreshold: number;
  /** Pixel step emitted for each scroll gesture frame */
  scrollStepPx: number;
  /** Minimum gap between click firings in pointer mode */
  clickCooldownMs: number;
  /** Minimum gap between right-click firings in pointer mode */
  rightClickCooldownMs: number;
  /** Master enable for static-pose shortcuts in pointer mode */
  enablePointerStaticActions: boolean;
  /** Master enable for static-pose shortcuts in draw mode */
  enableDrawStaticActions: boolean;
  /** Show the floating cursor action label */
  showCursorLabels: boolean;
  /** Reverse two-finger scroll direction */
  invertScroll: boolean;
  /**
   * Optional per-profile calibration. When present, activating this profile
   * also pushes these values into the GestureEngine config (sensitivity,
   * smoothing, click thresholds, scroll, aspect, deadZone) so each user can
   * keep distinct calibrations across their devices.
   */
  engineConfig?: {
    sensitivity: number;
    smoothingAlpha: number;
    clickThreshold: number;
    releaseThreshold: number;
    scrollSensitivity: number;
    aspectRatio: number;
    deadZone: number;
  };
}

export const ACTION_LABELS: Record<GestureAction, string> = {
  none: "Do nothing",
  back: "Browser back",
  forward: "Browser forward",
  undo: "Undo (Ctrl+Z)",
  redo: "Redo (Ctrl+Y)",
  zoom_in: "Zoom in",
  zoom_out: "Zoom out",
  next: "Next (→)",
  prev: "Previous (←)",
  home: "Home",
  end: "End",
  page_up: "Page up",
  page_down: "Page down",
  tab: "Tab",
  shift_tab: "Shift + Tab",
  copy: "Copy",
  paste: "Paste",
  cut: "Cut",
  save: "Save / download",
  clear: "Clear canvas",
  crop_selection: "Crop selection",
  commit_selection: "Commit selection",
  switch_pointer: "Switch to pointer",
  switch_draw: "Switch to draw",
  cursor_off: "Cursor off",
  play_pause: "Play / pause",
  fullscreen: "Fullscreen",
  screenshot: "Screenshot",
  escape: "Escape",
  enter: "Enter",
  space: "Space",
  emergency_stop: "Emergency stop",
};

export const GESTURE_LABELS: Record<ConfigurableGesture, string> = {
  open_palm: "Open palm (5 fingers)",
  palm_back: "Back of hand (palm away)",
  thumbs_up: "Thumbs up",
  pinky_only: "Pinky only",
  four_fingers: "Four fingers (no thumb)",
  fist: "Fist",
  middle_only: "Middle finger only",
  ring_only: "Ring finger only",
  two_finger_point: "Two-finger point",
  three_fingers: "Three fingers",
  peace: "Peace / V sign",
  rock: "Rock sign",
  phone_call: "Phone call",
};

export const defaultSettings: GestureSettings = {
  bindings: {
    open_palm: {
      // Palm facing camera = UNDO (per user spec, both modes)
      pointerAction: "undo",
      drawAction: "undo",
      holdMs: 220,
      cooldownMs: 600,
      enabled: true,
    },
    palm_back: {
      // Back of hand = REDO (per user spec, both modes)
      pointerAction: "redo",
      drawAction: "redo",
      holdMs: 220,
      cooldownMs: 600,
      enabled: true,
    },
    thumbs_up: {
      pointerAction: "none",
      drawAction: "none",
      holdMs: 200,
      cooldownMs: 350,
      enabled: false,
    },
    pinky_only: {
      pointerAction: "none",
      drawAction: "none",
      holdMs: 220,
      cooldownMs: 350,
      enabled: false,
    },
    four_fingers: {
      pointerAction: "none",
      drawAction: "none",
      holdMs: 200,
      cooldownMs: 380,
      enabled: false,
    },
    fist: {
      // Fist = grab & move. Handled directly in BrowserCursor (NOT via the
      // action dispatcher), but we keep the binding row enabled so users
      // can see/tweak holdMs/cooldown if needed.
      pointerAction: "none",
      drawAction: "none",
      holdMs: 350,
      cooldownMs: 800,
      enabled: true,
    },
    middle_only: {
      pointerAction: "none",
      drawAction: "none",
      holdMs: 220,
      cooldownMs: 420,
      enabled: false,
    },
    ring_only: {
      pointerAction: "none",
      drawAction: "none",
      holdMs: 260,
      cooldownMs: 520,
      enabled: false,
    },
    two_finger_point: {
      pointerAction: "none",
      drawAction: "none",
      holdMs: 240,
      cooldownMs: 520,
      enabled: false,
    },
    three_fingers: {
      pointerAction: "none",
      drawAction: "none",
      holdMs: 240,
      cooldownMs: 520,
      enabled: false,
    },
    peace: {
      pointerAction: "none",
      drawAction: "none",
      holdMs: 280,
      cooldownMs: 650,
      enabled: false,
    },
    rock: {
      pointerAction: "none",
      drawAction: "none",
      holdMs: 300,
      cooldownMs: 750,
      enabled: false,
    },
    phone_call: {
      pointerAction: "none",
      drawAction: "none",
      holdMs: 260,
      cooldownMs: 650,
      enabled: false,
    },
  },
  palmScope: "both",
  minConfidence: 0.55,
  accuracyBias: 1.0,
  drawPinchThreshold: 0.72,
  scrollStepPx: 60,
  clickCooldownMs: 220,
  rightClickCooldownMs: 320,
  enablePointerStaticActions: true,
  enableDrawStaticActions: true,
  showCursorLabels: true,
  invertScroll: false,
};

const STORAGE_KEY = "omnipoint.gestureSettings.v2";

function load(): GestureSettings {
  if (typeof localStorage === "undefined") return { ...defaultSettings };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultSettings };
    const parsed = JSON.parse(raw) as Partial<GestureSettings>;
    return {
      ...defaultSettings,
      ...parsed,
      bindings: {
        ...defaultSettings.bindings,
        ...(parsed.bindings ?? {}),
      },
    };
  } catch {
    return { ...defaultSettings };
  }
}

function save(s: GestureSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* quota exceeded — ignore */
  }
}

let snapshot: GestureSettings = load();
const listeners = new Set<() => void>();

export const GestureSettingsStore = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  get(): GestureSettings {
    return snapshot;
  },
  patch(p: Partial<GestureSettings>) {
    snapshot = {
      ...snapshot,
      ...p,
      bindings: {
        ...defaultSettings.bindings,
        ...snapshot.bindings,
        ...(p.bindings ?? {}),
      },
    };
    save(snapshot);
    for (const l of listeners) l();
  },
  patchBinding(g: ConfigurableGesture, p: Partial<GestureBinding>) {
    snapshot = {
      ...snapshot,
      bindings: {
        ...snapshot.bindings,
        [g]: { ...snapshot.bindings[g], ...p },
      },
    };
    save(snapshot);
    for (const l of listeners) l();
  },
  reset() {
    snapshot = { ...defaultSettings };
    save(snapshot);
    for (const l of listeners) l();
  },
};

/** Helper used inside BrowserCursor — null if gesture isn't configurable. */
export function isConfigurable(g: GestureKind): g is ConfigurableGesture {
  return (
    g === "open_palm" ||
    g === "palm_back" ||
    g === "thumbs_up" ||
    g === "pinky_only" ||
    g === "four_fingers" ||
    g === "fist" ||
    g === "middle_only" ||
    g === "ring_only" ||
    g === "two_finger_point" ||
    g === "three_fingers" ||
    g === "peace" ||
    g === "rock" ||
    g === "phone_call"
  );
}

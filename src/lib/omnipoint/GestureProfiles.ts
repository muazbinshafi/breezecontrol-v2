// GestureProfiles — named, savable presets of GestureSettings. Each user
// can keep multiple profiles (e.g. "Default", "Presenter", "Drawing") and
// switch between them at any time. Profiles persist in localStorage.

import {
  defaultSettings,
  GestureSettingsStore,
  type GestureSettings,
} from "./GestureSettings";

/**
 * Optional listener invoked whenever the active profile changes and ships
 * an `engineConfig`. Demo wires this to `engine.config = …` so each user's
 * calibration follows them across devices.
 */
type EngineConfigListener = (cfg: NonNullable<GestureSettings["engineConfig"]>) => void;
let engineCfgListener: EngineConfigListener | null = null;
export function onEngineConfigApply(cb: EngineConfigListener | null) {
  engineCfgListener = cb;
}

export interface GestureProfile {
  id: string;
  name: string;
  settings: GestureSettings;
  createdAt: number;
  updatedAt: number;
}

interface Snapshot {
  profiles: GestureProfile[];
  activeId: string | null;
}

const STORAGE_KEY = "omnipoint.gestureProfiles.v1";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function withDefaults(settings: GestureSettings): GestureSettings {
  return {
    ...defaultSettings,
    ...settings,
    bindings: { ...defaultSettings.bindings, ...(settings.bindings ?? {}) },
  };
}

function makeBuiltins(): GestureProfile[] {
  const now = Date.now();
  return [
    {
      id: "builtin-default",
      name: "Default",
      settings: { ...defaultSettings },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "builtin-presenter",
      name: "Presenter",
      settings: {
        ...defaultSettings,
        accuracyBias: 1.3,
        minConfidence: 0.65,
        bindings: {
          ...defaultSettings.bindings,
          four_fingers: {
            ...defaultSettings.bindings.four_fingers,
            pointerAction: "next",
            drawAction: "next",
          },
          open_palm: {
            ...defaultSettings.bindings.open_palm,
            pointerAction: "prev",
            drawAction: "prev",
          },
          thumbs_up: {
            ...defaultSettings.bindings.thumbs_up,
            pointerAction: "enter",
            drawAction: "enter",
          },
        },
      },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "builtin-artist",
      name: "Artist (Draw-first)",
      settings: {
        ...defaultSettings,
        palmScope: "draw_only",
        accuracyBias: 0.85,
        bindings: {
          ...defaultSettings.bindings,
          open_palm: {
            ...defaultSettings.bindings.open_palm,
            drawAction: "undo",
            pointerAction: "none",
          },
          thumbs_up: {
            ...defaultSettings.bindings.thumbs_up,
            drawAction: "redo",
            pointerAction: "none",
          },
          pinky_only: {
            ...defaultSettings.bindings.pinky_only,
            drawAction: "clear",
            pointerAction: "none",
          },
          four_fingers: {
            ...defaultSettings.bindings.four_fingers,
            drawAction: "save",
            pointerAction: "none",
          },
        },
      },
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function load(): Snapshot {
  if (typeof localStorage === "undefined") {
    const profiles = makeBuiltins();
    return { profiles, activeId: profiles[0].id };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const profiles = makeBuiltins();
      return { profiles, activeId: profiles[0].id };
    }
    const parsed = JSON.parse(raw) as Snapshot;
    if (!parsed.profiles?.length) {
      const profiles = makeBuiltins();
      return { profiles, activeId: profiles[0].id };
    }
    return {
      ...parsed,
      profiles: parsed.profiles.map((p) => ({
        ...p,
        settings: withDefaults(p.settings),
      })),
    };
  } catch {
    const profiles = makeBuiltins();
    return { profiles, activeId: profiles[0].id };
  }
}

function persist(s: Snapshot) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota */
  }
}

let state: Snapshot = load();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export const GestureProfileStore = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  get(): Snapshot {
    return state;
  },
  list(): GestureProfile[] {
    return state.profiles;
  },
  active(): GestureProfile | null {
    return state.profiles.find((p) => p.id === state.activeId) ?? null;
  },
  /** Activate a profile by id and push its settings to the live store. */
  activate(id: string) {
    const p = state.profiles.find((x) => x.id === id);
    if (!p) return;
    state = { ...state, activeId: id };
    persist(state);
    GestureSettingsStore.patch(withDefaults(p.settings));
    if (p.settings.engineConfig && engineCfgListener) {
      engineCfgListener(p.settings.engineConfig);
    }
    emit();
  },
  /** Replace the entire snapshot (used by cloud sync). */
  replace(next: { profiles: GestureProfile[]; activeId: string | null }) {
    state = { profiles: next.profiles, activeId: next.activeId };
    persist(state);
    const active = state.profiles.find((p) => p.id === state.activeId);
    if (active) {
      GestureSettingsStore.patch(withDefaults(active.settings));
      if (active.settings.engineConfig && engineCfgListener) {
        engineCfgListener(active.settings.engineConfig);
      }
    }
    emit();
  },
  /** Snapshot the live settings into a new named profile. */
  saveAsNew(name: string): GestureProfile {
    const now = Date.now();
    const p: GestureProfile = {
      id: uid(),
      name: name.trim() || `Profile ${state.profiles.length + 1}`,
      settings: { ...GestureSettingsStore.get() },
      createdAt: now,
      updatedAt: now,
    };
    state = { profiles: [...state.profiles, p], activeId: p.id };
    persist(state);
    emit();
    return p;
  },
  /** Overwrite the active profile with the live settings. */
  saveActive() {
    const active = this.active();
    if (!active) return;
    if (active.id.startsWith("builtin-")) {
      // Don't mutate built-ins; clone instead.
      this.saveAsNew(`${active.name} (custom)`);
      return;
    }
    const updated: GestureProfile = {
      ...active,
      settings: { ...GestureSettingsStore.get() },
      updatedAt: Date.now(),
    };
    state = {
      ...state,
      profiles: state.profiles.map((p) => (p.id === active.id ? updated : p)),
    };
    persist(state);
    emit();
  },
  rename(id: string, name: string) {
    if (id.startsWith("builtin-")) return;
    state = {
      ...state,
      profiles: state.profiles.map((p) =>
        p.id === id ? { ...p, name: name.trim() || p.name, updatedAt: Date.now() } : p,
      ),
    };
    persist(state);
    emit();
  },
  remove(id: string) {
    if (id.startsWith("builtin-")) return;
    const next = state.profiles.filter((p) => p.id !== id);
    const activeId =
      state.activeId === id ? next[0]?.id ?? null : state.activeId;
    state = { profiles: next, activeId };
    persist(state);
    if (activeId) {
      const p = next.find((x) => x.id === activeId);
      if (p) GestureSettingsStore.patch(p.settings);
    }
    emit();
  },
  /** Export profiles as a JSON string for download. */
  exportJson(): string {
    return JSON.stringify(state, null, 2);
  },
  /** Import a previously-exported JSON snapshot (merges by id). */
  importJson(raw: string) {
    try {
      const parsed = JSON.parse(raw) as Snapshot;
      if (!parsed?.profiles?.length) return;
      const map = new Map(state.profiles.map((p) => [p.id, p]));
      for (const p of parsed.profiles) map.set(p.id, p);
      state = { profiles: [...map.values()], activeId: parsed.activeId ?? state.activeId };
      persist(state);
      const active = this.active();
      if (active) GestureSettingsStore.patch(active.settings);
      emit();
    } catch {
      /* ignore malformed */
    }
  },
};

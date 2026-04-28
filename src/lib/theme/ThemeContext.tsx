import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemeMode = "light" | "dark";
export type AccentKey = "violet" | "indigo" | "cyan" | "emerald" | "rose" | "amber";
export type Intensity = "subtle" | "balanced" | "vivid";

export interface AccentPreset {
  key: AccentKey;
  label: string;
  /** HSL triplet (no `hsl()` wrapper) for --primary */
  primary: string;
  /** HSL triplet for --primary-glow / --accent */
  glow: string;
  accent: string;
}

export const ACCENTS: AccentPreset[] = [
  { key: "violet",  label: "Violet",  primary: "252 83% 60%", glow: "270 90% 70%", accent: "199 95% 52%" },
  { key: "indigo",  label: "Indigo",  primary: "224 86% 58%", glow: "210 90% 65%", accent: "199 95% 55%" },
  { key: "cyan",    label: "Cyan",    primary: "190 90% 45%", glow: "175 85% 55%", accent: "210 90% 60%" },
  { key: "emerald", label: "Emerald", primary: "160 78% 40%", glow: "152 75% 50%", accent: "190 85% 50%" },
  { key: "rose",    label: "Rose",    primary: "340 82% 58%", glow: "10 90% 65%",  accent: "270 80% 65%" },
  { key: "amber",   label: "Amber",   primary: "30 95% 55%",  glow: "20 95% 60%",  accent: "340 80% 62%" },
];

const INTENSITY_VALUES: Record<Intensity, { glowAlpha: number; ringAlpha: number; mesh: number }> = {
  subtle:   { glowAlpha: 0.18, ringAlpha: 0.06, mesh: 0.06 },
  balanced: { glowAlpha: 0.32, ringAlpha: 0.10, mesh: 0.10 },
  vivid:    { glowAlpha: 0.55, ringAlpha: 0.18, mesh: 0.18 },
};

interface ThemeState {
  mode: ThemeMode;
  accent: AccentKey;
  intensity: Intensity;
  setMode: (m: ThemeMode) => void;
  toggleMode: () => void;
  setAccent: (a: AccentKey) => void;
  setIntensity: (i: Intensity) => void;
  reset: () => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

const STORAGE_KEY = "omnipoint.theme.v1";

interface Stored {
  mode: ThemeMode;
  accent: AccentKey;
  intensity: Intensity;
}

const DEFAULTS: Stored = { mode: "light", accent: "violet", intensity: "balanced" };

function loadStored(): Stored {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return {
      mode: parsed.mode === "dark" ? "dark" : "light",
      accent: ACCENTS.find((a) => a.key === parsed.accent)?.key ?? DEFAULTS.accent,
      intensity: (["subtle", "balanced", "vivid"] as Intensity[]).includes(parsed.intensity)
        ? parsed.intensity
        : DEFAULTS.intensity,
    };
  } catch {
    return DEFAULTS;
  }
}

function applyTheme({ mode, accent, intensity }: Stored) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
  root.style.colorScheme = mode;

  const preset = ACCENTS.find((a) => a.key === accent) ?? ACCENTS[0];
  const intent = INTENSITY_VALUES[intensity];

  root.style.setProperty("--primary", preset.primary);
  root.style.setProperty("--primary-glow", preset.glow);
  root.style.setProperty("--accent", preset.accent);
  root.style.setProperty("--ring", preset.primary);
  root.style.setProperty("--hud-grid", preset.primary);
  root.style.setProperty("--sidebar-primary", preset.primary);
  root.style.setProperty("--sidebar-ring", preset.primary);

  root.style.setProperty("--glow-alpha", intent.glowAlpha.toString());
  root.style.setProperty("--ring-alpha", intent.ringAlpha.toString());
  root.style.setProperty("--mesh-alpha", intent.mesh.toString());
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Stored>(() => loadStored());

  // Apply on mount and on every change
  useEffect(() => {
    applyTheme(state);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore quota */
    }
  }, [state]);

  const value = useMemo<ThemeState>(
    () => ({
      ...state,
      setMode: (mode) => setState((s) => ({ ...s, mode })),
      toggleMode: () => setState((s) => ({ ...s, mode: s.mode === "dark" ? "light" : "dark" })),
      setAccent: (accent) => setState((s) => ({ ...s, accent })),
      setIntensity: (intensity) => setState((s) => ({ ...s, intensity })),
      reset: () => setState(DEFAULTS),
    }),
    [state],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}

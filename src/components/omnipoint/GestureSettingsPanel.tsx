// GestureSettingsPanel — slide-over sheet that lets users remap gesture
// bindings, tune accuracy, manage profiles, and choose where the open-palm
// shortcut applies.

import { useState } from "react";
import { Settings2, RotateCcw, Save, Plus, Trash2, Download, Upload } from "lucide-react";
import { useGestureSettings } from "@/hooks/useGestureSettings";
import { useGestureProfiles } from "@/hooks/useGestureProfiles";
import { GestureProfileStore } from "@/lib/omnipoint/GestureProfiles";
import {
  GestureSettingsStore,
  ACTION_LABELS,
  GESTURE_LABELS,
  type ConfigurableGesture,
  type GestureAction,
  type PalmScope,
} from "@/lib/omnipoint/GestureSettings";

const ACTIONS: GestureAction[] = [
  "none",
  "back",
  "forward",
  "undo",
  "redo",
  "zoom_in",
  "zoom_out",
  "next",
  "prev",
  "home",
  "end",
  "page_up",
  "page_down",
  "tab",
  "shift_tab",
  "copy",
  "paste",
  "cut",
  "save",
  "clear",
  "crop_selection",
  "commit_selection",
  "switch_pointer",
  "switch_draw",
  "cursor_off",
  "play_pause",
  "fullscreen",
  "screenshot",
  "escape",
  "enter",
  "space",
  "emergency_stop",
];

const GESTURES: ConfigurableGesture[] = [
  "open_palm",
  "palm_back",
  "thumbs_up",
  "pinky_only",
  "four_fingers",
  "fist",
  "middle_only",
  "ring_only",
  "two_finger_point",
  "three_fingers",
  "peace",
  "rock",
  "phone_call",
];

export function GestureSettingsPanel() {
  const [open, setOpen] = useState(false);
  const settings = useGestureSettings();
  const profilesState = useGestureProfiles();
  const activeProfile = profilesState.profiles.find((p) => p.id === profilesState.activeId);

  const handleSaveAs = () => {
    const name = window.prompt("Name this profile:", "My profile");
    if (name === null) return;
    GestureProfileStore.saveAsNew(name);
  };

  const handleExport = () => {
    const blob = new Blob([GestureProfileStore.exportJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `omnipoint-gestures-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      const text = await f.text();
      GestureProfileStore.importJson(text);
    };
    input.click();
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Customize gestures"
        className="font-mono text-[10px] tracking-[0.3em] px-3 h-8 inline-flex items-center gap-1.5 border hairline text-muted-foreground hover:text-foreground bg-card/60 backdrop-blur"
      >
        <Settings2 className="w-3.5 h-3.5" />
        GESTURES
      </button>

      {open && (
        <aside
          // Docked side panel — sits NEXT TO the page instead of overlaying
          // it. No backdrop, no blur, page stays interactive underneath.
          className="fixed top-14 right-0 bottom-0 w-[420px] max-w-[92vw] z-[60] bg-card border-l border-border shadow-2xl overflow-y-auto"
        >
          <div>
            <header className="sticky top-0 z-10 bg-card border-b hairline px-4 h-12 flex items-center justify-between">
              <div className="font-mono text-[11px] tracking-[0.3em] text-emerald-glow">
                ▣ GESTURE CUSTOMIZATION
              </div>
              <button
                onClick={() => setOpen(false)}
                className="font-mono text-[11px] text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </header>

            <section className="p-4 border-b hairline">
              <SectionTitle>PROFILES</SectionTitle>
              <p className="font-mono text-[10px] text-muted-foreground mb-3 leading-relaxed">
                Save your tuning as a named profile and switch instantly.
              </p>
              <div className="grid gap-1.5 mb-3">
                {profilesState.profiles.map((p) => {
                  const isActive = p.id === profilesState.activeId;
                  const isBuiltin = p.id.startsWith("builtin-");
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center gap-2 border h-9 px-2 ${
                        isActive
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      <button
                        onClick={() => GestureProfileStore.activate(p.id)}
                        className="flex-1 text-left font-mono text-[11px] tracking-[0.15em] text-foreground truncate"
                        title={p.name}
                      >
                        {isActive ? "▸ " : "  "}{p.name}
                        {isBuiltin && (
                          <span className="ml-1.5 text-[9px] tracking-[0.2em] text-muted-foreground">
                            BUILT-IN
                          </span>
                        )}
                      </button>
                      {!isBuiltin && (
                        <button
                          onClick={() => {
                            const n = window.prompt("Rename profile:", p.name);
                            if (n) GestureProfileStore.rename(p.id, n);
                          }}
                          title="Rename"
                          className="font-mono text-[10px] text-muted-foreground hover:text-foreground px-1"
                        >
                          ✎
                        </button>
                      )}
                      {!isBuiltin && (
                        <button
                          onClick={() => {
                            if (window.confirm(`Delete "${p.name}"?`)) {
                              GestureProfileStore.remove(p.id);
                            }
                          }}
                          title="Delete"
                          className="text-destructive/70 hover:text-destructive"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => GestureProfileStore.saveActive()}
                  disabled={!activeProfile || activeProfile.id.startsWith("builtin-")}
                  className="h-8 font-mono text-[10px] tracking-[0.25em] border border-border text-foreground hover:border-primary/60 disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
                  title="Overwrite active profile"
                >
                  <Save className="w-3 h-3" /> SAVE
                </button>
                <button
                  onClick={handleSaveAs}
                  className="h-8 font-mono text-[10px] tracking-[0.25em] border border-primary text-primary hover:bg-primary/10 inline-flex items-center justify-center gap-1.5"
                  title="Save current as new profile"
                >
                  <Plus className="w-3 h-3" /> SAVE AS…
                </button>
                <button
                  onClick={handleExport}
                  className="h-8 font-mono text-[10px] tracking-[0.25em] border border-border text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3 h-3" /> EXPORT
                </button>
                <button
                  onClick={handleImport}
                  className="h-8 font-mono text-[10px] tracking-[0.25em] border border-border text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5"
                >
                  <Upload className="w-3 h-3" /> IMPORT
                </button>
              </div>
            </section>

            <section className="p-4 border-b hairline">
              <SectionTitle>OPEN PALM SCOPE</SectionTitle>
              <p className="font-mono text-[10px] text-muted-foreground mb-3 leading-relaxed">
                Choose where the open palm gesture is active. In draw mode it
                triggers UNDO; in pointer mode the default action is now safe and does nothing unless you remap it.
              </p>
              <div className="grid grid-cols-3 gap-1">
                {(["draw_only", "pointer_only", "both"] as PalmScope[]).map((scope) => {
                  const active = settings.palmScope === scope;
                  return (
                    <button
                      key={scope}
                      onClick={() => GestureSettingsStore.patch({ palmScope: scope })}
                      className={`font-mono text-[10px] tracking-[0.2em] h-8 border ${
                        active
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
                      }`}
                    >
                      {scope === "draw_only" ? "DRAW ONLY" : scope === "pointer_only" ? "POINTER ONLY" : "BOTH"}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="p-4 border-b hairline">
              <SectionTitle>ACCURACY TUNING</SectionTitle>
              <Slider
                label="MIN CONFIDENCE"
                hint="Higher = stricter. Reject gestures below this score."
                min={0.3} max={0.95} step={0.05}
                value={settings.minConfidence}
                onChange={(v) => GestureSettingsStore.patch({ minConfidence: v })}
              />
              <Slider
                label="ACCURACY BIAS"
                hint="Multiplier on hold-time. ↑ = stricter / fewer false fires. ↓ = snappier."
                min={0.5} max={2} step={0.05}
                value={settings.accuracyBias}
                onChange={(v) => GestureSettingsStore.patch({ accuracyBias: v })}
              />
              <Slider
                label="DRAW PINCH"
                hint="Lower = stricter pinch to paint. Higher = easier drawing."
                min={0.25} max={0.85} step={0.01}
                value={settings.drawPinchThreshold}
                onChange={(v) => GestureSettingsStore.patch({ drawPinchThreshold: v })}
              />
              <Slider
                label="SCROLL STEP"
                hint="Pixels moved by each scroll gesture pulse."
                min={20} max={160} step={5}
                value={settings.scrollStepPx}
                onChange={(v) => GestureSettingsStore.patch({ scrollStepPx: v })}
              />
              <Slider
                label="CLICK COOLDOWN"
                min={100} max={700} step={10}
                value={settings.clickCooldownMs}
                onChange={(v) => GestureSettingsStore.patch({ clickCooldownMs: v })}
                compact
              />
              <Slider
                label="RIGHT CLICK COOLDOWN"
                min={150} max={900} step={10}
                value={settings.rightClickCooldownMs}
                onChange={(v) => GestureSettingsStore.patch({ rightClickCooldownMs: v })}
                compact
              />
              <div className="grid grid-cols-2 gap-2 mt-3">
                <Toggle label="POINTER POSES" checked={settings.enablePointerStaticActions} onChange={(v) => GestureSettingsStore.patch({ enablePointerStaticActions: v })} />
                <Toggle label="DRAW POSES" checked={settings.enableDrawStaticActions} onChange={(v) => GestureSettingsStore.patch({ enableDrawStaticActions: v })} />
                <Toggle label="CURSOR LABELS" checked={settings.showCursorLabels} onChange={(v) => GestureSettingsStore.patch({ showCursorLabels: v })} />
                <Toggle label="INVERT SCROLL" checked={settings.invertScroll} onChange={(v) => GestureSettingsStore.patch({ invertScroll: v })} />
              </div>
            </section>

            <section className="p-4 border-b hairline">
              <SectionTitle>BINDINGS</SectionTitle>
              <p className="font-mono text-[10px] text-muted-foreground mb-3 leading-relaxed">
                Remap each pose. Hold-time prevents accidental fires.
              </p>
              {GESTURES.map((g) => {
                const b = settings.bindings[g] ?? GestureSettingsStore.get().bindings[g];
                if (!b) return null;
                return (
                  <div
                    key={g}
                    className="border hairline p-3 mb-2 bg-background/40"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-mono text-[11px] tracking-[0.2em] text-foreground">
                        {GESTURE_LABELS[g]}
                      </div>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={b.enabled}
                          onChange={(e) =>
                            GestureSettingsStore.patchBinding(g, { enabled: e.target.checked })
                          }
                          className="accent-primary"
                        />
                        <span className="font-mono text-[9px] tracking-[0.2em] text-muted-foreground">
                          {b.enabled ? "ON" : "OFF"}
                        </span>
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <ActionPicker
                        label="POINTER MODE"
                        value={b.pointerAction}
                        onChange={(v) =>
                          GestureSettingsStore.patchBinding(g, { pointerAction: v })
                        }
                      />
                      <ActionPicker
                        label="DRAW MODE"
                        value={b.drawAction}
                        onChange={(v) =>
                          GestureSettingsStore.patchBinding(g, { drawAction: v })
                        }
                      />
                    </div>

                    <Slider
                      label="HOLD (ms)"
                      min={50} max={800} step={10}
                      value={b.holdMs}
                      onChange={(v) => GestureSettingsStore.patchBinding(g, { holdMs: v })}
                      compact
                    />
                    <Slider
                      label="COOLDOWN (ms)"
                      min={100} max={1500} step={20}
                      value={b.cooldownMs}
                      onChange={(v) => GestureSettingsStore.patchBinding(g, { cooldownMs: v })}
                      compact
                    />
                  </div>
                );
              })}
            </section>

            <section className="p-4">
              <button
                onClick={() => GestureSettingsStore.reset()}
                className="w-full h-9 font-mono text-[10px] tracking-[0.3em] border border-destructive/50 text-destructive hover:bg-destructive/10 inline-flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                RESET TO DEFAULTS
              </button>
            </section>
          </div>
        </aside>
      )}
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[10px] tracking-[0.3em] text-emerald-glow mb-2">
      ▸ {children}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className={`h-8 px-2 border flex items-center justify-between gap-2 cursor-pointer ${
      checked ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
    }`}>
      <span className="font-mono text-[9px] tracking-[0.18em] truncate">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-primary"
      />
    </label>
  );
}

function ActionPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: GestureAction;
  onChange: (v: GestureAction) => void;
}) {
  return (
    <div>
      <div className="font-mono text-[9px] tracking-[0.2em] text-muted-foreground mb-1">
        {label}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as GestureAction)}
        className="w-full h-8 px-2 bg-input border border-border font-mono text-[11px] text-foreground focus:outline-none focus:border-primary"
      >
        {ACTIONS.map((a) => (
          <option key={a} value={a}>
            {ACTION_LABELS[a]}
          </option>
        ))}
      </select>
    </div>
  );
}

function Slider({
  label,
  hint,
  min,
  max,
  step,
  value,
  onChange,
  compact,
}: {
  label: string;
  hint?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "mb-1.5" : "mb-3"}>
      <div className="flex justify-between font-mono text-[10px] tracking-[0.2em] text-muted-foreground">
        <span>{label}</span>
        <span className="text-foreground tabular-nums">
          {step < 1 ? value.toFixed(2) : Math.round(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 mt-1 appearance-none bg-secondary accent-primary cursor-pointer"
      />
      {hint && !compact && (
        <p className="font-mono text-[9px] text-muted-foreground/80 mt-1 leading-relaxed">
          {hint}
        </p>
      )}
    </div>
  );
}

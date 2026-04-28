import { useEffect, useRef, useState } from "react";
import { Settings2, Sun, Moon, RotateCcw, Check, X } from "lucide-react";
import { ACCENTS, useTheme, type AccentKey, type Intensity } from "@/lib/theme/ThemeContext";

interface Props {
  /** Variant for the trigger button */
  variant?: "floating" | "inline";
}

export function ThemeSettings({ variant = "floating" }: Props) {
  const { mode, accent, intensity, setMode, setAccent, setIntensity, toggleMode, reset } = useTheme();
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const triggerClass =
    variant === "floating"
      ? "fixed bottom-5 right-5 z-50 w-12 h-12 rounded-full bg-gradient-primary text-white shadow-lg flex items-center justify-center hover:scale-110 active:scale-95 transition-transform"
      : "inline-flex items-center justify-center w-9 h-9 rounded-lg border border-border hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors";

  return (
    <div ref={popRef} className={variant === "floating" ? "" : "relative"}>
      <button
        type="button"
        aria-label="Theme settings"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={triggerClass}
      >
        <Settings2 className="w-4 h-4" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Theme settings"
          className={
            variant === "floating"
              ? "fixed bottom-20 right-5 z-50 w-[320px] panel-elevated p-5 animate-scale-in origin-bottom-right"
              : "absolute right-0 top-12 z-50 w-[320px] panel-elevated p-5 animate-scale-in origin-top-right"
          }
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="font-display text-base text-foreground">Appearance</div>
              <div className="text-xs text-muted-foreground">Customize without losing the polish.</div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-7 h-7 rounded-md hover:bg-secondary flex items-center justify-center text-muted-foreground"
              aria-label="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Mode */}
          <Section label="Mode">
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-secondary border border-border">
              <ModeBtn active={mode === "light"} onClick={() => setMode("light")} icon={<Sun className="w-3.5 h-3.5" />} label="Light" />
              <ModeBtn active={mode === "dark"} onClick={() => setMode("dark")} icon={<Moon className="w-3.5 h-3.5" />} label="Dark" />
            </div>
          </Section>

          {/* Accent */}
          <Section label="Accent color">
            <div className="grid grid-cols-6 gap-2">
              {ACCENTS.map((a) => (
                <AccentSwatch
                  key={a.key}
                  preset={a.key}
                  primary={a.primary}
                  glow={a.glow}
                  label={a.label}
                  active={accent === a.key}
                  onClick={() => setAccent(a.key)}
                />
              ))}
            </div>
          </Section>

          {/* Intensity */}
          <Section label="Intensity">
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-secondary border border-border">
              {(["subtle", "balanced", "vivid"] as Intensity[]).map((lvl) => (
                <IntensityBtn key={lvl} active={intensity === lvl} onClick={() => setIntensity(lvl)} label={lvl} />
              ))}
            </div>
          </Section>

          {/* Footer */}
          <div className="mt-5 pt-4 border-t border-border flex items-center justify-between">
            <button
              onClick={reset}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Reset to default
            </button>
            <div className="text-[10px] font-mono text-muted-foreground tracking-wider">SAVED · LOCAL</div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Compact inline trigger that ALSO acts as a theme toggle (light/dark) on click,
 * with right-click or long-press to open settings. Use in tight headers. */
export function ThemeToggleQuick() {
  const { mode, toggleMode } = useTheme();
  return (
    <button
      type="button"
      onClick={toggleMode}
      aria-label={`Switch to ${mode === "dark" ? "light" : "dark"} mode`}
      className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-border hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
    >
      {mode === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground mb-2 uppercase">{label}</div>
      {children}
    </div>
  );
}

function ModeBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`h-8 rounded-md text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors ${
        active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function IntensityBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`h-8 rounded-md text-xs font-medium capitalize transition-colors ${
        active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function AccentSwatch({
  preset, primary, glow, label, active, onClick,
}: {
  preset: AccentKey;
  primary: string;
  glow: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={`${label} accent`}
      aria-pressed={active}
      className={`relative aspect-square rounded-lg transition-transform hover:scale-110 active:scale-95 ${
        active ? "ring-2 ring-foreground/80 ring-offset-2 ring-offset-card" : ""
      }`}
      style={{
        background: `linear-gradient(135deg, hsl(${primary}), hsl(${glow}))`,
        boxShadow: active ? `0 6px 16px -4px hsl(${primary} / 0.5)` : `0 2px 6px -2px hsl(${primary} / 0.4)`,
      }}
      data-preset={preset}
    >
      {active && <Check className="w-3.5 h-3.5 text-white absolute inset-0 m-auto drop-shadow" />}
    </button>
  );
}

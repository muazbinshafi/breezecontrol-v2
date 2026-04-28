// DemoTopBar — unified, professionally-laid-out top chrome for the live
// demo. Replaces three previously-overlapping pieces (StatusBar header,
// absolutely-positioned ControlModeBar, and absolute right-side button
// cluster) with a single grid-based app bar.
//
// Layout (desktop):
//   ┌─────────────────────────────────────────────────────────────────┐
//   │ BRAND · status · fps · inf │  mode pills (centered)  │ actions │
//   └─────────────────────────────────────────────────────────────────┘
//
// On small screens the secondary actions collapse into an overflow menu
// and the brand block sheds its non-essential metrics, so the row never
// wraps or overlaps the underlying viewport.

import { Link } from "react-router-dom";
import {
  Activity,
  Crosshair,
  Gauge,
  Hand,
  HelpCircle,
  Home,
  MoreHorizontal,
  SlidersHorizontal,
  Wand2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTelemetry } from "@/hooks/useTelemetry";
import { TelemetryPanel } from "@/components/omnipoint/TelemetryPanel";
import { GestureSettingsPanel } from "@/components/omnipoint/GestureSettingsPanel";
import type { ControlMode } from "@/components/omnipoint/ControlModeBar";
import type { CursorMode } from "@/lib/omnipoint/BrowserCursor";
import type { EngineConfig } from "@/lib/omnipoint/GestureEngine";

interface Props {
  // mode
  controlMode: ControlMode;
  onControlModeChange: (m: ControlMode) => void;
  cursorMode: CursorMode;
  onCursorModeChange: (m: CursorMode) => void;
  onClearDrawing: () => void;

  // emergency
  onEmergencyToggle: () => void;

  // telemetry sheet (on mobile)
  config: EngineConfig;
  setConfig: (patch: Partial<EngineConfig>) => void;
  bridgeUrl: string;
  setBridgeUrl: (u: string) => void;
  onReconnect: () => void;
  onTestBridge: () => void;
  onOpenTroubleshooter: () => void;

  // overflow actions
  onOpenTour: () => void;
  onOpenCalibration: () => void;
  onOpenLivePanel: () => void;
  livePanelOpen: boolean;
}

export function DemoTopBar({
  controlMode,
  onControlModeChange,
  cursorMode,
  onCursorModeChange,
  onClearDrawing,
  onEmergencyToggle,
  config,
  setConfig,
  bridgeUrl,
  setBridgeUrl,
  onReconnect,
  onTestBridge,
  onOpenTroubleshooter,
  onOpenTour,
  onOpenCalibration,
  onOpenLivePanel,
  livePanelOpen,
}: Props) {
  const t = useTelemetry();

  // Composite quality (matches TelemetryQualityBadge logic).
  const fpsScore = Math.min(1, t.fps / 30);
  const confScore = Math.min(1, t.confidence);
  const latScore = Math.max(0, Math.min(1, 1 - t.inferenceMs / 60));
  const score = Math.round(
    (fpsScore * 0.5 + confScore * 0.35 + latScore * 0.15) * 100,
  );
  const tier =
    !t.handPresent && t.initialized
      ? { label: "NO HAND", cls: "text-muted-foreground border-border bg-card/60" }
      : score >= 75
        ? { label: "EXCELLENT", cls: "text-primary border-primary/40 bg-primary/10" }
        : score >= 50
          ? { label: "GOOD", cls: "text-[hsl(var(--warning))] border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/10" }
          : { label: "POOR", cls: "text-destructive border-destructive/40 bg-destructive/10" };

  const ledColor =
    t.wsState === "connected"
      ? "text-primary"
      : t.wsState === "connecting"
        ? "text-[hsl(var(--warning))]"
        : t.wsState === "stopped"
          ? "text-destructive"
          : "text-muted-foreground";

  const ledLabel =
    t.wsState === "connected"
      ? "BRIDGE ONLINE"
      : t.wsState === "connecting"
        ? "LINKING..."
        : t.wsState === "stopped"
          ? "HALTED"
          : "BRIDGE OFFLINE";

  const live = t.initialized && t.handPresent;

  return (
    <header className="relative z-40 border-b hairline bg-card/70 backdrop-blur-md">
      {/* ROW 1 — brand · quality · emergency */}
      <div className="grid grid-cols-[1fr_auto] gap-2 px-3 sm:px-4 h-12 items-center">
        {/* LEFT: brand + status + (md+) fps/inf */}
        <div className="flex items-center gap-3 sm:gap-5 min-w-0">
          <Link to="/" className="flex items-center gap-2 shrink-0" aria-label="BreezeControl home">
            <div className="w-7 h-7 rounded-md bg-gradient-primary grid place-items-center">
              <Hand className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
            </div>
            <span className="hidden sm:inline font-mono text-[11px] tracking-[0.25em] text-emerald-glow">
              BREEZE // HCI
            </span>
          </Link>

          <span className="hidden sm:flex items-center gap-2 font-mono text-[11px]">
            <span className={`w-2 h-2 rounded-full bg-current led ${ledColor}`} />
            <span className={ledColor}>{ledLabel}</span>
          </span>

          <span className="hidden md:inline font-mono text-[11px] text-muted-foreground">
            FPS <span className="text-foreground tabular-nums">{t.fps.toString().padStart(2, "0")}</span>
          </span>
          <span className="hidden md:inline font-mono text-[11px] text-muted-foreground">
            INF <span className="text-foreground tabular-nums">{t.inferenceMs.toFixed(1)}ms</span>
          </span>

          {/* Quality badge (sm+) — sits inline, not overlapping */}
          <div
            className={`hidden sm:inline-flex items-center gap-2 px-2.5 h-8 border font-mono text-[10px] tracking-[0.25em] rounded-md ${tier.cls}`}
            title={`Quality ${score}/100 · ${t.fps} FPS · ${(t.confidence * 100).toFixed(0)}% conf · ${t.inferenceMs.toFixed(1)}ms infer`}
          >
            {t.handPresent ? (
              <Activity className="w-3.5 h-3.5" />
            ) : (
              <WifiOff className="w-3.5 h-3.5" />
            )}
            <span>{tier.label}</span>
            <span className="text-foreground/80 tabular-nums">{score}</span>
            {t.precisionMode && t.handPresent && (
              <span
                className="hidden lg:inline-flex items-center gap-1 ml-1 pl-2 border-l border-current/30 text-primary"
                title="Precision mode active"
              >
                <Crosshair className="w-3 h-3" />
                <span className="tracking-[0.3em]">PRECISION</span>
              </span>
            )}
            <span className="hidden lg:inline-flex items-center gap-1.5 ml-1 pl-2 border-l border-current/30 opacity-80">
              <Wifi className="w-3 h-3 opacity-60" />
              <span className="tabular-nums">{(t.confidence * 100).toFixed(0)}%</span>
            </span>
          </div>
        </div>

        {/* RIGHT: emergency stop (always visible, prominent) */}
        <button
          onClick={onEmergencyToggle}
          className={`font-mono text-[11px] tracking-[0.2em] px-3 sm:px-4 h-9 border rounded-md transition-colors ${
            t.emergencyStop
              ? "border-destructive/60 bg-destructive/10 text-destructive hover:bg-destructive/20"
              : "border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90"
          } led`}
          style={{
            boxShadow: t.emergencyStop ? "none" : "0 0 18px hsl(var(--destructive) / 0.55)",
          }}
        >
          <span className="sm:hidden">{t.emergencyStop ? "● REARM" : "■ STOP"}</span>
          <span className="hidden sm:inline">
            {t.emergencyStop ? "● REARM SYSTEM" : "■ EMERGENCY STOP"}
          </span>
        </button>
      </div>

      {/* ROW 2 — control mode pills (left) · utility actions (right) */}
      <div className="flex items-center justify-between gap-2 px-3 sm:px-4 h-11 border-t hairline bg-background/40">
        {/* Mode pills — wrap-safe, no absolute positioning */}
        <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto scrollbar-none">
          <Pill
            active={controlMode === "browser"}
            onClick={() => onControlModeChange("browser")}
            title="Control elements on this page only — no install required"
          >
            🌐 BROWSER
          </Pill>
          <Pill
            active={controlMode === "bridge"}
            onClick={() => onControlModeChange("bridge")}
            title="Control your real OS cursor via the local Python bridge"
          >
            🖥 BRIDGE
          </Pill>

          {/* Cursor mode pills are available in BOTH control modes:
              - browser: drives the in-page virtual cursor
              - bridge:  optional in-page draw overlay on top of OS control */}
          <Divider />
          <Pill active={cursorMode === "pointer"} onClick={() => onCursorModeChange("pointer")}>
            POINTER
          </Pill>
          <Pill
            active={cursorMode === "draw"}
            onClick={() => onCursorModeChange("draw")}
            title={
              controlMode === "bridge"
                ? "Draw an overlay on this page (bridge still controls the OS cursor)"
                : "Draw on this page using your hand"
            }
          >
            DRAW
          </Pill>
          <Pill active={cursorMode === "off"} onClick={() => onCursorModeChange("off")}>
            OFF
          </Pill>
          {cursorMode === "draw" && (
            <button
              onClick={onClearDrawing}
              className="font-mono text-[10px] tracking-[0.2em] px-2.5 h-7 border hairline text-muted-foreground hover:text-foreground rounded-md"
            >
              ✕ CLEAR
            </button>
          )}

          <Divider />
          <span
            className={`font-mono text-[10px] tracking-[0.2em] whitespace-nowrap ${
              live ? "text-emerald-glow" : "text-muted-foreground"
            }`}
          >
            {live ? "● LIVE" : "○ IDLE"}
          </span>
        </div>

        {/* Utility actions — collapse to overflow on small screens */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Mobile telemetry sheet trigger */}
          <Sheet>
            <SheetTrigger asChild>
              <button
                className="lg:hidden font-mono text-[10px] tracking-[0.3em] px-2.5 h-8 inline-flex items-center gap-1.5 border hairline text-muted-foreground hover:text-foreground rounded-md"
                aria-label="Open telemetry panel"
              >
                <Gauge className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">TELEMETRY</span>
              </button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-[92vw] sm:w-[420px] p-0 overflow-y-auto bg-card"
            >
              <TelemetryPanel
                config={config}
                setConfig={setConfig}
                bridgeUrl={bridgeUrl}
                setBridgeUrl={setBridgeUrl}
                onReconnect={onReconnect}
                onTestBridge={onTestBridge}
                onOpenTroubleshooter={onOpenTroubleshooter}
              />
            </SheetContent>
          </Sheet>

          {/* Desktop: full action row */}
          <div className="hidden md:flex items-center gap-1.5">
            <GestureSettingsPanel />
            <ToolbarButton onClick={onOpenTour} icon={<HelpCircle className="w-3.5 h-3.5" />}>
              GUIDE
            </ToolbarButton>
            <ToolbarButton
              onClick={onOpenCalibration}
              icon={<Wand2 className="w-3.5 h-3.5" />}
            >
              CALIBRATE
            </ToolbarButton>
            <ToolbarButton
              onClick={onOpenLivePanel}
              icon={<SlidersHorizontal className="w-3.5 h-3.5" />}
              active={livePanelOpen}
            >
              TUNE
            </ToolbarButton>
            <Link
              to="/"
              className="font-mono text-[10px] tracking-[0.3em] px-3 h-8 inline-flex items-center gap-1.5 border hairline text-muted-foreground hover:text-foreground bg-card/60 rounded-md"
            >
              <Home className="w-3.5 h-3.5" />
              HOME
            </Link>
          </div>

          {/* Mobile/tablet: overflow menu */}
          <div className="md:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="font-mono text-[10px] tracking-[0.3em] px-2.5 h-8 inline-flex items-center gap-1.5 border hairline text-muted-foreground hover:text-foreground rounded-md"
                  aria-label="More actions"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground">
                  ACTIONS
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onOpenTour}>
                  <HelpCircle className="w-4 h-4 mr-2" /> Gesture guide
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onOpenCalibration}>
                  <Wand2 className="w-4 h-4 mr-2" /> Calibrate
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onOpenLivePanel}>
                  <SlidersHorizontal className="w-4 h-4 mr-2" /> Tune & diagnostics
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/">
                    <Home className="w-4 h-4 mr-2" /> Home
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  );
}

function Pill({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`font-mono text-[10px] tracking-[0.2em] px-3 h-7 border rounded-md transition-colors whitespace-nowrap ${
        active
          ? "border-primary text-primary bg-primary/10"
          : "hairline text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="w-px h-5 bg-border shrink-0" />;
}

function ToolbarButton({
  onClick,
  icon,
  children,
  active,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`font-mono text-[10px] tracking-[0.3em] px-3 h-8 inline-flex items-center gap-1.5 border rounded-md ${
        active
          ? "border-primary text-primary bg-primary/10"
          : "hairline text-muted-foreground hover:text-foreground bg-card/60"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

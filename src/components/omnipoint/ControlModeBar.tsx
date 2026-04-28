// ControlMode toggle + browser-cursor controls. Floats top-center on the
// Demo page so the operator can switch between BRIDGE (OS cursor via local
// daemon) and BROWSER (in-page virtual cursor) modes without leaving demo.

import { useTelemetry } from "@/hooks/useTelemetry";
import type { CursorMode } from "@/lib/omnipoint/BrowserCursor";

export type ControlMode = "browser" | "bridge";

interface Props {
  controlMode: ControlMode;
  onControlModeChange: (m: ControlMode) => void;
  cursorMode: CursorMode;
  onCursorModeChange: (m: CursorMode) => void;
  onClearDrawing: () => void;
}

export function ControlModeBar({
  controlMode,
  onControlModeChange,
  cursorMode,
  onCursorModeChange,
  onClearDrawing,
}: Props) {
  const t = useTelemetry();
  const live = t.initialized && t.handPresent;
  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 sm:gap-2 panel px-1.5 sm:px-2 py-1 sm:py-1.5 backdrop-blur max-w-[calc(100vw-1rem)] flex-wrap justify-center">
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

      {controlMode === "browser" && (
        <>
          <Divider />
          <Pill
            active={cursorMode === "pointer"}
            onClick={() => onCursorModeChange("pointer")}
          >
            POINTER
          </Pill>
          <Pill
            active={cursorMode === "draw"}
            onClick={() => onCursorModeChange("draw")}
          >
            DRAW
          </Pill>
          <Pill
            active={cursorMode === "off"}
            onClick={() => onCursorModeChange("off")}
          >
            OFF
          </Pill>
          {cursorMode === "draw" && (
            <button
              onClick={onClearDrawing}
              className="font-mono text-[10px] tracking-[0.2em] px-2.5 h-9 sm:h-7 border hairline text-muted-foreground hover:text-foreground active:bg-muted/40 touch-manipulation"
            >
              ✕ CLEAR
            </button>
          )}
        </>
      )}

      <Divider />
      <span className={`font-mono text-[10px] tracking-[0.2em] ${live ? "text-emerald-glow" : "text-muted-foreground"}`}>
        {live ? "● LIVE" : "○ IDLE"}
      </span>
    </div>
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
      className={`font-mono text-[10px] tracking-[0.2em] px-3 h-9 sm:px-2.5 sm:h-7 border transition-colors touch-manipulation active:scale-95 ${
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
  return <span className="w-px h-5 bg-border" />;
}

import { useTelemetry } from "@/hooks/useTelemetry";

interface Props {
  onEmergencyToggle: () => void;
}

export function StatusBar({ onEmergencyToggle }: Props) {
  const t = useTelemetry();
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

  return (
    <header className="flex items-center justify-between border-b hairline px-4 h-12 bg-card/60 backdrop-blur">
      <div className="flex items-center gap-6">
        <div className="font-mono text-xs tracking-[0.25em] text-emerald-glow">
          OMNIPOINT // HCI v1.0
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span className={`w-2 h-2 rounded-full bg-current led ${ledColor}`} />
          <span className={ledColor}>{ledLabel}</span>
        </div>
        <div className="font-mono text-[11px] text-muted-foreground">
          FPS <span className="text-foreground">{t.fps.toString().padStart(2, "0")}</span>
        </div>
        <div className="font-mono text-[11px] text-muted-foreground">
          INF <span className="text-foreground">{t.inferenceMs.toFixed(1)}ms</span>
        </div>
        {t.daemon && (
          <div
            className="hidden md:flex items-center gap-2 font-mono text-[11px] text-muted-foreground"
            title={
              `Bridge daemon v${t.daemon.version ?? "?"}` +
              (t.daemon.os ? ` · ${t.daemon.os}/${t.daemon.sessionType ?? "?"}` : "") +
              (t.daemon.screen ? ` · screen ${t.daemon.screen.w}×${t.daemon.screen.h}` : "")
            }
          >
            <span className="text-emerald-glow">DMN</span>
            <span className="text-foreground">v{t.daemon.version ?? "?"}</span>
            {t.daemon.screen && (
              <span>
                {t.daemon.screen.w}×{t.daemon.screen.h}
              </span>
            )}
            {t.daemon.os && (
              <span className="uppercase tracking-[0.15em]">{t.daemon.os}</span>
            )}
          </div>
        )}
      </div>
      <button
        onClick={onEmergencyToggle}
        className={`font-mono text-xs tracking-[0.2em] px-4 h-9 border ${
          t.emergencyStop
            ? "border-destructive/60 bg-destructive/10 text-destructive hover:bg-destructive/20"
            : "border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90"
        } led`}
        style={{ boxShadow: t.emergencyStop ? "none" : "0 0 18px hsl(var(--destructive) / 0.6)" }}
      >
        {t.emergencyStop ? "● REARM SYSTEM" : "■ EMERGENCY STOP"}
      </button>
    </header>
  );
}

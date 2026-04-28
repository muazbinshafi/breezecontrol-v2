import { useTelemetry } from "@/hooks/useTelemetry";
import type { EngineConfig } from "@/lib/omnipoint/GestureEngine";
import { BridgeLogPanel } from "@/components/omnipoint/BridgeLogPanel";

interface Props {
  config: EngineConfig;
  setConfig: (patch: Partial<EngineConfig>) => void;
  bridgeUrl: string;
  setBridgeUrl: (url: string) => void;
  onReconnect: () => void;
  onTestBridge: () => void;
  onOpenTroubleshooter: () => void;
}

export function TelemetryPanel({ config, setConfig, bridgeUrl, setBridgeUrl, onReconnect, onTestBridge, onOpenTroubleshooter }: Props) {
  const t = useTelemetry();
  const probe = t.bridgeProbe;
  const probeColor =
    probe === "ok" ? "text-emerald-glow border-primary/60"
    : probe === "failed" ? "text-destructive border-destructive/60"
    : probe === "probing" ? "text-foreground border-border animate-pulse"
    : "text-muted-foreground border-border";
  const probeDot =
    probe === "ok" ? "bg-primary"
    : probe === "failed" ? "bg-destructive"
    : probe === "probing" ? "bg-yellow-400 animate-pulse"
    : "bg-muted-foreground/50";
  return (
    <aside className="flex flex-col panel w-[360px] shrink-0 overflow-y-auto">
      <div className="flex items-center justify-between border-b hairline px-3 h-9">
        <div className="font-mono text-[11px] tracking-[0.25em] text-emerald-glow">
          TELEMETRY // CTRL
        </div>
        <div className="font-mono text-[10px] text-muted-foreground">v1.0</div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-border">
        <Metric label="LATENCY" value={`${t.inferenceMs.toFixed(1)} ms`} />
        <Metric label="CONFIDENCE" value={t.confidence.toFixed(2)} />
        <Metric label="PACKETS/SEC" value={t.packetsPerSec.toString()} />
        <Metric label="FPS" value={t.fps.toString()} />
        <Metric label="GESTURE" value={t.gesture.toUpperCase()} accent />
        <Metric label="WS" value={t.wsState.toUpperCase()} />
      </div>

      <div className="p-3 border-b hairline">
        <SectionTitle>CONFIGURATION</SectionTitle>
        <Slider
          label="SENSITIVITY"
          min={0.5} max={5} step={0.05}
          value={config.sensitivity}
          onChange={(v) => setConfig({ sensitivity: v })}
        />
        <Slider
          label="SMOOTHNESS (1€ cutoff)"
          min={0.3} max={4} step={0.05}
          value={config.smoothingAlpha}
          onChange={(v) => setConfig({ smoothingAlpha: v })}
        />
        <p className="font-mono text-[9px] text-muted-foreground/70 -mt-2 mb-2 leading-snug">
          Lower = silky smooth (more lag). Higher = snappy (more jitter). 1.2 is balanced.
        </p>
        <Slider
          label="CLICK THRESHOLD"
          min={0.20} max={0.80} step={0.01}
          value={config.clickThreshold}
          onChange={(v) => setConfig({
            clickThreshold: v,
            releaseThreshold: Math.max(v + 0.08, config.releaseThreshold),
          })}
        />
        <Slider
          label="SCROLL SENSITIVITY"
          min={1} max={50} step={1}
          value={config.scrollSensitivity}
          onChange={(v) => setConfig({ scrollSensitivity: v })}
        />

        <div className="mt-3">
          <div className="font-mono text-[10px] text-muted-foreground mb-1.5 tracking-[0.2em]">ACTIVE ZONE ASPECT</div>
          <div className="grid grid-cols-3 gap-1">
            {[
              { label: "16:9", v: 16 / 9 },
              { label: "16:10", v: 16 / 10 },
              { label: "21:9", v: 21 / 9 },
            ].map((opt) => {
              const active = Math.abs(config.aspectRatio - opt.v) < 0.001;
              return (
                <button
                  key={opt.label}
                  onClick={() => setConfig({ aspectRatio: opt.v })}
                  className={`font-mono text-[11px] h-7 border ${
                    active
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="p-3 border-b hairline">
        <SectionTitle>HID BRIDGE</SectionTitle>
        <label className="font-mono text-[10px] text-muted-foreground tracking-[0.2em]">ENDPOINT</label>
        <input
          value={bridgeUrl}
          onChange={(e) => setBridgeUrl(e.target.value)}
          spellCheck={false}
          className="w-full mt-1 h-8 px-2 bg-input border border-border font-mono text-[12px] text-foreground focus:outline-none focus:border-primary"
        />
        <div className="mt-2 grid grid-cols-2 gap-1">
          <button
            onClick={onTestBridge}
            disabled={probe === "probing"}
            className={`h-8 font-mono text-[11px] tracking-[0.2em] border ${probeColor} hover:bg-primary/10 disabled:opacity-60 disabled:cursor-wait`}
          >
            {probe === "probing" ? "◌ TESTING…" : "◉ TEST BRIDGE"}
          </button>
          <button
            onClick={onReconnect}
            className="h-8 font-mono text-[11px] tracking-[0.2em] border border-primary/60 text-primary hover:bg-primary/10"
          >
            ⟳ RECONNECT
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2 px-2 h-7 border hairline bg-card/60">
          <span className={`inline-block w-2 h-2 rounded-full ${probeDot}`} />
          <span className="font-mono text-[10px] text-muted-foreground tracking-[0.2em]">STATUS</span>
          <span className="ml-auto font-mono text-[10px] text-foreground truncate" title={t.bridgeProbeMsg}>
            {t.bridgeProbeMsg}{t.bridgeProbeRttMs ? ` · ${t.bridgeProbeRttMs}ms` : ""}
          </span>
        </div>
        {!t.bridgeValidated && (
          <div className="mt-2 p-2 border border-destructive/50 bg-destructive/10">
            <p className="font-mono text-[10px] leading-relaxed text-destructive">
              ⚠ OS cursor control is OFF. Camera tracking runs, but no mouse events are sent.
            </p>
            <button
              onClick={onOpenTroubleshooter}
              className="mt-2 w-full h-7 font-mono text-[10px] tracking-[0.25em] border border-destructive/60 text-destructive hover:bg-destructive/20"
            >
              ⚙ OPEN TROUBLESHOOTER
            </button>
          </div>
        )}
        <p className="mt-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
          Run <span className="text-foreground">bridge/omnipoint_bridge.py</span> on your local machine to enable system-wide cursor control.
        </p>
      </div>

      <div className="p-3 border-b hairline">
        <SectionTitle>CONNECTION LOG</SectionTitle>
        <BridgeLogPanel height="max-h-48" />
      </div>

      <div className="p-3 mt-auto">
        <SectionTitle>GESTURE GUIDE</SectionTitle>
        <ul className="font-mono text-[10px] text-muted-foreground space-y-1 leading-relaxed">
          <li><span className="text-primary">▸</span> INDEX ONLY — point / hover</li>
          <li><span className="text-primary">▸</span> THUMB+INDEX PINCH — left click</li>
          <li><span className="text-primary">▸</span> THUMB+INDEX+MIDDLE — right click</li>
          <li><span className="text-primary">▸</span> SUSTAINED PINCH — drag</li>
          <li><span className="text-primary">▸</span> INDEX+MIDDLE UP/DOWN — scroll</li>
          <li><span className="text-primary">▸</span> THUMBS UP — confirm</li>
          <li><span className="text-primary">▸</span> OPEN PALM — idle / park</li>
          <li><span className="text-destructive">▸</span> FIST — emergency stop</li>
        </ul>
      </div>
    </aside>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[10px] tracking-[0.3em] text-emerald-glow mb-2">
      ▣ {children}
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-card p-2.5">
      <div className="font-mono text-[9px] tracking-[0.25em] text-muted-foreground">{label}</div>
      <div className={`font-mono text-base ${accent ? "text-emerald-glow" : "text-foreground"} mt-0.5 tabular-nums`}>
        {value}
      </div>
    </div>
  );
}

function Slider({ label, min, max, step, value, onChange }: {
  label: string; min: number; max: number; step: number;
  value: number; onChange: (v: number) => void;
}) {
  return (
    <div className="mb-2.5">
      <div className="flex justify-between font-mono text-[10px] tracking-[0.2em] text-muted-foreground">
        <span>{label}</span>
        <span className="text-foreground tabular-nums">{value.toFixed(step < 0.01 ? 3 : 2)}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 mt-1.5 appearance-none bg-secondary accent-primary cursor-pointer"
      />
    </div>
  );
}

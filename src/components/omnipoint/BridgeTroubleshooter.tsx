import { useEffect, useState } from "react";
import { useTelemetry } from "@/hooks/useTelemetry";
import { TelemetryStore } from "@/lib/omnipoint/TelemetryStore";
import { HIDBridge, type DaemonStatus, type PortDiagnostics } from "@/lib/omnipoint/HIDBridge";
import { BridgeLog } from "@/lib/omnipoint/BridgeLog";
import { BridgeLogPanel } from "@/components/omnipoint/BridgeLogPanel";

interface Props {
  open: boolean;
  onClose: () => void;
  bridgeUrl: string;
  setBridgeUrl?: (url: string) => void;
  onTestBridge: () => Promise<void> | void;
}

type CheckId = "secure" | "url" | "ws" | "port" | "probe" | "daemon" | "wayland";
type CheckState = "pending" | "running" | "pass" | "fail" | "warn" | "skip";

interface Check {
  id: CheckId;
  label: string;
  state: CheckState;
  detail: string;
}

interface Compositor {
  os: "linux" | "mac" | "windows" | "other";
  // Best-effort browser-side hint; the daemon's /status is authoritative for Linux.
  likelyWayland: boolean;
}

function detectEnv(): Compositor {
  if (typeof navigator === "undefined") return { os: "other", likelyWayland: false };
  const ua = navigator.userAgent.toLowerCase();
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform?.toLowerCase() ?? "";
  let os: Compositor["os"] = "other";
  if (ua.includes("linux") && !ua.includes("android")) os = "linux";
  else if (ua.includes("mac") || platform.includes("mac")) os = "mac";
  else if (ua.includes("win") || platform.includes("win")) os = "windows";
  // Browsers don't expose compositor; we can only hint based on Firefox MOZ_ENABLE_WAYLAND etc.
  // Default to "likely wayland" on modern Linux distros — the daemon /status will confirm.
  return { os, likelyWayland: os === "linux" };
}

export function BridgeTroubleshooter({ open, onClose, bridgeUrl, setBridgeUrl, onTestBridge }: Props) {
  const t = useTelemetry();
  const [checks, setChecks] = useState<Check[]>([]);
  const [running, setRunning] = useState(false);
  const [portInfo, setPortInfo] = useState<PortDiagnostics | null>(null);
  const [daemonInfo, setDaemonInfo] = useState<DaemonStatus | null>(null);
  const env = detectEnv();
  const wayland = daemonInfo?.raw && typeof daemonInfo.raw === "object"
    ? Boolean((daemonInfo.raw as { wayland?: boolean }).wayland)
    : env.likelyWayland;

  const runDiagnostics = async () => {
    setRunning(true);
    setPortInfo(null);
    setDaemonInfo(null);
    BridgeLog.push("info", "system", "Diagnostics run started");

    const results: Check[] = [
      { id: "secure",  label: "Secure context",      state: "running", detail: "" },
      { id: "url",     label: "Endpoint URL",        state: "pending", detail: "" },
      { id: "ws",      label: "WebSocket support",   state: "pending", detail: "" },
      { id: "port",    label: "Port reachability",   state: "pending", detail: "" },
      { id: "probe",   label: "Bridge handshake",    state: "pending", detail: "" },
      { id: "daemon",  label: "Daemon status",       state: "pending", detail: "" },
      { id: "wayland", label: "Compositor / input",  state: "pending", detail: "" },
    ];
    setChecks([...results]);

    // 1. Secure context
    const isLocal = /^wss?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(bridgeUrl);
    if (typeof window !== "undefined" && !window.isSecureContext && !isLocal) {
      results[0] = { ...results[0], state: "warn", detail: "Insecure context — browsers may block ws:// from https pages" };
    } else {
      results[0] = { ...results[0], state: "pass", detail: isLocal ? "Loopback bridge — secure context not required" : "OK" };
    }
    setChecks([...results]);

    // 2. URL parse
    results[1] = { ...results[1], state: "running" };
    setChecks([...results]);
    let parsed: URL | null = null;
    try {
      parsed = new URL(bridgeUrl);
      if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
        results[1] = { ...results[1], state: "fail", detail: `Protocol ${parsed.protocol} — must be ws:// or wss://` };
      } else {
        results[1] = { ...results[1], state: "pass", detail: `${parsed.protocol}//${parsed.host}` };
      }
    } catch {
      results[1] = { ...results[1], state: "fail", detail: "Invalid URL format" };
    }
    setChecks([...results]);

    // 3. WS available
    results[2] = { ...results[2], state: "running" };
    setChecks([...results]);
    if (typeof WebSocket === "undefined") {
      results[2] = { ...results[2], state: "fail", detail: "WebSocket API missing in this browser" };
    } else {
      results[2] = { ...results[2], state: "pass", detail: "Available" };
    }
    setChecks([...results]);

    // 4. Port reachability
    results[3] = { ...results[3], state: "running", detail: "Probing host:port…" };
    setChecks([...results]);
    let port: PortDiagnostics | null = null;
    if (parsed && results[1].state === "pass") {
      const probeBridge = new HIDBridge(bridgeUrl);
      port = await probeBridge.checkPort();
      setPortInfo(port);
      if (port.reachable) {
        results[3] = { ...results[3], state: "pass", detail: port.message };
      } else {
        results[3] = { ...results[3], state: "fail", detail: port.message };
      }
    } else {
      results[3] = { ...results[3], state: "skip", detail: "Skipped — fix URL first" };
    }
    setChecks([...results]);

    // 5. Probe (handshake)
    results[4] = { ...results[4], state: "running", detail: "Handshake…" };
    setChecks([...results]);
    if (port?.reachable) {
      await onTestBridge();
      const snap = TelemetryStore.get();
      if (snap.bridgeProbe === "ok") {
        results[4] = { ...results[4], state: "pass", detail: `${snap.bridgeProbeMsg} · ${snap.bridgeProbeRttMs}ms` };
      } else {
        results[4] = { ...results[4], state: "fail", detail: snap.bridgeProbeMsg };
      }
    } else {
      results[4] = { ...results[4], state: "skip", detail: "Skipped — port unreachable" };
    }
    setChecks([...results]);

    // 6. Daemon status
    results[5] = { ...results[5], state: "running", detail: "Querying daemon…" };
    setChecks([...results]);
    if (port?.reachable) {
      const probeBridge = new HIDBridge(bridgeUrl);
      const status = await probeBridge.fetchDaemonStatus();
      setDaemonInfo(status);
      if (status.ok) {
        results[5] = {
          ...results[5],
          state: "pass",
          detail: `v${status.version ?? "?"} · screen ${status.screen?.w ?? "?"}×${status.screen?.h ?? "?"}`,
        };
      } else if (status.uinput === false) {
        results[5] = {
          ...results[5],
          state: "fail",
          detail: "/dev/uinput not writable — fix permissions below",
        };
      } else {
        results[5] = {
          ...results[5],
          state: "warn",
          detail: status.message || "Daemon did not respond to status query",
        };
      }
    } else {
      results[5] = { ...results[5], state: "skip", detail: "Skipped — port unreachable" };
    }
    setChecks([...results]);

    // 7. Wayland / compositor
    results[6] = { ...results[6], state: "running" };
    setChecks([...results]);
    if (env.os !== "linux") {
      results[6] = { ...results[6], state: "warn", detail: `Detected ${env.os.toUpperCase()} — bundled bridge targets Linux` };
    } else if (daemonInfo) {
      const raw = (daemonInfo.raw ?? {}) as { session_type?: string; wayland?: boolean; x11?: boolean };
      results[6] = {
        ...results[6],
        state: "pass",
        detail: `${(raw.session_type ?? "unknown").toUpperCase()} session · ${raw.wayland ? "Wayland" : "X11"} input ok`,
      };
    } else {
      results[6] = { ...results[6], state: "warn", detail: "Cannot read compositor without daemon status" };
    }
    setChecks([...results]);

    BridgeLog.push("info", "system", "Diagnostics run complete");
    setRunning(false);
  };

  useEffect(() => {
    if (open) runDiagnostics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const dotFor = (s: CheckState) => {
    switch (s) {
      case "pass": return "bg-primary shadow-[0_0_8px_hsl(var(--primary))]";
      case "fail": return "bg-destructive shadow-[0_0_8px_hsl(var(--destructive))]";
      case "warn": return "bg-yellow-400";
      case "running": return "bg-yellow-400 animate-pulse";
      case "skip": return "bg-muted-foreground/30";
      default: return "bg-muted-foreground/40";
    }
  };

  const probeFailed = checks.find((c) => c.id === "probe")?.state === "fail";
  const portFailed = checks.find((c) => c.id === "port")?.state === "fail";
  const daemonFailed = checks.find((c) => c.id === "daemon")?.state === "fail";
  const liveStreamOffline = t.bridgeValidated && t.wsState !== "connected";
  const uinputBlocked = daemonInfo?.uinput === false;

  return (
    <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="panel w-full max-w-3xl max-h-[92vh] overflow-y-auto bg-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b hairline px-4 h-11">
          <div className="font-mono text-[12px] tracking-[0.25em] text-emerald-glow">
            ▣ BRIDGE DIAGNOSTICS
          </div>
          <button
            onClick={onClose}
            className="font-mono text-[11px] text-muted-foreground hover:text-foreground tracking-[0.2em]"
          >
            ✕ CLOSE
          </button>
        </div>

        <div className="p-4 border-b hairline">
          <div className="font-mono text-[10px] text-muted-foreground tracking-[0.25em] mb-2">TARGET ENDPOINT</div>
          <div className="font-mono text-sm text-foreground bg-input border border-border px-3 h-9 flex items-center">
            {bridgeUrl}
          </div>
          {portInfo?.suggestedUrl && portInfo.suggestedUrl !== bridgeUrl && (
            <div className="mt-2 flex items-center justify-between gap-2 px-3 h-9 border border-yellow-400/50 bg-yellow-400/10">
              <span className="font-mono text-[10px] text-yellow-400 tracking-[0.2em]">
                SUGGESTED · {portInfo.suggestedUrl}
              </span>
              {setBridgeUrl && (
                <button
                  onClick={() => { setBridgeUrl(portInfo.suggestedUrl!); }}
                  className="font-mono text-[10px] tracking-[0.25em] px-2 h-6 border border-yellow-400/60 text-yellow-400 hover:bg-yellow-400/20"
                >
                  USE
                </button>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-b hairline">
          <div className="font-mono text-[10px] text-muted-foreground tracking-[0.25em] mb-3">CHECKS</div>
          <ul className="space-y-2">
            {checks.map((c) => (
              <li key={c.id} className="flex items-start gap-3 font-mono text-[11px]">
                <span className={`mt-1.5 inline-block w-2 h-2 rounded-full shrink-0 ${dotFor(c.state)}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-foreground tracking-[0.15em]">{c.label.toUpperCase()}</div>
                  <div className="text-muted-foreground text-[10px] truncate" title={c.detail}>
                    {c.detail || "—"}
                  </div>
                </div>
                <span
                  className={`font-mono text-[10px] tracking-[0.25em] shrink-0 ${
                    c.state === "pass" ? "text-emerald-glow" :
                    c.state === "fail" ? "text-destructive" :
                    c.state === "warn" ? "text-yellow-400" :
                    c.state === "running" ? "text-yellow-400" :
                    c.state === "skip" ? "text-muted-foreground/60" :
                    "text-muted-foreground"
                  }`}
                >
                  {c.state.toUpperCase()}
                </span>
              </li>
            ))}
          </ul>
          <button
            onClick={runDiagnostics}
            disabled={running}
            className="mt-4 w-full h-9 font-mono text-[11px] tracking-[0.25em] border border-primary/60 text-primary hover:bg-primary/10 disabled:opacity-60"
          >
            {running ? "◌ RE-RUNNING…" : "↻ RE-RUN DIAGNOSTICS"}
          </button>
        </div>

        {portFailed && (
          <div className="p-4 border-b hairline">
            <div className="font-mono text-[10px] text-destructive tracking-[0.25em] mb-2">
              ⚠ PORT 8765 NOT REACHABLE
            </div>
            <ol className="font-mono text-[11px] text-muted-foreground space-y-2 leading-relaxed list-decimal list-inside">
              <li>Daemon isn't running. Start it with <span className="text-primary">python3 bridge/omnipoint_bridge.py --host 127.0.0.1 --port 8765</span>.</li>
              <li>Wrong host. The daemon binds <span className="text-primary">127.0.0.1</span> by default — connect with <span className="text-primary">ws://127.0.0.1:8765</span> from the same machine.</li>
              <li>Port already in use. Check with <span className="text-primary">ss -ltnp 'sport = :8765'</span>.</li>
              <li>Local firewall is blocking loopback (rare). Try <span className="text-primary">sudo ufw allow in on lo</span> or temporarily disable ufw.</li>
              <li>You're loading the app over <span className="text-primary">https://</span>. Browsers block ws:// from secure pages — open the app at <span className="text-primary">http://localhost</span>.</li>
            </ol>
          </div>
        )}

        {(daemonFailed || uinputBlocked) && (
          <div className="p-4 border-b hairline">
            <div className="font-mono text-[10px] text-destructive tracking-[0.25em] mb-2">
              ⚠ DAEMON UP, BUT CANNOT INJECT INPUT (/dev/uinput)
            </div>
            <ol className="font-mono text-[11px] text-muted-foreground space-y-2 leading-relaxed list-decimal list-inside">
              <li>Load the kernel module once per boot: <span className="text-primary">sudo modprobe uinput</span>.</li>
              <li>Make uinput accessible to your user (preferred — survives reboot):
                <pre className="mt-1 font-mono text-[10px] bg-input border border-border p-2 whitespace-pre">{`echo 'KERNEL=="uinput", GROUP="input", MODE="0660", OPTIONS+="static_node=uinput"' \\
  | sudo tee /etc/udev/rules.d/99-uinput.rules
sudo usermod -aG input $USER
sudo udevadm control --reload-rules && sudo udevadm trigger
# log out & back in for the group change to take effect`}</pre>
              </li>
              <li>Verify: <span className="text-primary">ls -l /dev/uinput</span> should show group <span className="text-primary">input</span>; <span className="text-primary">id -nG</span> should include <span className="text-primary">input</span>.</li>
              <li>Restart the daemon after fixing permissions.</li>
            </ol>
          </div>
        )}

        {wayland && env.os === "linux" && (
          <div className="p-4 border-b hairline">
            <div className="font-mono text-[10px] text-emerald-glow tracking-[0.25em] mb-2">
              ▸ WAYLAND DETECTED — EVDEV INJECTION NOTES
            </div>
            <p className="font-mono text-[11px] text-muted-foreground leading-relaxed">
              The bridge uses kernel-level <span className="text-foreground">/dev/uinput</span>, so it works under both
              X11 and Wayland — Wayland's per-client input restrictions do <span className="text-foreground">not</span>{" "}
              apply at the kernel layer. If the daemon connects but the cursor doesn't move:
            </p>
            <ul className="mt-2 font-mono text-[11px] text-muted-foreground space-y-1 list-disc list-inside">
              <li><span className="text-foreground">GNOME/KDE Wayland:</span> nothing extra is required beyond uinput permissions above.</li>
              <li><span className="text-foreground">Sway / wlroots:</span> works out of the box; ensure <span className="text-primary">seatd</span> isn't restricting <span className="text-primary">/dev/uinput</span>.</li>
              <li><span className="text-foreground">Hyprland:</span> identical to wlroots — confirm with <span className="text-primary">echo $XDG_SESSION_TYPE</span>.</li>
              <li><span className="text-foreground">Flatpak / Snap browser:</span> sandboxing doesn't affect the daemon, but ensure the daemon runs <span className="text-foreground">outside</span> any sandbox.</li>
            </ul>
          </div>
        )}

        {(probeFailed || liveStreamOffline) && !portFailed && !daemonFailed && (
          <div className="p-4 border-b hairline">
            <div className="font-mono text-[10px] text-destructive tracking-[0.25em] mb-2">
              ⚠ {probeFailed ? "HANDSHAKE FAILED" : "LIVE STREAM OFFLINE"}
            </div>
            <p className="font-mono text-[11px] text-muted-foreground leading-relaxed">
              Port is reachable but the persistent stream dropped. Click <span className="text-primary">RECONNECT</span>{" "}
              once. If it drops again, restart the daemon and check the log below for the close code.
            </p>
          </div>
        )}

        <div className="p-4 border-b hairline">
          <div className="font-mono text-[10px] text-muted-foreground tracking-[0.25em] mb-2">LIVE EVENT LOG</div>
          <BridgeLogPanel height="max-h-56" />
        </div>

        <div className="p-4 border-b hairline">
          <div className="font-mono text-[10px] text-emerald-glow tracking-[0.25em] mb-2">▸ START THE BRIDGE</div>
          <div className="font-mono text-[10px] text-muted-foreground mb-2 tracking-[0.2em]">
            DETECTED OS — {env.os.toUpperCase()}
          </div>

          <div className="font-mono text-[10px] text-muted-foreground mb-1 mt-3">1 · Install once</div>
          <pre className="font-mono text-[11px] bg-input border border-border p-3 overflow-x-auto whitespace-pre text-foreground">
{`cd bridge
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt`}
          </pre>

          {env.os === "linux" && (
            <>
              <div className="font-mono text-[10px] text-muted-foreground mb-1 mt-3">2 · Linux: load uinput once per boot</div>
              <pre className="font-mono text-[11px] bg-input border border-border p-3 overflow-x-auto text-foreground">{`sudo modprobe uinput`}</pre>

              <div className="font-mono text-[10px] text-muted-foreground mb-1 mt-3">3 · Linux: verify device access</div>
              <pre className="font-mono text-[11px] bg-input border border-border p-3 overflow-x-auto text-foreground">{`ls -l /dev/uinput
id -nG | tr ' ' '\\n' | grep -E '^input$' || echo "Not in input group"
ss -ltnp 'sport = :8765' || echo "Nothing on 8765 yet"`}</pre>
            </>
          )}

          <div className="font-mono text-[10px] text-muted-foreground mb-1 mt-3">
            {env.os === "linux" ? "4" : "2"} · Run the daemon
          </div>
          <pre className="font-mono text-[11px] bg-input border border-border p-3 overflow-x-auto text-foreground">{`python3 omnipoint_bridge.py --host 127.0.0.1 --port 8765 -v`}</pre>
        </div>

        <div className="p-4 flex items-center justify-between gap-2">
          <div className="font-mono text-[10px] text-muted-foreground tracking-[0.2em]">
            STATE · <span className="text-foreground">{t.wsState.toUpperCase()}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={runDiagnostics}
              disabled={running}
              className="h-9 px-4 font-mono text-[11px] tracking-[0.25em] border border-primary/60 text-primary hover:bg-primary/10 disabled:opacity-60"
            >
              ◉ RETEST
            </button>
            <button
              onClick={onClose}
              className="h-9 px-4 font-mono text-[11px] tracking-[0.25em] border border-border text-muted-foreground hover:text-foreground"
            >
              DISMISS
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

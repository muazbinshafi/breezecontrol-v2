import { useState } from "react";
import type { ControlMode } from "@/components/omnipoint/ControlModeBar";

interface Props {
  status: string;
  progress: number;
  error: string | null;
  onInitialize: () => void;
  initializing: boolean;
  controlMode?: ControlMode;
  onControlModeChange?: (m: ControlMode) => void;
}

export function InitScreen({
  status,
  progress,
  error,
  onInitialize,
  initializing,
  controlMode = "browser",
  onControlModeChange,
}: Props) {
  const [showRemote, setShowRemote] = useState(false);
  if (error) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-background scan-grid">
        <div className="max-w-xl panel p-8">
          <div className="font-mono text-destructive text-xs tracking-[0.3em] mb-3 led">
            ▲ HARDWARE INITIALIZATION ERROR
          </div>
          <div className="font-mono text-foreground text-sm mb-4 break-words">{error}</div>
          <ul className="font-mono text-[11px] text-muted-foreground space-y-1 mb-6 leading-relaxed">
            <li>• Verify webcam is connected and not in use by another app.</li>
            <li>• Grant camera permission in your browser.</li>
            <li>• Use Chromium / Chrome for GPU MediaPipe delegate.</li>
            <li>• Check network access to MediaPipe CDN.</li>
          </ul>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={onInitialize}
              className="font-mono text-[11px] tracking-[0.25em] px-4 h-9 border border-primary text-primary hover:bg-primary/10"
            >
              ⟳ RETRY
            </button>
            <button
              onClick={() => setShowRemote((v) => !v)}
              className="font-mono text-[11px] tracking-[0.25em] px-4 h-9 border hairline text-muted-foreground hover:text-foreground"
            >
              {showRemote ? "✕ HIDE REMOTE ACCESS" : "⇄ REMOTE ACCESS / SSH"}
            </button>
          </div>
          {showRemote && <RemoteAccessHelp />}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex items-center justify-center bg-background scan-grid">
      <div className="w-[520px] panel p-8">
        <div className="font-mono text-[10px] tracking-[0.4em] text-emerald-glow mb-2">
          OMNIPOINT // HCI
        </div>
        <h1 className="font-mono text-2xl text-foreground tracking-wider mb-1">
          TOUCHLESS INTERFACE
        </h1>
        <p className="font-mono text-[11px] text-muted-foreground tracking-wider mb-8">
          GESTURE-TO-HID BRIDGE · ENTERPRISE EDITION
        </p>

        <div className="border-t border-b hairline py-4 mb-6">
          <div className="grid grid-cols-2 gap-3 font-mono text-[10px]">
            <Spec k="VISION" v="MEDIAPIPE GPU" />
            <Spec k="TARGET" v="60 FPS @ 720P" />
            <Spec k="BRIDGE" v="WS://LOCALHOST:8765" />
            <Spec k="MODEL" v="HAND_LANDMARKER" />
          </div>
        </div>

        {onControlModeChange && (
          <div className="mb-5">
            <div className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground mb-2">
              ▌ CONTROL MODE
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onControlModeChange("browser")}
                className={`text-left p-3 border transition-colors ${
                  controlMode === "browser"
                    ? "border-primary bg-primary/10"
                    : "hairline hover:border-primary/40"
                }`}
              >
                <div className={`font-mono text-[11px] tracking-[0.2em] mb-1 ${controlMode === "browser" ? "text-primary" : "text-foreground"}`}>
                  🌐 BROWSER
                </div>
                <div className="font-mono text-[9.5px] text-muted-foreground leading-snug">
                  Just camera permission. Controls this page only.
                </div>
              </button>
              <button
                onClick={() => onControlModeChange("bridge")}
                className={`text-left p-3 border transition-colors ${
                  controlMode === "bridge"
                    ? "border-primary bg-primary/10"
                    : "hairline hover:border-primary/40"
                }`}
              >
                <div className={`font-mono text-[11px] tracking-[0.2em] mb-1 ${controlMode === "bridge" ? "text-primary" : "text-foreground"}`}>
                  🖥 BRIDGE
                </div>
                <div className="font-mono text-[9.5px] text-muted-foreground leading-snug">
                  Real OS cursor via local Python daemon.
                </div>
              </button>
            </div>
          </div>
        )}

        <button
          onClick={onInitialize}
          disabled={initializing}
          className="w-full h-12 font-mono text-xs tracking-[0.35em] border border-primary bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-60 disabled:cursor-wait led"
          style={{ boxShadow: "0 0 18px hsl(var(--primary) / 0.4)" }}
        >
          {initializing ? "▶ INITIALIZING..." : "▶ START CAMERA"}
        </button>

        {initializing && (
          <div className="mt-5">
            <div className="font-mono text-[10px] text-muted-foreground tracking-[0.2em] mb-1.5">
              {status}
            </div>
            <div className="h-1 bg-secondary overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${progress}%`, boxShadow: "0 0 8px hsl(var(--primary))" }}
              />
            </div>
          </div>
        )}

        <p className="mt-6 font-mono text-[10px] text-muted-foreground leading-relaxed">
          Camera access is required. Video is processed locally in your browser; no frames are uploaded.
          For system-wide cursor control on Linux, run the bridge daemon shipped in <span className="text-foreground">bridge/</span>.
        </p>

        <button
          onClick={() => setShowRemote((v) => !v)}
          className="mt-4 font-mono text-[10px] tracking-[0.3em] text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
        >
          {showRemote ? "✕ HIDE REMOTE ACCESS" : "⇄ ACCESSING FROM ANOTHER MACHINE? (SSH / HTTPS)"}
        </button>
        {showRemote && <RemoteAccessHelp />}
      </div>
    </div>
  );
}

function Spec({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-muted-foreground tracking-[0.25em]">{k}</div>
      <div className="text-foreground tracking-[0.15em]">{v}</div>
    </div>
  );
}

function RemoteAccessHelp() {
  return (
    <div className="mt-5 border hairline p-4 bg-card/40 font-mono text-[11px] leading-relaxed text-muted-foreground space-y-4">
      <div>
        <div className="text-foreground tracking-[0.25em] text-[10px] mb-2">
          ▌ WHY THIS ERROR
        </div>
        Browsers block <span className="text-foreground">getUserMedia</span> on
        non-secure origins. <span className="text-foreground">http://localhost</span> and
        <span className="text-foreground"> https://</span> are allowed; raw LAN IPs
        like <span className="text-foreground">http://192.168.x.x</span> are not.
      </div>

      <div>
        <div className="text-emerald-glow tracking-[0.25em] text-[10px] mb-2">
          ▌ OPTION A · SSH PORT FORWARD (RECOMMENDED)
        </div>
        Run the dev server on the remote host, then forward both the Vite port
        (3000) and the bridge port (8765) to your local machine. Everything
        appears as <span className="text-foreground">localhost</span> in your browser:
        <pre className="mt-2 p-3 bg-background border hairline text-foreground text-[10.5px] overflow-x-auto whitespace-pre">
{`# on your laptop — forward both ports from the remote host
ssh -N \\
  -L 3000:localhost:3000 \\
  -L 8765:localhost:8765 \\
  user@remote-host

# on the remote host (in another terminal):
bun dev                          # serves on :3000
python3 bridge/omnipoint_bridge.py   # serves on :8765

# then on your laptop, open:
http://localhost:3000/demo`}
        </pre>
        <div className="mt-2">
          Bridge URL stays at <span className="text-foreground">ws://localhost:8765</span>.
          Camera works because the origin is <span className="text-foreground">localhost</span>.
        </div>
      </div>

      <div>
        <div className="text-emerald-glow tracking-[0.25em] text-[10px] mb-2">
          ▌ OPTION B · CLOUDFLARED / NGROK TUNNEL
        </div>
        Get a public HTTPS URL pointing at your local dev server:
        <pre className="mt-2 p-3 bg-background border hairline text-foreground text-[10.5px] overflow-x-auto whitespace-pre">
{`cloudflared tunnel --url http://localhost:3000
# or
ngrok http 3000`}
        </pre>
        <div className="mt-2">
          Note: a public HTTPS page cannot reach <span className="text-foreground">ws://localhost:8765</span> due
          to mixed-content rules — tunnel the bridge too if you need the OS cursor.
        </div>
      </div>

      <div>
        <div className="text-emerald-glow tracking-[0.25em] text-[10px] mb-2">
          ▌ OPTION C · LOCAL HTTPS ON THE LAN
        </div>
        <pre className="p-3 bg-background border hairline text-foreground text-[10.5px] overflow-x-auto whitespace-pre">
{`bun add -d @vitejs/plugin-basic-ssl
# then in vite.config.ts:
#   import basicSsl from '@vitejs/plugin-basic-ssl';
#   defineConfig({ vite: { plugins: [basicSsl()] } });
bun dev   # → https://<lan-ip>:3000/demo (accept self-signed cert)`}
        </pre>
      </div>
    </div>
  );
}

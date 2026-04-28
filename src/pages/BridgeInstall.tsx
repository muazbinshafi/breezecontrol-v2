// BridgeInstall — guided setup for the cross-platform Python bridge that
// turns gestures into real OS mouse/keyboard events. Tabbed by OS, with
// copy-to-clipboard for every command and a download link for the
// repository's bridge folder.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Cpu, Copy, Check, Terminal, Apple, Hand, ChevronRight,
  ExternalLink, Download, Github, ShieldCheck,
} from "lucide-react";

type OS = "windows" | "macos" | "linux";

const COMMANDS: Record<OS, { label: string; cmd: string }[]> = {
  windows: [
    { label: "Open the bridge folder", cmd: "cd bridge" },
    { label: "Create a virtual environment", cmd: "python -m venv .venv" },
    { label: "Activate it", cmd: ".venv\\Scripts\\activate" },
    { label: "Install dependencies", cmd: "pip install -r requirements.txt" },
    { label: "Start the bridge", cmd: "python omnipoint_bridge.py" },
  ],
  macos: [
    { label: "Open the bridge folder", cmd: "cd bridge" },
    { label: "Create a virtual environment", cmd: "python3 -m venv .venv" },
    { label: "Activate it", cmd: "source .venv/bin/activate" },
    { label: "Install dependencies", cmd: "pip install -r requirements.txt" },
    { label: "Start the bridge", cmd: "python3 omnipoint_bridge.py" },
  ],
  linux: [
    { label: "Open the bridge folder", cmd: "cd bridge" },
    { label: "Create a virtual environment", cmd: "python3 -m venv .venv" },
    { label: "Activate it", cmd: "source .venv/bin/activate" },
    { label: "Install dependencies", cmd: "pip install -r requirements.txt" },
    { label: "Start the bridge", cmd: "python3 omnipoint_bridge.py" },
  ],
};

const detectOS = (): OS => {
  if (typeof navigator === "undefined") return "windows";
  const p = navigator.platform.toLowerCase();
  if (p.includes("mac")) return "macos";
  if (p.includes("linux")) return "linux";
  return "windows";
};

const BridgeInstall = () => {
  const [os, setOs] = useState<OS>("windows");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Install Bridge — BreezeControl";
    setOs(detectOS());
  }, []);

  const copy = async (cmd: string) => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(cmd);
      setTimeout(() => setCopied((c) => (c === cmd ? null : c)), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  const tiles: { id: OS; label: string; icon: typeof Cpu; tagline: string }[] = [
    { id: "windows", label: "Windows",  icon: Terminal, tagline: "Windows 10 / 11 · PowerShell" },
    { id: "macos",   label: "macOS",    icon: Apple,    tagline: "macOS 12+ · Intel & Apple Silicon" },
    { id: "linux",   label: "Linux",    icon: Cpu,      tagline: "X11 / Wayland · uinput" },
  ];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b hairline px-4 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-gradient-primary grid place-items-center">
            <Hand className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-display text-sm">BreezeControl</span>
        </Link>
        <span className="font-mono text-[10px] tracking-[0.3em] text-emerald-glow">BRIDGE</span>
      </header>

      <section className="max-w-3xl mx-auto px-4 py-8 sm:py-14">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 grid place-items-center border border-primary/40 bg-primary/10 rounded-xl">
            <Cpu className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              Install the OS bridge
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Pick your operating system for a complete step-by-step guide.
            </p>
          </div>
        </div>

        <div className="border border-warning/40 bg-warning/5 p-4 mb-6 rounded-xl flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-warning shrink-0 mt-0.5" />
          <div className="text-sm text-foreground/90 leading-relaxed">
            <strong>Why a local installation?</strong> The bridge has to control
            <em> your </em> mouse, so it must run on your own computer — there's
            no way for a hosted server to do this for security reasons. Setup
            takes about 5 minutes per platform.
          </div>
        </div>

        {/* Big OS tiles → per-OS guides */}
        <div className="grid sm:grid-cols-3 gap-3 mb-10">
          {tiles.map((t) => {
            const Icon = t.icon;
            const active = t.id === os;
            return (
              <Link
                key={t.id}
                to={`/bridge/${t.id}`}
                onMouseEnter={() => setOs(t.id)}
                className={`group relative border rounded-2xl p-5 transition-all hover:border-primary/60 hover:bg-primary/5 hover:-translate-y-0.5 ${
                  active ? "border-primary/50 bg-primary/5" : "hairline bg-card/40"
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 grid place-items-center rounded-xl border border-primary/30 bg-primary/10">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </div>
                <div className="font-display text-lg leading-tight">{t.label}</div>
                <div className="text-xs text-muted-foreground mt-1">{t.tagline}</div>
                <div className="mt-4 font-mono text-[10px] tracking-[0.25em] text-primary/80">
                  OPEN GUIDE →
                </div>
              </Link>
            );
          })}
        </div>

        {/* Inline quickstart for the previewed OS */}
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-mono text-[11px] tracking-[0.3em] text-muted-foreground">
            ▸ QUICK COMMANDS · {os.toUpperCase()}
          </h2>
          <Link
            to={`/bridge/${os}`}
            className="font-mono text-[10px] tracking-[0.25em] text-primary hover:underline"
          >
            FULL GUIDE →
          </Link>
        </div>

        <ol className="space-y-2 mb-6">
          {COMMANDS[os].map((step, i) => (
            <li
              key={step.cmd}
              className="border hairline bg-card/40 p-3 flex items-start gap-3"
            >
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums w-6 shrink-0 mt-1">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-foreground">{step.label}</div>
                <div className="mt-1.5 flex items-center gap-2 bg-background border border-border px-3 py-2 group">
                  <code className="flex-1 font-mono text-[12.5px] text-foreground/90 break-all">
                    {step.cmd}
                  </code>
                  <button
                    onClick={() => copy(step.cmd)}
                    className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    aria-label="Copy command"
                  >
                    {copied === step.cmd ? (
                      <Check className="w-4 h-4 text-[hsl(var(--success))]" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>

        <div className="border border-border bg-card p-5 mb-4">
          <h2 className="font-mono text-[11px] tracking-[0.3em] text-emerald-glow mb-3">
            ▸ THEN, IN THE WEB APP
          </h2>
          <ol className="space-y-1.5 text-sm text-foreground/90 list-decimal list-inside">
            <li>Open the demo and start the camera.</li>
            <li>In the top toolbar, switch <strong>Control mode</strong> to <strong>Bridge</strong>.</li>
            <li>The bridge URL is <code className="font-mono text-xs">ws://localhost:8765</code>.</li>
            <li>Test the connection from the Telemetry panel — you should see <code className="font-mono text-xs">PROBE OK</code>.</li>
          </ol>
          <Link
            to="/demo"
            className="mt-4 inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.3em] text-primary hover:underline"
          >
            OPEN THE DEMO <ExternalLink className="w-3 h-3" />
          </Link>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <a
            href="https://github.com/muazbinshafi/airtouch-v3/tree/main/bridge"
            target="_blank"
            rel="noopener noreferrer"
            className="border hairline p-4 hover:border-primary/40 transition-colors flex items-center gap-3"
          >
            <Github className="w-5 h-5 text-muted-foreground" />
            <div className="flex-1">
              <div className="text-sm font-medium">View bridge source</div>
              <div className="text-xs text-muted-foreground">on GitHub</div>
            </div>
            <ExternalLink className="w-4 h-4 text-muted-foreground" />
          </a>
          <a
            href="https://www.python.org/downloads/"
            target="_blank"
            rel="noopener noreferrer"
            className="border hairline p-4 hover:border-primary/40 transition-colors flex items-center gap-3"
          >
            <Download className="w-5 h-5 text-muted-foreground" />
            <div className="flex-1">
              <div className="text-sm font-medium">Need Python?</div>
              <div className="text-xs text-muted-foreground">Get Python 3.10+</div>
            </div>
            <ExternalLink className="w-4 h-4 text-muted-foreground" />
          </a>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Browser-only mode works without the bridge — but the cursor stays inside the page.
        </p>
      </section>
    </main>
  );
};

export default BridgeInstall;

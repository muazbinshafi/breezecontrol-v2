import { Link } from "react-router-dom";
import { useEffect } from "react";
import {
  Hand, MousePointer2, Zap, Shield, Activity, Sparkles, ArrowRight, Play, Github,
  Cpu, Eye, Gauge, Smartphone, Palette, Settings2, Wand2, Layers, Download,
  Terminal, Apple, ExternalLink, Server, ShieldCheck,
} from "lucide-react";
import { ThemeSettings, ThemeToggleQuick } from "@/components/ThemeSettings";

const Index = () => {
  useEffect(() => {
    document.title = "BreezeControl — Touchless Gesture Control for Web, Desktop & Mobile";
    const setMeta = (name: string, content: string, attr: "name" | "property" = "name") => {
      let tag = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute(attr, name);
        document.head.appendChild(tag);
      }
      tag.content = content;
    };
    setMeta(
      "description",
      "Control your computer or phone with hand gestures. 60 FPS MediaPipe vision, customizable bindings, paint mode, cross-platform OS bridge, PWA installable. Open source.",
    );
    setMeta("og:title", "BreezeControl — Touchless Gesture Control", "property");
    setMeta(
      "og:description",
      "Hand gestures → real cursor. MediaPipe vision · customizable profiles · paint toolbox · cross-platform bridge · installable on phone.",
      "property",
    );
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Header />
      <Hero />
      <Marquee />
      <WhatsNew />
      <Features />
      <Gestures />
      <PaintShowcase />
      <MobileSection />
      <Architecture />
      <BridgeSection />
      <Quickstart />
      <CTA />
      <Footer />
    </main>
  );
};

function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl flex items-center justify-between px-6 h-16">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="relative w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center shadow-md">
            <Hand className="w-4 h-4 text-white" strokeWidth={2.5} />
            <span className="absolute -inset-0.5 rounded-lg bg-gradient-primary opacity-40 blur-md -z-10" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-display text-[15px] text-foreground">BreezeControl</span>
            <span className="font-mono text-[9px] tracking-[0.25em] text-muted-foreground -mt-0.5">HCI · v2.0</span>
          </div>
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
          <a href="#features" className="hover:text-foreground transition-colors">Features</a>
          <a href="#gestures" className="hover:text-foreground transition-colors">Gestures</a>
          <Link to="/guide" className="hover:text-foreground transition-colors">Guide</Link>
          <a href="#bridge" className="hover:text-foreground transition-colors">Bridge</a>
          <a href="#architecture" className="hover:text-foreground transition-colors">How it works</a>
          <a href="#quickstart" className="hover:text-foreground transition-colors">Docs</a>
        </nav>
        <div className="flex items-center gap-2">
          <a
            href="https://github.com/muazbinshafi/airtouch-v8"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center justify-center w-9 h-9 rounded-lg border border-border hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
            aria-label="GitHub repository"
          >
            <Github className="w-4 h-4" />
          </a>
          <ThemeToggleQuick />
          <ThemeSettings variant="inline" />
          <Link
            to="/auth"
            className="hidden sm:inline-flex items-center justify-center h-10 px-3 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            Sign in
          </Link>
          <Link to="/demo" className="btn-primary h-10 px-4 text-sm">
            <Play className="w-3.5 h-3.5 fill-current" />
            Launch demo
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto max-w-7xl px-6 pt-20 pb-24 lg:pt-28 lg:pb-32">
        <div className="grid lg:grid-cols-[1.1fr_1fr] gap-16 items-center">
          {/* Left: copy */}
          <div>
            <div className="chip mb-6">
              <Sparkles className="w-3 h-3" />
              v2 · Customizable gestures · Paint mode · Mobile-ready
            </div>
            <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl leading-[1.02] text-foreground">
              Wave hello to your<br />
              new <span className="text-gradient">cursor</span>.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground leading-relaxed">
              BreezeControl turns any webcam into a friendly, touch-free input device.
              Pinch to click, point to move, draw in the air — on your laptop or your
              phone. Soft on the eyes, sharp on the cursor.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link to="/demo" className="btn-primary h-12 px-6 text-sm">
                <Play className="w-4 h-4 fill-current" />
                Try it live
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link to="/guide" className="btn-ghost h-12 px-6 text-sm">
                <Hand className="w-4 h-4" />
                Gesture guide
              </Link>
              <Link to="/install" className="btn-ghost h-12 px-6 text-sm">
                <Smartphone className="w-4 h-4" />
                Install on phone
              </Link>
            </div>
            <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
              <Stat label="FPS" value="60" />
              <Stat label="Latency" value="<16ms" />
              <Stat label="Gestures" value="11" />
              <Stat label="Open source" value="MIT" />
            </div>
          </div>

          {/* Right: hero visual */}
          <div className="relative">
            <div className="absolute -inset-8 bg-gradient-primary opacity-20 blur-3xl rounded-full" />
            <div className="relative panel-elevated overflow-hidden anim-float">
              <div className="flex items-center justify-between px-4 h-10 border-b border-border bg-secondary/50">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-destructive/70" />
                  <span className="w-2.5 h-2.5 rounded-full bg-warning/70" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--success))]/70" />
                </div>
                <div className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground">SENSOR · LIVE PREVIEW</div>
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-[hsl(var(--success))]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--success))] led anim-pulse-soft" />
                  REC
                </div>
              </div>
              <div className="relative aspect-[4/3] bg-gradient-to-br from-secondary to-background dot-grid overflow-hidden anim-scanline">
                <HandGlyph />
                <div className="absolute top-4 left-4 panel-glass px-2.5 py-1.5 font-mono text-[10px] tracking-wider">
                  <span className="text-muted-foreground">DETECTED</span> <span className="text-gradient font-semibold">RIGHT · 5/5</span>
                </div>
                <div className="absolute top-4 right-4 panel-glass px-2.5 py-1.5 font-mono text-[10px]">
                  <span className="text-muted-foreground">GESTURE</span> <span className="text-gradient font-semibold">PINCH</span>
                </div>
                <div className="absolute bottom-4 left-4 right-4 panel-glass px-3 py-2 flex items-center justify-between font-mono text-[11px]">
                  <span><span className="text-muted-foreground">FPS</span> <b className="text-foreground">60.0</b></span>
                  <span><span className="text-muted-foreground">LAT</span> <b className="text-foreground">12ms</b></span>
                  <span><span className="text-muted-foreground">CONF</span> <b className="text-foreground">0.97</b></span>
                </div>
              </div>
            </div>

            {/* Floating chips */}
            <div className="absolute -left-6 top-12 panel px-3 py-2 flex items-center gap-2 anim-float" style={{ animationDelay: "1s" }}>
              <MousePointer2 className="w-4 h-4 text-primary" />
              <span className="text-xs font-medium">Pinch → Click</span>
            </div>
            <div className="absolute -right-6 bottom-16 panel px-3 py-2 flex items-center gap-2 anim-float" style={{ animationDelay: "2s" }}>
              <Activity className="w-4 h-4 text-[hsl(var(--accent))]" />
              <span className="text-xs font-medium">Two-finger scroll</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-display text-2xl text-foreground">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function HandGlyph() {
  const dots: Array<[number, number]> = [
    [50, 78], [44, 70], [40, 60], [38, 50], [37, 42],
    [50, 60], [50, 46], [50, 36], [50, 28],
    [56, 60], [58, 46], [58, 36], [58, 28],
    [62, 62], [64, 50], [65, 42], [65, 34],
    [68, 64], [71, 56], [73, 50], [74, 44],
  ];
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full">
      <defs>
        <linearGradient id="handGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="hsl(var(--primary))" />
          <stop offset="100%" stopColor="hsl(var(--accent))" />
        </linearGradient>
      </defs>
      {/* skeleton lines */}
      <line x1="37" y1="42" x2="50" y2="60" stroke="url(#handGrad)" strokeWidth="0.6" opacity="0.6" />
      <line x1="50" y1="28" x2="50" y2="60" stroke="url(#handGrad)" strokeWidth="0.6" opacity="0.6" />
      <line x1="58" y1="28" x2="50" y2="60" stroke="url(#handGrad)" strokeWidth="0.6" opacity="0.6" />
      <line x1="65" y1="34" x2="50" y2="60" stroke="url(#handGrad)" strokeWidth="0.6" opacity="0.6" />
      <line x1="74" y1="44" x2="50" y2="60" stroke="url(#handGrad)" strokeWidth="0.6" opacity="0.6" />
      {dots.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="2.4" fill="hsl(var(--primary) / 0.15)" />
          <circle cx={x} cy={y} r="1" fill="url(#handGrad)" />
        </g>
      ))}
      {/* highlighted pinch points */}
      <circle cx="37" cy="42" r="6" fill="none" stroke="hsl(var(--primary))" strokeWidth="0.5" className="anim-pulse-soft" />
      <circle cx="50" cy="28" r="6" fill="none" stroke="hsl(var(--primary))" strokeWidth="0.5" className="anim-pulse-soft" />
    </svg>
  );
}

function Marquee() {
  const items = [
    "MediaPipe Vision",
    "Cross-platform Bridge",
    "Customizable bindings",
    "Named profiles",
    "Paint toolbox",
    "PWA · Installable",
    "Mobile-ready",
    "60 FPS @ 720p",
    "Open Source · MIT",
  ];
  return (
    <section className="border-y border-border bg-secondary/40">
      <div className="mx-auto max-w-7xl px-6 py-5 flex flex-wrap items-center justify-center gap-x-10 gap-y-2 text-xs font-mono tracking-wider text-muted-foreground">
        {items.map((it, i) => (
          <span key={it} className="flex items-center gap-3">
            {i > 0 && <span className="w-1 h-1 rounded-full bg-border" />}
            {it}
          </span>
        ))}
      </div>
    </section>
  );
}

function WhatsNew() {
  const updates = [
    {
      tag: "NEW",
      icon: Settings2,
      title: "Customizable gestures",
      desc: "Remap any pose to any action. Per-mode bindings (pointer vs draw), hold-time tuning, and per-gesture cooldowns.",
    },
    {
      tag: "NEW",
      icon: Layers,
      title: "Named profiles",
      desc: "Save your tuning as profiles like 'Presenter' or 'Artist'. Switch instantly. Export & import as JSON.",
    },
    {
      tag: "NEW",
      icon: Wand2,
      title: "Calibration wizard",
      desc: "First-run guided setup: framing → origin → sensitivity. Re-run anytime from the toolbar.",
    },
    {
      tag: "NEW",
      icon: Palette,
      title: "Paint toolbox",
      desc: "MS Paint-style overlay. Pens, marker, highlighter, eraser, shapes, undo/redo, save as PNG.",
    },
    {
      tag: "NEW",
      icon: Smartphone,
      title: "Mobile + PWA",
      desc: "Touch-friendly UI, dvh viewport, slide-up telemetry sheet. Install to home screen on iOS & Android.",
    },
    {
      tag: "NEW",
      icon: Cpu,
      title: "Cross-platform bridge",
      desc: "Python WebSocket bridge using PyAutoGUI — works on Windows, macOS and Linux for real OS control.",
    },
  ];
  return (
    <section className="mx-auto max-w-7xl px-6 py-20 lg:py-24">
      <SectionHead
        eyebrow="What's new"
        title="Built up since v1."
        subtitle="The latest pass focused on customization, paint, and getting BreezeControl running everywhere."
      />
      <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {updates.map((u) => (
          <div
            key={u.title}
            className="panel p-5 hover:shadow-md hover:-translate-y-0.5 transition-all"
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="font-mono text-[9px] tracking-[0.25em] text-primary border border-primary/40 px-1.5 py-0.5">
                {u.tag}
              </span>
              <u.icon className="w-4 h-4 text-muted-foreground" />
            </div>
            <h3 className="font-display text-base text-foreground">{u.title}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{u.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Features() {
  const features = [
    { icon: Eye, title: "Vision-first", desc: "MediaPipe Hand Landmarker tracks 21 keypoints per hand at 60 FPS, fully on-device." },
    { icon: Zap, title: "Sub-frame latency", desc: "Smoothed pointer with EMA filtering and velocity² acceleration. Feels instant." },
    { icon: Cpu, title: "Real OS events", desc: "A tiny Python bridge using PyAutoGUI turns gestures into kernel-level events on Win/macOS/Linux." },
    { icon: Shield, title: "Privacy by design", desc: "Camera stream never leaves the browser. The bridge only receives intent payloads." },
    { icon: Gauge, title: "Live telemetry", desc: "On-screen HUD shows FPS, inference latency, handedness, finger states and confidence." },
    { icon: Settings2, title: "Customizable", desc: "Remap every static pose, save profiles, tune accuracy bias, hold-time and cooldowns." },
  ];
  return (
    <section id="features" className="mx-auto max-w-7xl px-6 py-24 lg:py-32">
      <SectionHead
        eyebrow="Why BreezeControl"
        title="Built for precision, designed for everyone."
        subtitle="A complete vision-to-HID pipeline you can actually use — not a research demo."
      />
      <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {features.map((f) => (
          <div key={f.title} className="panel p-6 group hover:shadow-lg hover:-translate-y-0.5 transition-all">
            <div className="w-11 h-11 rounded-xl bg-gradient-primary flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
              <f.icon className="w-5 h-5 text-white" strokeWidth={2.2} />
            </div>
            <h3 className="mt-5 font-display text-lg text-foreground">{f.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Gestures() {
  const items = [
    { g: "Point",                a: "Hover / track",   d: "Index extended only — cursor follows the fingertip with no clicks emitted." },
    { g: "Index move",           a: "Move cursor",     d: "Index fingertip drives the OS pointer with EMA smoothing and velocity² acceleration." },
    { g: "Pinch",                a: "Left click",      d: "Bring thumb + index together. Hysteresis + debounce prevents accidental fires." },
    { g: "Three-finger pinch",   a: "Right click",     d: "Thumb meets BOTH index and middle. Triggers context menus and secondary actions." },
    { g: "Sustained pinch",      a: "Drag",            d: "Hold the pinch to grab and move windows, files, or selections." },
    { g: "Two-finger up/down",   a: "Scroll",          d: "Index + middle vertical motion is mapped to the system scroll wheel." },
    { g: "Thumbs up",            a: "Confirm / OK",    d: "Thumb up, fingers folded — confirm dialogs, accept prompts, or send acks." },
    { g: "Open palm",            a: "Idle / park",     d: "Releases all input and parks the cursor. Safe default state." },
    { g: "Fist",                 a: "Emergency stop",  d: "Tight fist — instant teardown. No further events leave the browser until rearmed." },
  ];
  return (
    <section id="gestures" className="border-y border-border bg-secondary/30">
      <div className="mx-auto max-w-7xl px-6 py-24 lg:py-32">
        <SectionHead
          eyebrow="Gesture library"
          title="Nine gestures. Full desktop control."
          subtitle="Every interaction your mouse can do — mapped to a natural hand pose."
        />
        <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((i, idx) => (
            <div key={i.g} className="panel p-6 hover:shadow-md hover:border-primary/30 transition-all group">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground">
                  G{String(idx + 1).padStart(2, "0")}
                </span>
                <span className="chip text-[10px]">{i.a}</span>
              </div>
              <h3 className="mt-4 font-display text-xl text-foreground group-hover:text-gradient transition-colors">{i.g}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{i.d}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 flex justify-center">
          <Link to="/guide" className="btn-primary h-12 px-6 text-sm">
            <Hand className="w-4 h-4" />
            Open interactive guide
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function PaintShowcase() {
  const tools = ["Pen", "Marker", "Highlighter", "Eraser", "Line", "Rect", "Ellipse", "Arrow"];
  return (
    <section className="mx-auto max-w-7xl px-6 py-20 lg:py-24">
      <SectionHead
        eyebrow="Paint mode"
        title="Draw in the air."
        subtitle="A pinch becomes a stroke. Switch to draw mode and the whole viewport becomes a canvas."
      />
      <div className="mt-12 grid lg:grid-cols-[1.2fr_1fr] gap-8 items-center">
        <div className="panel-elevated p-6 bg-mesh">
          <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.25em] text-muted-foreground mb-4">
            <Palette className="w-3.5 h-3.5 text-primary" />
            TOOLBOX · DRAW MODE
          </div>
          <div className="grid grid-cols-4 gap-2">
            {tools.map((t) => (
              <div
                key={t}
                className="border hairline px-3 h-10 flex items-center justify-center font-mono text-[11px] tracking-[0.18em] text-foreground bg-card/40"
              >
                {t}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-6 gap-1.5 mt-3">
            {["#000", "#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7", "#ec4899", "#14b8a6", "#fff", "#78716c", "#6366f1"].map((c) => (
              <span key={c} className="h-7 border border-border" style={{ backgroundColor: c }} />
            ))}
          </div>
          <div className="flex items-center justify-between mt-4 text-xs font-mono tracking-wider text-muted-foreground">
            <span>↶ UNDO · ↷ REDO</span>
            <span>⤓ SAVE PNG</span>
            <span>✕ CLEAR</span>
          </div>
        </div>
        <div>
          <h3 className="font-display text-2xl text-foreground">Sketch with your hand</h3>
          <p className="mt-3 text-muted-foreground leading-relaxed">
            Pinch and move to draw. Open palm undoes. Pinky-only clears. Four
            fingers saves to PNG. Every gesture in draw mode is remappable in the
            <span className="font-mono text-foreground"> GESTURES</span> panel.
          </p>
          <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-gradient-primary" />
              Highlighter, marker, eraser + 4 shape tools
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-gradient-primary" />
              Per-stroke undo/redo (30 step history)
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-gradient-primary" />
              Custom color picker + 12 presets
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-gradient-primary" />
              One-click save as PNG
            </li>
          </ul>
          <Link to="/demo" className="btn-primary h-11 px-5 text-sm mt-6 inline-flex">
            <Play className="w-4 h-4 fill-current" />
            Try draw mode
          </Link>
        </div>
      </div>
    </section>
  );
}

function MobileSection() {
  return (
    <section className="border-y border-border bg-secondary/30">
      <div className="mx-auto max-w-7xl px-6 py-24 lg:py-32 grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <div className="chip mb-4">
            <Smartphone className="w-3 h-3" />
            Mobile-ready
          </div>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl text-foreground leading-[1.1]">
            Works on your <span className="text-gradient">phone</span>, too.
          </h2>
          <p className="mt-4 text-muted-foreground text-lg">
            Touch-first controls, dvh viewport, slide-up telemetry sheet, and a
            full PWA install path. Use the front camera, gesture in the air, and
            the floating cursor still drives the page.
          </p>
          <ul className="mt-6 space-y-2.5 text-sm text-muted-foreground">
            <li className="flex items-start gap-2.5"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-gradient-primary" /> Installable on iOS & Android via PWA</li>
            <li className="flex items-start gap-2.5"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-gradient-primary" /> Capacitor build path for native packaging</li>
            <li className="flex items-start gap-2.5"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-gradient-primary" /> Touch-friendly 36px tap targets, swipe-friendly sheets</li>
            <li className="flex items-start gap-2.5"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-gradient-primary" /> Offline asset caching for MediaPipe runtime</li>
          </ul>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/install" className="btn-primary h-11 px-5 text-sm">
              <Download className="w-4 h-4" />
              Install on phone
            </Link>
            <Link to="/demo" className="btn-ghost h-11 px-5 text-sm">
              Open mobile demo
            </Link>
          </div>
        </div>
        <div className="relative flex justify-center">
          <div className="absolute -inset-12 bg-gradient-primary opacity-20 blur-3xl rounded-full" />
          <div className="relative w-[260px] h-[520px] rounded-[36px] border-4 border-foreground/15 bg-card shadow-2xl overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-7 bg-background flex items-center justify-center">
              <div className="w-20 h-4 rounded-full bg-foreground/20" />
            </div>
            <div className="absolute inset-0 pt-7 flex flex-col">
              <div className="px-3 py-3 border-b hairline flex items-center justify-between font-mono text-[9px] tracking-[0.25em] text-muted-foreground">
                <span>BREEZECONTROL</span>
                <span className="text-[hsl(var(--success))]">● LIVE</span>
              </div>
              <div className="flex-1 dot-grid relative">
                <div className="absolute inset-3 border hairline grid place-items-center">
                  <Hand className="w-12 h-12 text-primary anim-pulse-soft" strokeWidth={1.5} />
                </div>
              </div>
              <div className="border-t hairline px-3 py-2 flex items-center justify-around">
                {["POINT", "DRAW", "OFF"].map((t, i) => (
                  <span
                    key={t}
                    className={`font-mono text-[9px] tracking-[0.2em] ${i === 0 ? "text-primary" : "text-muted-foreground"}`}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Architecture() {
  return (
    <section id="architecture" className="mx-auto max-w-7xl px-6 py-24 lg:py-32">
      <SectionHead
        eyebrow="Architecture"
        title="Browser sees. Bridge acts."
        subtitle="A clean two-process design. The web app handles vision; a tiny cross-platform Python bridge handles HID."
      />
      <div className="mt-14 grid lg:grid-cols-[1fr_auto_1fr] gap-6 items-stretch">
        <ArchBox
          icon={Eye}
          title="Browser (any modern)"
          lines={["Webcam + MediaPipe", "Gesture state machine", "60 FPS canvas loop", "Live telemetry HUD"]}
        />
        <div className="hidden lg:flex flex-col items-center justify-center gap-2">
          <div className="font-mono text-[10px] tracking-[0.3em] text-primary">WS · :8765</div>
          <div className="relative h-px w-32 bg-gradient-to-r from-transparent via-primary to-transparent">
            <div className="absolute inset-0 anim-shimmer" />
          </div>
          <div className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground">JSON intents</div>
        </div>
        <ArchBox
          icon={Cpu}
          title="Cross-platform Bridge"
          lines={["PyAutoGUI (Win/macOS/Linux)", "Moves real OS cursor", "Click / drag / scroll / keys", "Heartbeat + kill switch"]}
        />
      </div>
      <div className="mt-12 grid sm:grid-cols-3 gap-4">
        <FilePill path="src/lib/omnipoint/GestureEngine.ts" note="Vision + state machine" />
        <FilePill path="src/lib/omnipoint/HIDBridge.ts" note="WebSocket + heartbeat" />
        <FilePill path="bridge/omnipoint_bridge.py" note="PyAutoGUI bridge · cross-platform" />
      </div>
    </section>
  );
}

const REPO_BRIDGE = "https://github.com/muazbinshafi/airtouch-v8/tree/main/bridge";
const REPO_BRIDGE_PY = "https://github.com/muazbinshafi/airtouch-v8/blob/main/bridge/omnipoint_bridge.py";
const REPO_BRIDGE_REQ = "https://github.com/muazbinshafi/airtouch-v8/blob/main/bridge/requirements.txt";
const REPO_BRIDGE_README = "https://github.com/muazbinshafi/airtouch-v8/blob/main/bridge/README.md";

function BridgeSection() {
  const platforms = [
    {
      id: "linux",
      icon: Cpu,
      name: "Linux · Kali · Ubuntu",
      tag: "Recommended for tinkerers",
      install: "sudo apt install python3-venv python3-pip\ncd bridge\npython3 -m venv .venv && source .venv/bin/activate\npip install -r requirements.txt\npython3 omnipoint_bridge.py",
      note: "Wayland users: switch to an X11 session — PyAutoGUI requires X.",
    },
    {
      id: "windows",
      icon: Terminal,
      name: "Windows 10 / 11",
      tag: "PowerShell · no admin needed",
      install: "cd bridge\npython -m venv .venv\n.venv\\Scripts\\activate\npip install -r requirements.txt\npython omnipoint_bridge.py",
      note: "Allow Python through the firewall on first run.",
    },
    {
      id: "macos",
      icon: Apple,
      name: "macOS 12+",
      tag: "Apple Silicon & Intel",
      install: "cd bridge\npython3 -m venv .venv && source .venv/bin/activate\npip install -r requirements.txt\npython3 omnipoint_bridge.py",
      note: "Grant Accessibility permission to Terminal in System Settings.",
    },
  ];

  return (
    <section id="bridge" className="border-t border-border bg-secondary/20">
      <div className="mx-auto max-w-7xl px-6 py-24 lg:py-32">
        <SectionHead
          eyebrow="OS Bridge"
          title="One tiny daemon. Real OS control."
          subtitle="A 200-line Python WebSocket server lives in /bridge on GitHub. It listens on ws://localhost:8765 and turns gesture intents into kernel-level mouse and keyboard events on Windows, macOS, and any Linux distro — including Kali."
        />

        <div className="mt-10 grid sm:grid-cols-3 gap-3">
          <a href={REPO_BRIDGE_PY} target="_blank" rel="noopener noreferrer" className="panel p-4 hover:border-primary/40 transition-colors group">
            <div className="flex items-center gap-2 mb-2">
              <Server className="w-4 h-4 text-primary" />
              <span className="font-mono text-xs text-foreground">omnipoint_bridge.py</span>
            </div>
            <p className="text-xs text-muted-foreground">WebSocket server · PyAutoGUI · heartbeat · kill switch</p>
            <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-mono tracking-[0.2em] text-primary group-hover:underline">
              VIEW SOURCE <ExternalLink className="w-3 h-3" />
            </span>
          </a>
          <a href={REPO_BRIDGE_REQ} target="_blank" rel="noopener noreferrer" className="panel p-4 hover:border-primary/40 transition-colors group">
            <div className="flex items-center gap-2 mb-2">
              <Layers className="w-4 h-4 text-primary" />
              <span className="font-mono text-xs text-foreground">requirements.txt</span>
            </div>
            <p className="text-xs text-muted-foreground">websockets · pyautogui — that's the whole dep tree.</p>
            <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-mono tracking-[0.2em] text-primary group-hover:underline">
              VIEW SOURCE <ExternalLink className="w-3 h-3" />
            </span>
          </a>
          <a href={REPO_BRIDGE_README} target="_blank" rel="noopener noreferrer" className="panel p-4 hover:border-primary/40 transition-colors group">
            <div className="flex items-center gap-2 mb-2">
              <Github className="w-4 h-4 text-primary" />
              <span className="font-mono text-xs text-foreground">README.md</span>
            </div>
            <p className="text-xs text-muted-foreground">Per-OS install notes, troubleshooting, packet schema.</p>
            <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-mono tracking-[0.2em] text-primary group-hover:underline">
              VIEW SOURCE <ExternalLink className="w-3 h-3" />
            </span>
          </a>
        </div>

        <div className="mt-10 grid lg:grid-cols-3 gap-5">
          {platforms.map((p) => {
            const Icon = p.icon;
            return (
              <Link
                key={p.id}
                to={`/bridge/${p.id}`}
                aria-label={`Open the full ${p.name} install guide`}
                className="panel-elevated p-6 flex flex-col text-left transition-all hover:border-primary/50 hover:-translate-y-0.5 hover:shadow-lg group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-gradient-primary flex items-center justify-center shadow-md">
                    <Icon className="w-5 h-5 text-white" strokeWidth={2.2} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-display text-base text-foreground">{p.name}</h3>
                    <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">{p.tag}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </div>
                <pre className="flex-1 p-3 font-mono text-[11.5px] text-foreground/90 bg-card border border-border overflow-x-auto leading-relaxed rounded-md">{p.install}</pre>
                <p className="mt-3 text-xs text-muted-foreground flex items-start gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
                  {p.note}
                </p>
                <span className="mt-4 inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.25em] text-primary group-hover:underline">
                  OPEN FULL GUIDE <ArrowRight className="w-3 h-3" />
                </span>
              </Link>
            );
          })}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link to="/bridge" className="btn-primary h-11 px-5 text-sm">
            <Cpu className="w-4 h-4" />
            Guided installer
            <ArrowRight className="w-4 h-4" />
          </Link>
          <a href={REPO_BRIDGE} target="_blank" rel="noopener noreferrer" className="btn-ghost h-11 px-5 text-sm">
            <Github className="w-4 h-4" />
            Browse /bridge on GitHub
          </a>
          <Link to="/demo" className="btn-ghost h-11 px-5 text-sm">
            <Play className="w-4 h-4 fill-current" />
            Skip — try browser-only
          </Link>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          No bridge? No problem. Browser-only mode runs the demo with an in-page cursor and paint canvas — works on Kali, Chromebooks, even iPad.
        </p>
      </div>
    </section>
  );
}

function ArchBox({ icon: Icon, title, lines }: { icon: typeof Eye; title: string; lines: string[] }) {
  return (
    <div className="panel-elevated p-7">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-lg bg-gradient-primary flex items-center justify-center shadow-md">
          <Icon className="w-5 h-5 text-white" strokeWidth={2.2} />
        </div>
        <h3 className="font-display text-lg text-foreground">{title}</h3>
      </div>
      <ul className="space-y-2.5">
        {lines.map((l) => (
          <li key={l} className="flex items-start gap-2.5 text-sm text-muted-foreground">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-gradient-primary shrink-0" />
            {l}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FilePill({ path, note }: { path: string; note: string }) {
  return (
    <div className="panel p-4">
      <div className="font-mono text-xs text-gradient break-all font-medium">{path}</div>
      <div className="text-muted-foreground mt-1 text-xs">{note}</div>
    </div>
  );
}

function Quickstart() {
  return (
    <section id="quickstart" className="border-t border-border bg-secondary/30">
      <div className="mx-auto max-w-7xl px-6 py-24 lg:py-32">
        <SectionHead
          eyebrow="Quickstart"
          title="Up and running in 60 seconds."
          subtitle="The browser demo works standalone on any device. Add the Python bridge for full system-wide OS control on Windows, macOS or Linux."
        />
        <div className="mt-14 grid lg:grid-cols-2 gap-5">
          <CodeBlock
            step="01"
            title="Run the cross-platform bridge"
            code={`cd bridge
python3 -m venv .venv
# Windows: .venv\\Scripts\\activate
source .venv/bin/activate
pip install -r requirements.txt
python3 omnipoint_bridge.py`}
          />
          <CodeBlock
            step="02"
            title="Open the web app"
            code={`# Visit your deployment URL in Chromium
# or run locally:
npm install
npm run dev

# Click "Launch demo" and grant camera access`}
          />
        </div>
      </div>
    </section>
  );
}

function CodeBlock({ step, title, code }: { step: string; title: string; code: string }) {
  return (
    <div className="panel-elevated overflow-hidden">
      <div className="border-b border-border px-5 h-12 flex items-center justify-between bg-secondary/50">
        <div className="flex items-center gap-3">
          <span className="w-7 h-7 rounded-md bg-gradient-primary text-primary-foreground font-mono text-xs flex items-center justify-center shadow-sm">
            {step}
          </span>
          <span className="font-display text-sm text-foreground">{title}</span>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground tracking-[0.2em]">SHELL</span>
      </div>
      <pre className="p-5 font-mono text-[12.5px] text-foreground/90 overflow-x-auto leading-relaxed bg-card">{code}</pre>
    </div>
  );
}

function CTA() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-24">
      <div className="relative panel-elevated overflow-hidden p-10 sm:p-14 bg-mesh">
        <div className="relative z-10 max-w-2xl">
          <div className="chip mb-5">
            <Sparkles className="w-3 h-3" />
            Ready when you are
          </div>
          <h2 className="font-display text-3xl sm:text-5xl leading-tight">
            Give your mouse a <span className="text-gradient">break</span>.
          </h2>
          <p className="mt-4 text-muted-foreground text-lg max-w-lg">
            Try the browser demo in under a minute — no install, no signup required.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/demo" className="btn-primary h-12 px-6 text-sm">
              <Play className="w-4 h-4 fill-current" />
              Launch the demo
            </Link>
            <Link to="/guide" className="btn-ghost h-12 px-6 text-sm">
              Read the guide
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
        <div className="absolute -right-20 -bottom-20 w-80 h-80 rounded-full bg-gradient-primary opacity-20 blur-3xl" />
        <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-[hsl(var(--accent))] opacity-15 blur-2xl" />
      </div>
    </section>
  );
}

function SectionHead({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <div className="max-w-2xl">
      <div className="chip mb-4">{eyebrow}</div>
      <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl text-foreground leading-[1.1]">
        {title}
      </h2>
      {subtitle && <p className="mt-4 text-muted-foreground text-lg">{subtitle}</p>}
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-7xl px-6 py-10 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-gradient-primary flex items-center justify-center">
            <Hand className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-display text-sm">BreezeControl</span>
          <span className="text-xs text-muted-foreground">· Open source · MIT</span>
        </div>
        <div className="flex items-center gap-6 text-sm text-muted-foreground flex-wrap">
          <Link to="/demo" className="hover:text-foreground transition-colors">Demo</Link>
          <Link to="/guide" className="hover:text-foreground transition-colors">Guide</Link>
          <Link to="/install" className="hover:text-foreground transition-colors">Install</Link>
          <a href="#quickstart" className="hover:text-foreground transition-colors">Docs</a>
          <a href="https://github.com/muazbinshafi/airtouch-v8" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors flex items-center gap-1.5">
            <Github className="w-4 h-4" /> GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}

export default Index;

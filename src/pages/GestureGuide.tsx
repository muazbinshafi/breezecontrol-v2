import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { ThemeSettings, ThemeToggleQuick } from "@/components/ThemeSettings";

const GestureGuide = () => {
  useEffect(() => {
    document.title = "Gesture Guide — BreezeControl";
    const setMeta = (name: string, content: string) => {
      let tag = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute("name", name);
        document.head.appendChild(tag);
      }
      tag.content = content;
    };
    setMeta("description", "Animated guide to BreezeControl hand gestures: cursor, click, drag, scroll, idle and emergency stop.");
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Header />
      <section className="mx-auto max-w-7xl px-6 pt-16 pb-8">
        <div className="chip mb-5">
          <span className="w-1.5 h-1.5 rounded-full bg-primary led" />
          Interactive tutorial · v1.0
        </div>
        <h1 className="font-display text-4xl sm:text-6xl leading-[1.05] max-w-3xl">
          Learn the gestures with <span className="text-gradient">live animations</span>.
        </h1>
        <p className="mt-5 max-w-2xl text-muted-foreground text-lg leading-relaxed">
          Each card below demonstrates exactly how your hand should move. Practice in front
          of the camera until the on-screen telemetry matches the gesture name.
        </p>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-24 grid gap-5 md:grid-cols-2 lg:grid-cols-3 auto-rows-fr">
        <GestureCard index={0} step="01" name="POINT" action="Track / hover"
          tip="Extend only your index finger. The cursor follows your fingertip — no clicks emitted.">
          <PointAnim />
        </GestureCard>
        <GestureCard index={1} step="02" name="INDEX MOVE" action="Move cursor"
          tip="Keep your wrist relaxed. Slow movements = pixel precision.">
          <IndexMoveAnim />
        </GestureCard>
        <GestureCard index={2} step="03" name="PINCH" action="Left click"
          tip="Tap thumb + index briefly. Release within ~200 ms to register a click.">
          <PinchAnim />
        </GestureCard>
        <GestureCard index={3} step="04" name="THREE-FINGER PINCH" action="Right click"
          tip="Touch thumb to BOTH index and middle fingertips together. Opens context menus.">
          <RightClickAnim />
        </GestureCard>
        <GestureCard index={4} step="05" name="SUSTAINED PINCH" action="Drag"
          tip="Hold the pinch and move. Release to drop.">
          <DragAnim />
        </GestureCard>
        <GestureCard index={5} step="06" name="TWO-FINGER SCROLL" action="Scroll up / down"
          tip="Extend index + middle. Move them up to scroll up, down to scroll down.">
          <ScrollAnim />
        </GestureCard>
        <GestureCard index={6} step="07" name="THUMBS UP" action="Confirm / OK"
          tip="Thumb up, all other fingers folded. Useful for confirmations and dismissing dialogs.">
          <ThumbsUpAnim />
        </GestureCard>
        <GestureCard index={7} step="08" name="OPEN PALM" action="Idle / park"
          tip="Spread all five fingers to release input safely.">
          <PalmAnim />
        </GestureCard>
        <GestureCard index={8} step="09" name="FIST" action="Emergency stop"
          tip="Make a tight fist for 500 ms to instantly disable the bridge.">
          <FistAnim />
        </GestureCard>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-24">
        <div className="panel-elevated p-8 sm:p-12 bg-mesh relative overflow-hidden">
          <div className="relative z-10">
            <div className="chip mb-4">▣ Ready?</div>
            <h2 className="font-display text-3xl sm:text-4xl">Try it live.</h2>
            <p className="mt-3 text-muted-foreground max-w-xl text-lg">
              Launch the demo, allow camera access, and start with INDEX MOVE.
              The telemetry panel on the right tells you exactly which gesture is detected.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/demo" className="btn-primary h-12 px-6 text-sm">
                ▶ Launch demo
              </Link>
              <Link to="/" className="btn-ghost h-12 px-6 text-sm">
                ← Back home
              </Link>
            </div>
          </div>
          <div className="absolute -right-20 -bottom-20 w-80 h-80 rounded-full bg-gradient-primary opacity-20 blur-3xl" />
        </div>
      </section>
    </main>
  );
};

function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl flex items-center justify-between px-6 h-16">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="relative w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center shadow-md">
            <span className="font-mono text-xs text-white font-bold">O</span>
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-display text-[15px]">BreezeControl</span>
            <span className="font-mono text-[9px] tracking-[0.25em] text-muted-foreground -mt-0.5">GUIDE</span>
          </div>
        </Link>
        <nav className="hidden sm:flex items-center gap-8 text-sm font-medium text-muted-foreground">
          <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
          <Link to="/guide" className="text-foreground">Guide</Link>
          <Link to="/demo" className="hover:text-foreground transition-colors">Demo</Link>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggleQuick />
          <ThemeSettings variant="inline" />
          <Link to="/demo" className="btn-primary h-10 px-4 text-sm">
            ▶ Launch
          </Link>
        </div>
      </div>
    </header>
  );
}

function GestureCard({
  step, name, action, tip, children, index = 0,
}: {
  step: string;
  name: string;
  action: string;
  tip: string;
  children: React.ReactNode;
  index?: number;
}) {
  const [playing, setPlaying] = useState(true);
  return (
    <article
      className="panel hover-lift overflow-hidden flex flex-col group animate-fade-in focus-within:ring-2 focus-within:ring-primary/40"
      style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
    >
      {/* Header strip — consistent 44px height */}
      <header className="flex items-center justify-between border-b border-border px-4 h-11 bg-secondary/50">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground tabular-nums">
            {step}
          </span>
          <span className="w-px h-3.5 bg-border" />
          <span className="font-display text-[13px] truncate">{name}</span>
        </div>
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-card"
          aria-label={playing ? "Pause animation" : "Play animation"}
        >
          {playing ? "❚❚ PAUSE" : "▶ PLAY"}
        </button>
      </header>

      {/* Stage — fixed 16:9 with consistent inner padding */}
      <div
        className={`relative aspect-video overflow-hidden bg-gradient-to-br from-secondary/40 via-card to-secondary/40 dot-grid transition-opacity duration-200 ${
          playing ? "" : "opacity-60"
        }`}
      >
        <div className="absolute inset-3 transition-transform duration-300 group-hover:scale-[1.02]" style={{ animationPlayState: playing ? "running" : "paused" }}>
          <div className="relative w-full h-full">{children}</div>
        </div>
        <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-card/80 backdrop-blur border border-border text-[9px] font-mono tracking-[0.18em] text-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-primary led anim-pulse-soft" />
          LIVE
        </span>
      </div>

      {/* Body — consistent padding and typography */}
      <div className="p-5 flex-1 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <span className="font-display text-[15px] text-gradient leading-tight">{action}</span>
          <ArrowIcon />
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{tip}</p>
      </div>
    </article>
  );
}

function ArrowIcon() {
  return (
    <span aria-hidden className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
      <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14M13 5l7 7-7 7" />
      </svg>
    </span>
  );
}

/* ------------------------------- ANIMATIONS ------------------------------- */
/* Each animation is an inline SVG with CSS keyframes scoped via <style>.    */

function IndexMoveAnim() {
  return (
    <svg viewBox="0 0 200 120" className="absolute inset-0 w-full h-full">
      <style>{`
        .gm-hand { animation: gm-move 4s ease-in-out infinite; transform-origin: center; }
        @keyframes gm-move {
          0%   { transform: translate(-30px, 10px); }
          50%  { transform: translate(30px, -15px); }
          100% { transform: translate(-30px, 10px); }
        }
        .gm-cursor { animation: gm-cursor 4s ease-in-out infinite; }
        @keyframes gm-cursor {
          0%   { transform: translate(40px, 80px); }
          50%  { transform: translate(140px, 40px); }
          100% { transform: translate(40px, 80px); }
        }
        .gm-trail { stroke-dasharray: 4 6; animation: gm-dash 1s linear infinite; }
        @keyframes gm-dash { to { stroke-dashoffset: -20; } }
      `}</style>
      <path d="M 40 80 Q 90 30 140 40" fill="none" stroke="hsl(var(--primary) / 0.6)" strokeWidth="0.8" className="gm-trail" />
      <g className="gm-hand">
        <Hand pointing />
      </g>
      <g className="gm-cursor">
        <path d="M 0 0 L 0 12 L 3 9 L 6 14 L 8 13 L 5 8 L 9 8 Z" fill="hsl(var(--primary))" stroke="hsl(var(--background))" strokeWidth="0.5" />
      </g>
    </svg>
  );
}

function PinchAnim() {
  return (
    <svg viewBox="0 0 200 120" className="absolute inset-0 w-full h-full">
      <style>{`
        .pn-thumb { animation: pn-thumb 1.6s ease-in-out infinite; transform-origin: 100px 70px; }
        .pn-index { animation: pn-index 1.6s ease-in-out infinite; transform-origin: 100px 70px; }
        @keyframes pn-thumb { 0%,100% { transform: rotate(-18deg); } 45%,55% { transform: rotate(0deg); } }
        @keyframes pn-index { 0%,100% { transform: rotate(18deg); } 45%,55% { transform: rotate(0deg); } }
        .pn-spark { opacity: 0; animation: pn-spark 1.6s ease-in-out infinite; transform-origin: center; }
        @keyframes pn-spark { 45% { opacity: 0; transform: scale(0.4);} 50% { opacity: 1; transform: scale(1.6);} 60% { opacity: 0; transform: scale(2);} }
        .pn-click { opacity: 0; animation: pn-click 1.6s ease-in-out infinite; }
        @keyframes pn-click { 50% { opacity: 1; } 70% { opacity: 0; } }
      `}</style>
      <g transform="translate(100 70)">
        <line className="pn-index" x1="0" y1="0" x2="0" y2="-40" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" />
        <line className="pn-thumb" x1="0" y1="0" x2="-22" y2="-30" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" />
        <circle cx="0" cy="0" r="8" fill="hsl(var(--primary) / 0.3)" stroke="hsl(var(--primary))" strokeWidth="1" />
      </g>
      <g transform="translate(100 30)">
        <circle className="pn-spark" r="6" fill="hsl(var(--primary) / 0.6)" />
        <circle className="pn-spark" r="3" fill="hsl(var(--primary))" />
      </g>
      <text x="100" y="108" textAnchor="middle" className="pn-click" fill="hsl(var(--primary))" fontFamily="ui-monospace, monospace" fontSize="9" letterSpacing="3">CLICK</text>
    </svg>
  );
}

function DragAnim() {
  return (
    <svg viewBox="0 0 200 120" className="absolute inset-0 w-full h-full">
      <style>{`
        .dg-hand { animation: dg-move 3.5s ease-in-out infinite; }
        @keyframes dg-move {
          0%   { transform: translate(20px, 60px); }
          100% { transform: translate(120px, 30px); }
        }
        .dg-box { animation: dg-box 3.5s ease-in-out infinite; }
        @keyframes dg-box {
          0%   { transform: translate(20px, 60px); }
          100% { transform: translate(120px, 30px); }
        }
      `}</style>
      <rect x="20" y="20" width="40" height="30" fill="none" stroke="hsl(var(--border))" strokeDasharray="3 3" strokeWidth="0.5" />
      <g className="dg-box">
        <rect x="-10" y="-15" width="40" height="30" fill="hsl(var(--primary) / 0.2)" stroke="hsl(var(--primary))" strokeWidth="0.8" />
      </g>
      <g className="dg-hand">
        <circle r="8" fill="hsl(var(--primary) / 0.3)" stroke="hsl(var(--primary))" strokeWidth="1" />
        <line x1="0" y1="0" x2="0" y2="-25" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" />
        <line x1="0" y1="0" x2="-15" y2="-20" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" />
      </g>
      <text x="100" y="110" textAnchor="middle" fill="hsl(var(--primary))" fontFamily="ui-monospace, monospace" fontSize="9" letterSpacing="3">HOLD + MOVE</text>
    </svg>
  );
}

function ScrollAnim() {
  return (
    <svg viewBox="0 0 200 120" className="absolute inset-0 w-full h-full">
      <style>{`
        .sc-fingers { animation: sc-fingers 2.4s ease-in-out infinite; transform-origin: 100px 90px; }
        @keyframes sc-fingers {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-30px); }
        }
        .sc-line { stroke-dasharray: 3 4; animation: sc-dash 0.8s linear infinite; }
        @keyframes sc-dash { to { stroke-dashoffset: -14; } }
        .sc-arrow-up { animation: sc-up 2.4s ease-in-out infinite; }
        .sc-arrow-down { animation: sc-down 2.4s ease-in-out infinite; }
        @keyframes sc-up { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0.15; } }
        @keyframes sc-down { 0%, 50% { opacity: 0.15; } 51%, 100% { opacity: 1; } }
      `}</style>
      <line x1="100" y1="20" x2="100" y2="100" stroke="hsl(var(--primary) / 0.4)" strokeWidth="0.6" className="sc-line" />
      <g transform="translate(40 60)" className="sc-arrow-up">
        <path d="M 0 0 L 8 -8 L 16 0" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" />
        <text x="8" y="14" textAnchor="middle" fill="hsl(var(--primary))" fontFamily="ui-monospace, monospace" fontSize="7" letterSpacing="2">UP</text>
      </g>
      <g transform="translate(150 60)" className="sc-arrow-down">
        <path d="M 0 0 L 8 8 L 16 0" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" />
        <text x="8" y="-4" textAnchor="middle" fill="hsl(var(--primary))" fontFamily="ui-monospace, monospace" fontSize="7" letterSpacing="2">DN</text>
      </g>
      <g className="sc-fingers">
        <line x1="92" y1="90" x2="92" y2="50" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" />
        <line x1="108" y1="90" x2="108" y2="50" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" />
        <circle cx="100" cy="92" r="10" fill="hsl(var(--primary) / 0.3)" stroke="hsl(var(--primary))" strokeWidth="1" />
      </g>
    </svg>
  );
}

function PalmAnim() {
  return (
    <svg viewBox="0 0 200 120" className="absolute inset-0 w-full h-full">
      <style>{`
        .pl-pulse { animation: pl-pulse 2.5s ease-in-out infinite; transform-origin: 100px 65px; }
        @keyframes pl-pulse { 0%,100% { transform: scale(1);} 50% { transform: scale(1.05);} }
        .pl-ring { animation: pl-ring 2.5s ease-out infinite; transform-origin: 100px 65px; }
        @keyframes pl-ring { 0% { opacity: 0.6; transform: scale(0.6);} 100% { opacity: 0; transform: scale(2);} }
      `}</style>
      <circle cx="100" cy="65" r="30" fill="none" stroke="hsl(var(--primary))" strokeWidth="1" className="pl-ring" />
      <g className="pl-pulse">
        {/* palm */}
        <circle cx="100" cy="70" r="14" fill="hsl(var(--primary) / 0.25)" stroke="hsl(var(--primary))" strokeWidth="1" />
        {/* 5 fingers */}
        <line x1="100" y1="70" x2="78" y2="55" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" />
        <line x1="100" y1="70" x2="88" y2="35" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" />
        <line x1="100" y1="70" x2="100" y2="28" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" />
        <line x1="100" y1="70" x2="112" y2="35" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" />
        <line x1="100" y1="70" x2="122" y2="55" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" />
      </g>
      <text x="100" y="110" textAnchor="middle" fill="hsl(var(--primary))" fontFamily="ui-monospace, monospace" fontSize="9" letterSpacing="3">IDLE / PARK</text>
    </svg>
  );
}

function FistAnim() {
  return (
    <svg viewBox="0 0 200 120" className="absolute inset-0 w-full h-full">
      <style>{`
        .fs-fist { animation: fs-shake 0.6s ease-in-out infinite; transform-origin: 100px 65px; }
        @keyframes fs-shake { 0%,100% { transform: translateX(0);} 25% { transform: translateX(-2px);} 75% { transform: translateX(2px);} }
        .fs-flash { animation: fs-flash 1s ease-in-out infinite; }
        @keyframes fs-flash { 0%,100% { opacity: 0.3;} 50% { opacity: 1;} }
      `}</style>
      <rect x="40" y="15" width="120" height="90" fill="none" stroke="hsl(var(--destructive) / 0.5)" strokeWidth="0.8" strokeDasharray="4 4" className="fs-flash" />
      <g className="fs-fist">
        <circle cx="100" cy="65" r="22" fill="hsl(var(--destructive) / 0.25)" stroke="hsl(var(--destructive))" strokeWidth="1.5" />
        <path d="M 82 60 Q 100 50 118 60 L 116 78 Q 100 84 84 78 Z" fill="hsl(var(--destructive) / 0.4)" stroke="hsl(var(--destructive))" strokeWidth="1" />
      </g>
      <text x="100" y="110" textAnchor="middle" fill="hsl(var(--destructive))" fontFamily="ui-monospace, monospace" fontSize="9" letterSpacing="3" className="fs-flash">⚠ EMERGENCY STOP</text>
    </svg>
  );
}

function PointAnim() {
  return (
    <svg viewBox="0 0 200 120" className="absolute inset-0 w-full h-full">
      <style>{`
        .pt-pulse { animation: pt-pulse 2s ease-in-out infinite; transform-origin: 100px 30px; }
        @keyframes pt-pulse { 0%,100% { opacity: 0.4; transform: scale(1);} 50% { opacity: 1; transform: scale(1.2);} }
        .pt-ray { stroke-dasharray: 3 4; animation: pt-dash 0.8s linear infinite; }
        @keyframes pt-dash { to { stroke-dashoffset: -14; } }
      `}</style>
      <line x1="100" y1="30" x2="100" y2="80" stroke="hsl(var(--primary) / 0.5)" strokeWidth="0.6" className="pt-ray" />
      <circle cx="100" cy="30" r="6" fill="none" stroke="hsl(var(--primary))" strokeWidth="1" className="pt-pulse" />
      <circle cx="100" cy="30" r="2.5" fill="hsl(var(--primary))" />
      <g transform="translate(100 80)">
        <line x1="0" y1="0" x2="0" y2="-45" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" />
        <circle cx="0" cy="5" r="12" fill="hsl(var(--primary) / 0.25)" stroke="hsl(var(--primary))" strokeWidth="1" />
        <line x1="0" y1="5" x2="-10" y2="-3" stroke="hsl(var(--primary) / 0.5)" strokeWidth="2" strokeLinecap="round" />
        <line x1="0" y1="5" x2="10" y2="-3" stroke="hsl(var(--primary) / 0.5)" strokeWidth="2" strokeLinecap="round" />
        <line x1="0" y1="5" x2="13" y2="6" stroke="hsl(var(--primary) / 0.5)" strokeWidth="2" strokeLinecap="round" />
      </g>
      <text x="100" y="112" textAnchor="middle" fill="hsl(var(--primary))" fontFamily="ui-monospace, monospace" fontSize="9" letterSpacing="3">HOVER ONLY</text>
    </svg>
  );
}

function RightClickAnim() {
  return (
    <svg viewBox="0 0 200 120" className="absolute inset-0 w-full h-full">
      <style>{`
        .rc-thumb { animation: rc-thumb 1.8s ease-in-out infinite; transform-origin: 100px 70px; }
        .rc-index { animation: rc-index 1.8s ease-in-out infinite; transform-origin: 100px 70px; }
        .rc-middle { animation: rc-middle 1.8s ease-in-out infinite; transform-origin: 100px 70px; }
        @keyframes rc-thumb { 0%,100% { transform: rotate(-22deg); } 45%,55% { transform: rotate(0deg); } }
        @keyframes rc-index  { 0%,100% { transform: rotate(10deg); } 45%,55% { transform: rotate(0deg); } }
        @keyframes rc-middle { 0%,100% { transform: rotate(28deg); } 45%,55% { transform: rotate(8deg); } }
        .rc-menu { opacity: 0; animation: rc-menu 1.8s ease-in-out infinite; }
        @keyframes rc-menu { 50% { opacity: 1; } 80% { opacity: 0; } }
      `}</style>
      <g transform="translate(100 70)">
        <line className="rc-index" x1="0" y1="0" x2="0" y2="-42" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" />
        <line className="rc-middle" x1="0" y1="0" x2="6" y2="-38" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" />
        <line className="rc-thumb" x1="0" y1="0" x2="-22" y2="-30" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" />
        <circle cx="0" cy="0" r="9" fill="hsl(var(--primary) / 0.3)" stroke="hsl(var(--primary))" strokeWidth="1" />
      </g>
      <g transform="translate(130 25)" className="rc-menu">
        <rect x="0" y="0" width="50" height="42" fill="hsl(var(--card))" stroke="hsl(var(--primary))" strokeWidth="0.8" />
        <line x1="4" y1="12" x2="46" y2="12" stroke="hsl(var(--primary) / 0.4)" strokeWidth="0.5" />
        <line x1="4" y1="22" x2="46" y2="22" stroke="hsl(var(--primary) / 0.4)" strokeWidth="0.5" />
        <line x1="4" y1="32" x2="46" y2="32" stroke="hsl(var(--primary) / 0.4)" strokeWidth="0.5" />
      </g>
      <text x="100" y="112" textAnchor="middle" fill="hsl(var(--primary))" fontFamily="ui-monospace, monospace" fontSize="9" letterSpacing="3">RIGHT CLICK</text>
    </svg>
  );
}

function ThumbsUpAnim() {
  return (
    <svg viewBox="0 0 200 120" className="absolute inset-0 w-full h-full">
      <style>{`
        .tu-hand { animation: tu-bob 2s ease-in-out infinite; transform-origin: 100px 70px; }
        @keyframes tu-bob { 0%,100% { transform: translateY(0);} 50% { transform: translateY(-6px);} }
        .tu-spark { animation: tu-spark 2s ease-in-out infinite; transform-origin: 100px 25px; }
        @keyframes tu-spark { 0%,100% { opacity: 0.3; transform: scale(0.9);} 50% { opacity: 1; transform: scale(1.2);} }
      `}</style>
      <g className="tu-spark">
        <path d="M 100 18 L 102 25 L 109 25 L 103 29 L 105 36 L 100 32 L 95 36 L 97 29 L 91 25 L 98 25 Z"
              fill="hsl(var(--primary))" />
      </g>
      <g className="tu-hand">
        <circle cx="100" cy="80" r="18" fill="hsl(var(--primary) / 0.3)" stroke="hsl(var(--primary))" strokeWidth="1.2" />
        {/* thumb up */}
        <line x1="100" y1="62" x2="100" y2="42" stroke="hsl(var(--primary))" strokeWidth="6" strokeLinecap="round" />
        {/* folded fingers */}
        <path d="M 86 75 Q 84 68 90 66 L 110 66 Q 116 68 114 75 Z"
              fill="hsl(var(--primary) / 0.5)" stroke="hsl(var(--primary))" strokeWidth="0.8" />
      </g>
      <text x="100" y="112" textAnchor="middle" fill="hsl(var(--primary))" fontFamily="ui-monospace, monospace" fontSize="9" letterSpacing="3">CONFIRM / OK</text>
    </svg>
  );
}

function Hand({ pointing = false }: { pointing?: boolean }) {
  return (
    <g transform="translate(100 60)">
      <circle cx="0" cy="10" r="12" fill="hsl(var(--primary) / 0.25)" stroke="hsl(var(--primary))" strokeWidth="1" />
      {pointing ? (
        <>
          <line x1="0" y1="10" x2="0" y2="-22" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" />
          <circle cx="0" cy="-22" r="2.5" fill="hsl(var(--primary))" />
        </>
      ) : null}
      <line x1="0" y1="10" x2="-12" y2="-6" stroke="hsl(var(--primary) / 0.6)" strokeWidth="2" strokeLinecap="round" />
      <line x1="0" y1="10" x2="10" y2="-4" stroke="hsl(var(--primary) / 0.6)" strokeWidth="2" strokeLinecap="round" />
      <line x1="0" y1="10" x2="14" y2="2" stroke="hsl(var(--primary) / 0.6)" strokeWidth="2" strokeLinecap="round" />
    </g>
  );
}

export default GestureGuide;

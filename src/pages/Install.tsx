// Install page — explains the Add to Home Screen flow on Android & iOS and
// triggers the native install prompt when the browser exposes one.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Smartphone, Apple, Share2, Plus, Check } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const Install = () => {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop">("desktop");

  useEffect(() => {
    document.title = "Install — BreezeControl";
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua)) setPlatform("ios");
    else if (/Android/.test(ua)) setPlatform("android");

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // @ts-expect-error iOS Safari only
      window.navigator.standalone === true;
    setInstalled(standalone);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setDeferred(null);
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b hairline px-4 h-14 flex items-center justify-between">
        <Link to="/" className="font-mono text-[11px] tracking-[0.3em] text-muted-foreground hover:text-foreground">
          ← BREEZECONTROL
        </Link>
        <span className="font-mono text-[10px] tracking-[0.3em] text-emerald-glow">INSTALL</span>
      </header>

      <section className="max-w-xl mx-auto px-4 py-8 sm:py-14">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 grid place-items-center border border-primary/40 bg-primary/10">
            <Download className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              Install BreezeControl
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Add it to your home screen and launch it like a native app.
            </p>
          </div>
        </div>

        {installed && (
          <div className="border border-emerald-glow/50 bg-emerald-glow/10 p-4 mb-6 flex items-center gap-3">
            <Check className="w-5 h-5 text-emerald-glow" />
            <div className="font-mono text-[12px] tracking-[0.15em] text-emerald-glow">
              ALREADY INSTALLED — launch from your home screen.
            </div>
          </div>
        )}

        {!installed && deferred && (
          <button
            onClick={handleInstall}
            className="w-full h-12 mb-6 font-mono text-[12px] tracking-[0.3em] border border-primary text-primary bg-primary/10 hover:bg-primary/20 inline-flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            INSTALL NOW
          </button>
        )}

        <div className="space-y-4">
          <PlatformCard
            active={platform === "android"}
            icon={<Smartphone className="w-5 h-5" />}
            title="Android (Chrome / Edge / Brave)"
            steps={[
              "Tap the ⋮ menu in the top-right corner.",
              'Choose "Install app" or "Add to Home screen".',
              "Confirm. The BreezeControl icon appears on your home screen.",
            ]}
          />
          <PlatformCard
            active={platform === "ios"}
            icon={<Apple className="w-5 h-5" />}
            title="iPhone / iPad (Safari)"
            steps={[
              <>
                Tap the <Share2 className="inline w-4 h-4 align-text-bottom" /> Share button at the bottom of the screen.
              </>,
              <>
                Scroll down and tap <Plus className="inline w-4 h-4 align-text-bottom" /> "Add to Home Screen".
              </>,
              'Tap "Add" in the top-right.',
            ]}
          />
          <PlatformCard
            active={platform === "desktop"}
            icon={<Download className="w-5 h-5" />}
            title="Desktop (Chrome / Edge)"
            steps={[
              "Look for the ⊕ install icon at the right edge of the address bar.",
              'Or open the ⋮ menu → "Install BreezeControl".',
              "Launch from your dock, taskbar, or start menu.",
            ]}
          />
        </div>

        <div className="mt-8 p-4 border hairline bg-card/40">
          <h2 className="font-mono text-[11px] tracking-[0.25em] text-emerald-glow mb-2">
            ▣ WHY INSTALL?
          </h2>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li>• Full-screen mode — no browser bars hiding the camera view.</li>
            <li>• Loads instantly — the model is cached after first run.</li>
            <li>• Works offline once installed (camera still requires permission).</li>
            <li>• Feels like a native app on Android, iPhone and desktop.</li>
          </ul>
        </div>

        <div className="mt-6 text-center">
          <Link
            to="/demo"
            className="font-mono text-[11px] tracking-[0.3em] text-muted-foreground hover:text-foreground underline underline-offset-4"
          >
            SKIP — JUST OPEN THE APP →
          </Link>
        </div>
      </section>
    </main>
  );
};

function PlatformCard({
  active,
  icon,
  title,
  steps,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  steps: React.ReactNode[];
}) {
  return (
    <div
      className={`border p-4 transition-colors ${
        active
          ? "border-primary/60 bg-primary/5"
          : "hairline bg-card/40"
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className={active ? "text-primary" : "text-muted-foreground"}>{icon}</span>
        <h3 className="font-mono text-[11px] tracking-[0.25em] uppercase">{title}</h3>
        {active && (
          <span className="ml-auto font-mono text-[9px] tracking-[0.3em] text-emerald-glow">
            ● YOU ARE HERE
          </span>
        )}
      </div>
      <ol className="space-y-2 text-sm text-foreground/90">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums w-5 shrink-0">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default Install;

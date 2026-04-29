import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { InitScreen } from "@/components/omnipoint/InitScreen";
import { SensorPanel } from "@/components/omnipoint/SensorPanel";
import { TelemetryPanel } from "@/components/omnipoint/TelemetryPanel";
import { BridgeTroubleshooter } from "@/components/omnipoint/BridgeTroubleshooter";
import { type ControlMode } from "@/components/omnipoint/ControlModeBar";
import { DemoTopBar } from "@/components/omnipoint/DemoTopBar";
import { GestureEngine, defaultConfig, type EngineConfig } from "@/lib/omnipoint/GestureEngine";
import { HIDBridge } from "@/lib/omnipoint/HIDBridge";
import { TelemetryStore } from "@/lib/omnipoint/TelemetryStore";
import { ThemeSettings } from "@/components/ThemeSettings";
import { PaintToolbar } from "@/components/omnipoint/PaintToolbar";
import { useBrowserCursor } from "@/hooks/useBrowserCursor";
import { CalibrationWizard } from "@/components/omnipoint/CalibrationWizard";
import { LiveCalibrationPanel, loadDetectionFloors } from "@/components/omnipoint/LiveCalibrationPanel";
import { PerformanceHUD } from "@/components/omnipoint/PerformanceHUD";
import { GestureTour } from "@/components/omnipoint/GestureTour";
import { PinchConfidenceOverlay } from "@/components/omnipoint/PinchConfidenceOverlay";
import { onEngineConfigApply } from "@/lib/omnipoint/GestureProfiles";
import { GestureSettingsStore } from "@/lib/omnipoint/GestureSettings";
import { DualHandDebugOverlay } from "@/components/omnipoint/DualHandDebugOverlay";
import { CameraSetupCheck } from "@/components/omnipoint/CameraSetupCheck";
import { BridgeStatusBanner } from "@/components/omnipoint/BridgeStatusBanner";
import { HandRoleLockToggle } from "@/components/omnipoint/HandRoleLockToggle";

const Demo = () => {
  const [initialized, setInitialized] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [status, setStatus] = useState("Awaiting operator input...");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [troubleshooterOpen, setTroubleshooterOpen] = useState(false);
  const [calibrationOpen, setCalibrationOpen] = useState(false);
  const [livePanelOpen, setLivePanelOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [pinchOverlayOn, setPinchOverlayOn] = useState(false);
  const [debugOverlayOn, setDebugOverlayOn] = useState(true);
  const [setupCheckOpen, setSetupCheckOpen] = useState(false);
  const [dualHandPassed, setDualHandPassed] = useState(false);

  const [config, setConfigState] = useState<EngineConfig>(defaultConfig);
  const [bridgeUrl, setBridgeUrl] = useState("ws://localhost:8765");
  const [controlMode, setControlMode] = useState<ControlMode>("browser");

  const engineRef = useRef<GestureEngine | null>(null);
  const bridgeRef = useRef<HIDBridge | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // The in-page browser cursor stays mounted in BOTH modes so the user can
  // still draw on the page while the bridge drives their real OS cursor.
  // Defaults to OFF in bridge mode (so it doesn't fight the OS cursor)
  // and POINTER in browser mode.
  const browserCursor = useBrowserCursor(
    initialized,
    controlMode === "bridge" ? "off" : "pointer",
  );

  useEffect(() => {
    document.title = "Live Sensor — BreezeControl";
  }, []);

  // When a profile carrying an engineConfig is activated (e.g. after cloud
  // sync hydrates on sign-in), apply that calibration to the live engine.
  useEffect(() => {
    onEngineConfigApply((cfg) => {
      setConfigState((prev) => {
        const next = { ...prev, ...cfg };
        if (engineRef.current) engineRef.current.config = next;
        return next;
      });
    });
    return () => onEngineConfigApply(null);
  }, []);

  // Hydrate from any active-profile engineConfig already loaded in localStorage.
  useEffect(() => {
    const cfg = GestureSettingsStore.get().engineConfig;
    if (cfg) {
      setConfigState((prev) => ({ ...prev, ...cfg }));
    }
  }, []);

  const setConfig = useCallback((patch: Partial<EngineConfig>) => {
    setConfigState((prev) => {
      const next = { ...prev, ...patch };
      if (engineRef.current) engineRef.current.config = next;
      // Mirror the calibration into the gesture-settings store so it rides
      // along when the user clicks "Save profile" and is synced to the cloud.
      GestureSettingsStore.patch({
        engineConfig: {
          sensitivity: next.sensitivity,
          smoothingAlpha: next.smoothingAlpha,
          clickThreshold: next.clickThreshold,
          releaseThreshold: next.releaseThreshold,
          scrollSensitivity: next.scrollSensitivity,
          aspectRatio: next.aspectRatio,
          deadZone: next.deadZone,
        },
      });
      return next;
    });
  }, []);

  const initialize = useCallback(async () => {
    setError(null);
    TelemetryStore.set({ emergencyStop: false, sensorLost: false });
    setInitializing(true);
    setStatus("Requesting camera access...");
    try {
      if (typeof window !== "undefined" && !window.isSecureContext) {
        throw new Error(
          "Camera blocked: getUserMedia requires a secure context. " +
          "Use http://localhost (not your LAN IP) or HTTPS.",
        );
      }
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "Camera API unavailable. Use a Chromium-based browser (Chrome/Edge/Brave) on the latest version.",
        );
      }
      // Try the highest-quality stream first, but fall back gracefully if the
      // webcam can't satisfy the constraints. Hard `min` values cause an
      // OverconstrainedError on many built-in laptop cameras → no detection.
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 60 },
            facingMode: "user",
          },
          audio: false,
        });
      } catch (hiErr) {
        console.warn("[BreezeControl] HD camera request failed, falling back to 720p:", hiErr);
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
          audio: false,
        });
      }
      streamRef.current = stream;
      setProgress(25);

      const video = document.getElementById("omnipoint-video") as HTMLVideoElement | null;
      const canvas = document.getElementById("omnipoint-canvas") as HTMLCanvasElement | null;
      if (!video || !canvas) throw new Error("Sensor surface not mounted");
      video.srcObject = stream;
      // Wait for metadata so width/height are known before MediaPipe inference.
      await new Promise<void>((resolve) => {
        if (video.readyState >= 1 && video.videoWidth > 0) return resolve();
        const onMeta = () => { video.removeEventListener("loadedmetadata", onMeta); resolve(); };
        video.addEventListener("loadedmetadata", onMeta);
      });
      // play() can reject when the element is briefly hidden during init —
      // swallow the rejection; the stream is attached and MediaPipe will pull
      // frames as soon as the element becomes visible.
      try { await video.play(); } catch { /* autoplay deferred — frames still flow */ }
      // Wait for at least one decoded frame so detectForVideo has data.
      await new Promise<void>((resolve) => {
        if (video.readyState >= 2) return resolve();
        const onData = () => { video.removeEventListener("loadeddata", onData); resolve(); };
        video.addEventListener("loadeddata", onData);
      });
      setProgress(45);

      const bridge = new HIDBridge(bridgeUrl);
      bridgeRef.current = bridge;
      TelemetryStore.set({ bridgeUrl });
      // In browser-only mode we bypass the WebSocket entirely — gestures
      // are consumed locally by BrowserCursor through the TelemetryStore.
      if (controlMode === "bridge") {
        bridge.connect();
      } else {
        TelemetryStore.set({
          wsState: "connected",
          bridgeValidated: true,
          bridgeProbe: "ok",
          bridgeProbeMsg: "Browser-only mode",
        });
      }

      const engine = new GestureEngine(video, canvas, bridge, config);
      engineRef.current = engine;
      setStatus("Loading vision runtime...");
      setProgress(60);
      await engine.init((m) => {
        setStatus(m);
        setProgress((p) => Math.min(95, p + 12));
      }, loadDetectionFloors());
      setProgress(100);
      setStatus("Sensor online.");
      engine.start();
      TelemetryStore.set({ initialized: true });
      setInitialized(true);
      setInitializing(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setInitializing(false);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, [bridgeUrl, config, controlMode]);

  useEffect(() => {
    if (engineRef.current) engineRef.current.config = config;
  }, [config]);

  useEffect(() => {
    TelemetryStore.set({ bridgeUrl });
  }, [bridgeUrl]);

  // React to control mode changes after init: connect / disconnect the
  // bridge and flip the validated flag accordingly.
  useEffect(() => {
    if (!initialized || !bridgeRef.current) return;
    const bridge = bridgeRef.current;
    if (controlMode === "bridge") {
      TelemetryStore.set({
        bridgeValidated: false,
        bridgeProbe: "probing",
        bridgeProbeMsg: "Switched to bridge mode — probing…",
      });
      bridge.rearm();
      bridge.setUrl(bridgeUrl);
      bridge.probe();
    } else {
      // Browser-only: stop network traffic, keep telemetry "validated" so
      // the GestureEngine still emits packets that BrowserCursor consumes.
      bridge.emergencyStop();
      TelemetryStore.set({
        wsState: "connected",
        bridgeValidated: true,
        bridgeProbe: "ok",
        bridgeProbeMsg: "Browser-only mode",
        emergencyStop: false,
      });
    }
  }, [controlMode, initialized, bridgeUrl]);

  useEffect(() => {
    return () => {
      engineRef.current?.stop();
      bridgeRef.current?.emergencyStop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const handleEmergencyToggle = useCallback(() => {
    const b = bridgeRef.current;
    if (!b) return;
    if (TelemetryStore.get().emergencyStop) {
      b.rearm();
    } else {
      b.emergencyStop();
    }
  }, []);

  const handleReconnect = useCallback(() => {
    if (!bridgeRef.current) return;
    bridgeRef.current.invalidate();
    bridgeRef.current.setUrl(bridgeUrl);
  }, [bridgeUrl]);

  const handleTestBridge = useCallback(async () => {
    if (!bridgeRef.current) {
      const tmp = new HIDBridge(bridgeUrl);
      await tmp.probe();
      return;
    }
    bridgeRef.current.setUrl(bridgeUrl);
    await bridgeRef.current.probe();
  }, [bridgeUrl]);

  const handleSetOrigin = useCallback(() => {
    engineRef.current?.setOrigin();
  }, []);

  const handleForceReset = useCallback(() => {
    engineRef.current?.resetState();
  }, []);

  // Auto-open the dual-hand setup check the first time a user is initialized
  // so they verify framing before relying on dual-hand control.
  useEffect(() => {
    if (!initialized) return;
    if (dualHandPassed) return;
    const seen = localStorage.getItem("omnipoint:dualHandSetupSeen");
    if (seen === "1") return;
    const id = window.setTimeout(() => setSetupCheckOpen(true), 1500);
    return () => window.clearTimeout(id);
  }, [initialized, dualHandPassed]);

  const showInit = !initialized;

  return (
      <main className="h-[100dvh] w-screen flex flex-col bg-background text-foreground overflow-hidden">
        <h1 className="sr-only">BreezeControl — Live Sensor</h1>
        {!showInit && (
          <DemoTopBar
            controlMode={controlMode}
            onControlModeChange={setControlMode}
            cursorMode={browserCursor.mode}
            onCursorModeChange={browserCursor.setMode}
            onClearDrawing={browserCursor.clearDrawing}
            onEmergencyToggle={handleEmergencyToggle}
            config={config}
            setConfig={setConfig}
            bridgeUrl={bridgeUrl}
            setBridgeUrl={setBridgeUrl}
            onReconnect={handleReconnect}
            onTestBridge={handleTestBridge}
            onOpenTroubleshooter={() => setTroubleshooterOpen(true)}
            onOpenTour={() => setTourOpen(true)}
            onOpenCalibration={() => setCalibrationOpen(true)}
            onOpenLivePanel={() => setLivePanelOpen((v) => !v)}
            livePanelOpen={livePanelOpen}
          />
        )}
        <div
          className={`flex-1 min-h-0 gap-2 p-2 flex ${showInit ? "invisible absolute inset-0 pointer-events-none" : ""}`}
        >
          <div className="flex-1 min-w-0 flex flex-col">
            <SensorPanel onSetOrigin={handleSetOrigin} />
          </div>
          {/* Side panel only visible on lg+ — replaced by the Sheet on mobile */}
          <div className="hidden lg:flex">
            <TelemetryPanel
              config={config}
              setConfig={setConfig}
              bridgeUrl={bridgeUrl}
              setBridgeUrl={setBridgeUrl}
              onReconnect={handleReconnect}
              onTestBridge={handleTestBridge}
              onOpenTroubleshooter={() => setTroubleshooterOpen(true)}
            />
          </div>
        </div>
        {showInit && (
          <div className="flex-1 relative">
            <div className="absolute top-3 left-3 z-50">
              <Link
                to="/"
                className="font-mono text-[10px] tracking-[0.3em] px-3 h-9 inline-flex items-center border hairline text-muted-foreground hover:text-foreground bg-card/60 backdrop-blur"
              >
                ← HOME
              </Link>
            </div>
            <InitScreen
              status={status}
              progress={progress}
              error={error}
              onInitialize={initialize}
              initializing={initializing}
              controlMode={controlMode}
              onControlModeChange={setControlMode}
            />
          </div>
        )}
        <BridgeTroubleshooter
          open={troubleshooterOpen}
          onClose={() => setTroubleshooterOpen(false)}
          bridgeUrl={bridgeUrl}
          setBridgeUrl={setBridgeUrl}
          onTestBridge={handleTestBridge}
        />
        {!showInit && (
          <BridgeStatusBanner
            active={controlMode === "bridge"}
            onReconnect={handleReconnect}
            onOpenTroubleshooter={() => setTroubleshooterOpen(true)}
          />
        )}
        {!showInit && debugOverlayOn && <DualHandDebugOverlay />}
        {!showInit && (
          <div className="fixed bottom-4 right-4 z-40 flex flex-col gap-1 font-mono text-[9px] tracking-[0.25em]">
            <HandRoleLockToggle />
            <button
              onClick={() => setSetupCheckOpen(true)}
              className="px-3 h-8 border hairline bg-card/70 backdrop-blur text-muted-foreground hover:text-foreground"
            >
              ◉ DUAL-HAND CHECK
            </button>
            <button
              onClick={() => setDebugOverlayOn((v) => !v)}
              className="px-3 h-8 border hairline bg-card/70 backdrop-blur text-muted-foreground hover:text-foreground"
            >
              {debugOverlayOn ? "✕ HIDE DEBUG" : "● SHOW DEBUG"}
            </button>
          </div>
        )}
        <CameraSetupCheck
          open={setupCheckOpen}
          onClose={() => {
            setSetupCheckOpen(false);
            localStorage.setItem("omnipoint:dualHandSetupSeen", "1");
          }}
          onPass={() => {
            setDualHandPassed(true);
            localStorage.setItem("omnipoint:dualHandSetupSeen", "1");
          }}
        />
        {!showInit && browserCursor.mode === "draw" && (
          <>
            <PaintToolbar
              onClear={browserCursor.clearDrawing}
              onUndo={browserCursor.undo}
              onRedo={browserCursor.redo}
              onSave={browserCursor.saveAsPng}
              onCrop={browserCursor.cropSelection}
              onTogglePinchOverlay={() => setPinchOverlayOn((v) => !v)}
              pinchOverlayOn={pinchOverlayOn}
              getCanvas={browserCursor.getCanvas}
            />
            <PinchConfidenceOverlay
              visible={pinchOverlayOn}
              onClose={() => setPinchOverlayOn(false)}
            />
          </>
        )}
        <ThemeSettings variant="floating" />
        {!showInit && <PerformanceHUD />}
        {!showInit && (
          <CalibrationWizard
            forceOpen={calibrationOpen}
            config={config}
            setConfig={setConfig}
            onSetOrigin={handleSetOrigin}
            onClose={() => setCalibrationOpen(false)}
          />
        )}
        {!showInit && (
          <GestureTour
            forceOpen={tourOpen}
            onClose={() => setTourOpen(false)}
            autoShow
          />
        )}
        {!showInit && (
          <LiveCalibrationPanel
            open={livePanelOpen}
            onClose={() => setLivePanelOpen(false)}
            config={config}
            setConfig={setConfig}
            onForceReset={handleForceReset}
          />
        )}
      </main>
  );
};

export default Demo;

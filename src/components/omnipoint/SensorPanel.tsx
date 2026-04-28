import { useTelemetry } from "@/hooks/useTelemetry";
import { DetectionHUD } from "@/components/omnipoint/DetectionHUD";

interface Props {
  onSetOrigin: () => void;
}

export function SensorPanel({ onSetOrigin }: Props) {
  // Video/canvas refs are wired externally via DOM ids to keep the parent clean.
  const t = useTelemetry();
  return (
    <section className="flex flex-col panel">

      <div className="flex items-center justify-between border-b hairline px-3 h-9">
        <div className="font-mono text-[11px] tracking-[0.25em] text-emerald-glow">
          SENSOR INPUT // CAM_00
        </div>
        <div className="font-mono text-[10px] text-muted-foreground">1280×720 · GPU</div>
      </div>
      <div className="relative flex-1 bg-black scan-grid overflow-hidden">
        <video
          id="omnipoint-video"
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover opacity-90"
          style={{ transform: "scaleX(-1)" }}
        />
        <canvas
          id="omnipoint-canvas"
          width={1280}
          height={720}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ transform: "scaleX(-1)" }}
        />
        {/* Corner brackets */}
        <CornerBrackets />
        <DetectionHUD />
        {t.sensorLost && (
          <div className="absolute inset-0 flex items-center justify-center bg-destructive/15 backdrop-blur-[2px]">
            <div className="font-mono text-destructive text-2xl tracking-[0.4em] led">SENSOR LOST</div>
          </div>
        )}
        <div className="absolute bottom-2 left-3 font-mono text-[10px] text-muted-foreground">
          CONF <span className="text-foreground">{t.confidence.toFixed(2)}</span>
        </div>
        <div className="absolute bottom-2 right-3 font-mono text-[10px] text-muted-foreground">
          GST <span className="text-emerald-glow">{t.gesture.toUpperCase()}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 border-t hairline p-2">
        <button
          onClick={onSetOrigin}
          className="font-mono text-[11px] tracking-[0.2em] px-3 h-8 border border-primary/60 text-primary hover:bg-primary/10"
        >
          ◎ SET ORIGIN
        </button>
        <div className="ml-auto font-mono text-[10px] text-muted-foreground">
          XY <span className="text-foreground">{t.cursorX.toFixed(3)}, {t.cursorY.toFixed(3)}</span>
        </div>
      </div>
    </section>
  );
}

function CornerBrackets() {
  const cls = "absolute w-5 h-5 border-primary/70";
  return (
    <>
      <div className={`${cls} top-2 left-2 border-l border-t`} />
      <div className={`${cls} top-2 right-2 border-r border-t`} />
      <div className={`${cls} bottom-2 left-2 border-l border-b`} />
      <div className={`${cls} bottom-2 right-2 border-r border-b`} />
    </>
  );
}

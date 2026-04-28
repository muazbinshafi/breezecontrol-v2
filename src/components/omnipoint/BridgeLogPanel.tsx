import { useEffect, useRef, useState } from "react";
import { useBridgeLog } from "@/hooks/useBridgeLog";
import { BridgeLog, type BridgeLogEntry, type BridgeLogLevel } from "@/lib/omnipoint/BridgeLog";

const sourceLabel: Record<string, string> = {
  ws: "WS",
  probe: "PRB",
  heartbeat: "HB",
  reconnect: "RC",
  daemon: "DMN",
  port: "PRT",
  system: "SYS",
};

function levelTone(level: BridgeLogLevel) {
  switch (level) {
    case "ok": return "text-emerald-glow";
    case "warn": return "text-yellow-400";
    case "error": return "text-destructive";
    case "debug": return "text-muted-foreground/70";
    default: return "text-foreground";
  }
}

function dot(level: BridgeLogLevel) {
  switch (level) {
    case "ok": return "bg-primary";
    case "warn": return "bg-yellow-400";
    case "error": return "bg-destructive";
    case "debug": return "bg-muted-foreground/40";
    default: return "bg-foreground/60";
  }
}

function formatTime(ts: number) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

interface Props {
  height?: string;
}

export function BridgeLogPanel({ height = "max-h-64" }: Props) {
  const log = useBridgeLog();
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState<"all" | BridgeLogLevel>("all");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const visible: BridgeLogEntry[] = filter === "all" ? log : log.filter((e) => e.level === filter);

  useEffect(() => {
    if (!autoScroll || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [visible.length, autoScroll]);

  return (
    <div className="border hairline bg-card/60">
      <div className="flex items-center justify-between border-b hairline px-2 h-7">
        <div className="font-mono text-[10px] tracking-[0.25em] text-emerald-glow">
          ▣ BRIDGE LOG · {log.length}
        </div>
        <div className="flex items-center gap-1">
          {(["all", "ok", "warn", "error", "debug"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`font-mono text-[9px] tracking-[0.2em] px-1.5 h-5 border ${
                filter === f
                  ? "border-primary text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.toUpperCase()}
            </button>
          ))}
          <button
            onClick={() => setAutoScroll((v) => !v)}
            className={`font-mono text-[9px] tracking-[0.2em] px-1.5 h-5 border ${
              autoScroll ? "border-primary text-primary" : "border-border text-muted-foreground"
            }`}
            title="Auto-scroll"
          >
            ↓
          </button>
          <button
            onClick={() => BridgeLog.clear()}
            className="font-mono text-[9px] tracking-[0.2em] px-1.5 h-5 border border-border text-muted-foreground hover:text-destructive"
          >
            ✕
          </button>
        </div>
      </div>
      <div ref={scrollRef} className={`overflow-y-auto ${height}`}>
        {visible.length === 0 ? (
          <div className="p-3 font-mono text-[10px] text-muted-foreground tracking-[0.15em]">
            — no events yet —
          </div>
        ) : (
          <ul className="divide-y divide-border/40">
            {visible.map((e) => (
              <li key={e.id} className="flex items-start gap-2 px-2 py-1 font-mono text-[10px]">
                <span className={`mt-1 inline-block w-1.5 h-1.5 rounded-full shrink-0 ${dot(e.level)}`} />
                <span className="text-muted-foreground/80 shrink-0 tabular-nums">{formatTime(e.ts)}</span>
                <span className="text-emerald-glow shrink-0 w-7">{sourceLabel[e.source] ?? e.source.toUpperCase()}</span>
                <span className={`flex-1 break-words ${levelTone(e.level)}`}>{e.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

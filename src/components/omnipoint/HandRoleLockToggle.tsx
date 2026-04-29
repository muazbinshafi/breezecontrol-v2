// HandRoleLockToggle — lets the user pin one hand as the cursor (pointer)
// hand and reserve the other for click/drag/scroll, so dual-hand control
// never "steals" the cursor between hands.

import { useSyncExternalStore } from "react";
import { TelemetryStore, type HandRoleLock } from "@/lib/omnipoint/TelemetryStore";

const OPTIONS: { value: HandRoleLock; label: string; hint: string }[] = [
  { value: "auto", label: "AUTO", hint: "Pick the most intentful hand" },
  { value: "left_pointer", label: "L•POINTER", hint: "Left hand aims, right hand acts" },
  { value: "right_pointer", label: "R•POINTER", hint: "Right hand aims, left hand acts" },
];

export function HandRoleLockToggle() {
  const snap = useSyncExternalStore(TelemetryStore.subscribe, TelemetryStore.get, TelemetryStore.get);
  const lock = snap.handRoleLock;
  return (
    <div
      className="font-mono text-[9px] tracking-[0.25em] flex items-center border hairline bg-card/70 backdrop-blur"
      title="Lock one hand as the pointer; the other becomes the action hand."
    >
      <span className="px-2 text-muted-foreground">ROLES</span>
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => TelemetryStore.set({ handRoleLock: opt.value })}
          title={opt.hint}
          className={`px-2 h-8 border-l hairline transition-colors ${
            lock === opt.value
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

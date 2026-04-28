import { useSyncExternalStore } from "react";
import { TelemetryStore } from "@/lib/omnipoint/TelemetryStore";

export function useTelemetry() {
  return useSyncExternalStore(
    TelemetryStore.subscribe,
    TelemetryStore.get,
    TelemetryStore.get,
  );
}

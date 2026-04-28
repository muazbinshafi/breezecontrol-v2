import { useSyncExternalStore } from "react";
import { GestureSettingsStore } from "@/lib/omnipoint/GestureSettings";

export function useGestureSettings() {
  return useSyncExternalStore(
    GestureSettingsStore.subscribe,
    GestureSettingsStore.get,
    GestureSettingsStore.get,
  );
}

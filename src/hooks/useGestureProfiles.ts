import { useSyncExternalStore } from "react";
import { GestureProfileStore } from "@/lib/omnipoint/GestureProfiles";

export function useGestureProfiles() {
  return useSyncExternalStore(
    GestureProfileStore.subscribe,
    GestureProfileStore.get,
    GestureProfileStore.get,
  );
}

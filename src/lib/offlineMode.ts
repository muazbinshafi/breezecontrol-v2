// OfflineMode — a tiny reactive flag, persisted in localStorage, that
// disables every Supabase-dependent code path (auth, cloud profile sync,
// protected routes). Useful when Lovable Cloud isn't connected or when the
// user just wants to tune gestures without signing in.

import { useSyncExternalStore } from "react";
import { isSupabaseConfigured } from "@/integrations/supabase/client";

const STORAGE_KEY = "omnipoint.offlineMode";

function load(): boolean {
  if (typeof localStorage === "undefined") return !isSupabaseConfigured;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) {
    // Default ON when Supabase isn't configured, OFF otherwise.
    return !isSupabaseConfigured;
  }
  return raw === "1";
}

let snapshot = load();
const listeners = new Set<() => void>();

export const OfflineModeStore = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  get(): boolean {
    return snapshot;
  },
  set(v: boolean) {
    snapshot = v;
    try {
      localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
    for (const l of listeners) l();
  },
  toggle() {
    OfflineModeStore.set(!snapshot);
  },
};

export function useOfflineMode() {
  return useSyncExternalStore(
    OfflineModeStore.subscribe,
    OfflineModeStore.get,
    OfflineModeStore.get,
  );
}

/** Synchronous check — true means: don't touch Supabase. */
export function isOffline(): boolean {
  return OfflineModeStore.get() || !isSupabaseConfigured;
}

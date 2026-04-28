// usePaint — reactive subscription to PaintStore + PaintHistory for React UI.

import { useSyncExternalStore } from "react";
import { PaintStore, PaintHistory, subscribeHistory } from "@/lib/omnipoint/PaintStore";

let historySnapshot = { canUndo: false, canRedo: false };

function getHistorySnapshot() {
  const next = { canUndo: PaintHistory.canUndo(), canRedo: PaintHistory.canRedo() };
  if (
    next.canUndo !== historySnapshot.canUndo ||
    next.canRedo !== historySnapshot.canRedo
  ) {
    historySnapshot = next;
  }
  return historySnapshot;
}

export function usePaint() {
  return useSyncExternalStore(PaintStore.subscribe, PaintStore.get, PaintStore.get);
}

export function usePaintHistory() {
  return useSyncExternalStore(
    subscribeHistory,
    getHistorySnapshot,
    () => ({ canUndo: false, canRedo: false }),
  );
}

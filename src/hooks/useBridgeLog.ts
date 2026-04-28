import { useSyncExternalStore } from "react";
import { BridgeLog } from "@/lib/omnipoint/BridgeLog";

export function useBridgeLog() {
  return useSyncExternalStore(
    (cb) => BridgeLog.subscribe(cb),
    () => BridgeLog.get(),
    () => BridgeLog.get(),
  );
}

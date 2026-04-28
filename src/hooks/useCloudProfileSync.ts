// useCloudProfileSync — when the user is signed in, mirror their gesture
// profiles to the cloud `gesture_profiles` table. Mounted once at the App
// root; unmounts the syncer on sign-out. No-ops in Offline Mode.

import { useEffect } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { useOfflineMode } from "@/lib/offlineMode";
import { startCloudSync, stopCloudSync } from "@/lib/omnipoint/cloudProfileSync";

export function useCloudProfileSync() {
  const { user } = useAuth();
  const offline = useOfflineMode();
  useEffect(() => {
    if (offline) {
      stopCloudSync();
      return;
    }
    if (user) startCloudSync(user.id);
    else stopCloudSync();
    return () => stopCloudSync();
  }, [user, offline]);
}

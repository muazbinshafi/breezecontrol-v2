// ProtectedRoute — gates a route behind authentication. While the auth
// context resolves the initial session we render a thin loading bar to
// avoid flicker. In Offline Mode, the gate is bypassed entirely so the
// gesture/draw demo runs without any Supabase dependency.

import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { useOfflineMode } from "@/lib/offlineMode";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const offline = useOfflineMode();
  const location = useLocation();

  if (offline) return <>{children}</>;

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background text-muted-foreground">
        <div className="flex items-center gap-3 font-mono text-[11px] tracking-[0.3em]">
          <Loader2 className="w-4 h-4 animate-spin" />
          LOADING SESSION…
        </div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}

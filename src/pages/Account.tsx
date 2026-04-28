// Account — minimal profile editor. Shows the signed-in user's email,
// lets them update display name + avatar URL, and shows how many cloud
// gesture profiles they have synced.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Hand, Loader2, LogOut, Save, User as UserIcon, Cloud } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthContext";
import { toast } from "@/hooks/use-toast";

const Account = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [profileCount, setProfileCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.title = "Account — BreezeControl";
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [{ data: profile }, { count }] = await Promise.all([
        supabase
          .from("profiles")
          .select("display_name, avatar_url")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("gesture_profiles")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id),
      ]);
      if (cancelled) return;
      setDisplayName(profile?.display_name ?? "");
      setAvatarUrl(profile?.avatar_url ?? "");
      setProfileCount(count ?? 0);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .upsert(
        { user_id: user.id, display_name: displayName, avatar_url: avatarUrl },
        { onConflict: "user_id" },
      );
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Profile saved" });
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/", { replace: true });
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b hairline px-4 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-2xl bg-gradient-primary grid place-items-center shadow-md">
            <Hand className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-display text-sm">BreezeControl</span>
        </Link>
        <span className="font-mono text-[10px] tracking-[0.3em] text-emerald-glow">ACCOUNT</span>
      </header>

      <section className="max-w-xl mx-auto px-4 py-8 sm:py-12">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground font-mono text-[11px] tracking-[0.3em]">
            <Loader2 className="w-4 h-4 animate-spin" /> LOADING…
          </div>
        ) : (
          <>
            <div className="flex items-center gap-4 mb-8">
              <div className="w-16 h-16 rounded-full bg-gradient-primary grid place-items-center overflow-hidden">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <UserIcon className="w-7 h-7 text-white" />
                )}
              </div>
              <div>
                <h1 className="font-display text-2xl text-foreground">
                  {displayName || "Your account"}
                </h1>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
              </div>
            </div>

            <div className="panel p-5 mb-4 rounded-3xl">
              <h2 className="font-mono text-[11px] tracking-[0.3em] text-emerald-glow mb-4">
                ▸ PROFILE
              </h2>
              <Field label="Display name" value={displayName} onChange={setDisplayName} />
              <Field
                label="Avatar URL"
                value={avatarUrl}
                onChange={setAvatarUrl}
                placeholder="https://…"
              />
              <button
                onClick={handleSave}
                disabled={saving}
                className="mt-3 inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 text-sm font-medium"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save changes
              </button>
            </div>

            <div className="panel p-5 mb-4 rounded-3xl">
              <h2 className="font-mono text-[11px] tracking-[0.3em] text-emerald-glow mb-3">
                ▸ CLOUD SYNC
              </h2>
              <div className="flex items-center gap-3">
                <Cloud className="w-5 h-5 text-primary" />
                <div className="flex-1">
                  <div className="text-sm text-foreground">
                    {profileCount} gesture {profileCount === 1 ? "profile" : "profiles"} synced
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Your customizations are saved across all your devices.
                  </div>
                </div>
              </div>
              <Link
                to="/demo"
                className="mt-3 inline-block font-mono text-[10px] tracking-[0.3em] text-primary hover:underline"
              >
                MANAGE PROFILES IN THE DEMO →
              </Link>
            </div>

            <button
              onClick={handleSignOut}
              className="w-full h-10 inline-flex items-center justify-center gap-2 rounded-xl border border-destructive/40 text-destructive hover:bg-destructive/10 text-sm font-medium"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </>
        )}
      </section>
    </main>
  );
};

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block mb-3">
      <span className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground">
        {label.toUpperCase()}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full h-10 px-3 bg-background border border-border focus:border-primary rounded-xl outline-none text-sm text-foreground"
      />
    </label>
  );
}

export default Account;

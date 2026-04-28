// ResetPassword — finalizes the password-reset flow. The user lands here
// from the email link with `type=recovery` in the URL hash; Supabase has
// already exchanged it for a temporary session, so we just call updateUser.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Hand, Lock, Loader2, ArrowRight, CheckCircle2, AlertCircle, RotateCcw, LogIn } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type Status = "idle" | "submitting" | "success" | "error";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);

  useEffect(() => {
    document.title = "Reset password — BreezeControl";
    // Supabase parses the recovery token from the URL hash and emits a
    // PASSWORD_RECOVERY event. We just confirm the session exists.
    supabase.auth.getSession().then(({ data }) => {
      setHasRecoverySession(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setHasRecoverySession(true);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "submitting") return;
    if (password.length < 8) {
      toast({ title: "Password too short", description: "Use at least 8 characters.", variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    setStatus("submitting");
    setErrorMessage(null);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setErrorMessage(error.message || "Something went wrong updating your password.");
      setStatus("error");
      return;
    }
    setStatus("success");
    // Sign out the temporary recovery session so the next sign-in is clean.
    await supabase.auth.signOut().catch(() => {});
  };

  const handleTryAgain = () => {
    setStatus("idle");
    setErrorMessage(null);
    setPassword("");
    setConfirm("");
  };

  const goToSignIn = () => navigate("/auth", { replace: true });

  const showForm = status === "idle" || status === "submitting";

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-10 h-10 rounded-2xl bg-gradient-primary grid place-items-center shadow-md">
            <Hand className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-display text-xl">BreezeControl</span>
        </div>

        <div className="panel p-6 sm:p-8 rounded-3xl">
          {status === "success" ? (
            <div className="flex flex-col items-center text-center py-4 animate-fade-in">
              <div className="w-16 h-16 rounded-full bg-[hsl(var(--success))]/10 grid place-items-center mb-4">
                <CheckCircle2 className="w-9 h-9 text-[hsl(var(--success))]" />
              </div>
              <h1 className="font-display text-2xl mb-1.5">Password updated</h1>
              <p className="text-sm text-muted-foreground mb-6 max-w-xs">
                Your new password is ready. Sign in to continue where you left off.
              </p>
              <button
                onClick={goToSignIn}
                className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 inline-flex items-center justify-center gap-2 transition-colors"
              >
                <LogIn className="w-4 h-4" />
                Go to sign in
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : status === "error" ? (
            <div className="flex flex-col items-center text-center py-4 animate-fade-in">
              <div className="w-16 h-16 rounded-full bg-destructive/10 grid place-items-center mb-4">
                <AlertCircle className="w-9 h-9 text-destructive" />
              </div>
              <h1 className="font-display text-2xl mb-1.5">Couldn't update password</h1>
              <p className="text-sm text-muted-foreground mb-2 max-w-xs">
                {errorMessage}
              </p>
              <p className="text-xs text-muted-foreground mb-6 max-w-xs">
                The recovery link may have expired. Try requesting a fresh one
                from the sign-in page.
              </p>
              <div className="w-full grid grid-cols-2 gap-2">
                <button
                  onClick={handleTryAgain}
                  className="h-11 rounded-xl border border-border bg-background hover:bg-secondary text-foreground font-medium text-sm inline-flex items-center justify-center gap-2 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  Try again
                </button>
                <button
                  onClick={goToSignIn}
                  className="h-11 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 inline-flex items-center justify-center gap-2 transition-colors"
                >
                  <LogIn className="w-4 h-4" />
                  Sign in
                </button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="font-display text-2xl mb-1">Set a new password</h1>
              <p className="text-sm text-muted-foreground mb-6">
                Choose a fresh password to finish signing back in.
              </p>

              {!hasRecoverySession && (
                <div className="mb-5 p-3 border border-warning/40 bg-warning/10 text-sm text-foreground rounded-xl">
                  We couldn't detect a recovery session. Open this page from the
                  link in your password-reset email.
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-3">
                <PasswordField value={password} onChange={setPassword} placeholder="New password (min 8 chars)" autoComplete="new-password" />
                <PasswordField value={confirm} onChange={setConfirm} placeholder="Confirm new password" autoComplete="new-password" />
                <button
                  type="submit"
                  disabled={status === "submitting" || !hasRecoverySession}
                  className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 disabled:opacity-50 inline-flex items-center justify-center gap-2 transition-colors"
                >
                  {status === "submitting" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>Update password<ArrowRight className="w-4 h-4" /></>
                  )}
                </button>
              </form>
            </>
          )}
        </div>

        {showForm && (
          <div className="mt-6 text-center">
            <Link to="/auth" className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground hover:text-foreground">
              ← BACK TO SIGN IN
            </Link>
          </div>
        )}
      </div>
    </main>
  );
};

function PasswordField({
  value, onChange, placeholder, autoComplete,
}: { value: string; onChange: (v: string) => void; placeholder: string; autoComplete?: string }) {
  return (
    <label className="flex items-center gap-2 border border-border bg-background h-11 px-3 rounded-xl focus-within:border-primary transition-colors">
      <Lock className="w-4 h-4 text-muted-foreground" />
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required
        minLength={8}
        autoComplete={autoComplete}
        className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground/60"
      />
    </label>
  );
}

export default ResetPassword;

import { useState } from "react";
import { FlaskConical, X, Loader2, Mail, Lock, User, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { auth } from "@/lib/apiClient";

/**
 * Login / sign-up screen. Manages its own form + network state, and calls
 * onAuthed(user) once the user is signed in. Renders as a centered modal, or
 * as a full-screen sign-in wall when `mandatory` (the private-beta gate).
 */
export function AuthDialog({ open, onClose, onAuthed, mandatory = false, onViewTerms }) {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false); // signup: accepted Terms & Privacy Policy
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (mode === "signup" && !agreed) {
      setError("Please agree to the Terms & Conditions and Privacy Policy to create an account.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const user = mode === "signup"
        ? await auth.signup({ email, password, name })
        : await auth.login({ email, password });
      onAuthed(user);
      // reset for next time
      setPassword("");
    } catch (err) {
      setError(err?.message || "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const isSignup = mode === "signup";
  const switchMode = (next) => { setError(""); setMode(next); };

  return (
    <div
      className="lvp-no-print fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={mandatory ? undefined : onClose}
    >
      {/* Backdrop */}
      {mandatory ? (
        <div className="absolute inset-0 bg-background">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-background" />
          <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        </div>
      ) : (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      )}

      {/* Card */}
      <div
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {!mandatory && (
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {/* Brand header */}
        <div className="flex flex-col items-center gap-3 px-6 pt-8 pb-5 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/25">
            <FlaskConical className="h-7 w-7 text-primary-foreground" />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight">LabValidate&nbsp;Pro</h1>
            <p className="text-[13px] text-muted-foreground">
              {isSignup
                ? "Create your account to get started"
                : "Sign in to your validation workspace"}
            </p>
          </div>
          {mandatory && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
              <ShieldCheck className="h-3 w-3" /> Beta
            </span>
          )}
        </div>

        {/* Segmented mode toggle */}
        <div className="px-6">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            {[
              { id: "login", label: "Sign in" },
              { id: "signup", label: "Create account" },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => switchMode(t.id)}
                className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-all ${
                  mode === t.id
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <form className="space-y-4 px-6 pb-6 pt-5" onSubmit={submit}>
          {isSignup && (
            <div className="space-y-1.5">
              <Label htmlFor="auth-name">
                Name <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="auth-name" className="pl-9" value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Hadi Fauzi" autoComplete="name"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="auth-email">Email</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="auth-email" type="email" required className="pl-9" value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your email" autoComplete="email"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="auth-password">Password</Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="auth-password" type="password" required className="pl-9" value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isSignup ? "At least 8 characters" : "Your password"}
                autoComplete={isSignup ? "new-password" : "current-password"} minLength={8}
              />
            </div>
          </div>

          {isSignup && (
            <label className="flex items-start gap-2.5 text-[12px] leading-relaxed text-muted-foreground">
              <input
                type="checkbox" checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-primary"
              />
              <span>
                I have read and agree to the{" "}
                {onViewTerms ? (
                  <button type="button" onClick={onViewTerms} className="font-medium text-primary hover:underline">
                    Terms &amp; Conditions and Privacy Policy
                  </button>
                ) : (
                  <span className="font-medium text-foreground">Terms &amp; Conditions and Privacy Policy</span>
                )}
                .
              </span>
            </label>
          )}

          {error && (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={busy || (isSignup && !agreed)}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSignup ? "Create account" : "Sign in"}
          </Button>

          <p className="text-center text-[12px] leading-relaxed text-muted-foreground">
            {mandatory
              ? "LabValidate Pro is in beta. Your studies stay synced across devices."
              : "Your account keeps every saved study synced across devices."}
          </p>
        </form>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { UserCircle2, X, Loader2, LogOut, Trash2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { auth } from "@/lib/apiClient";

/**
 * Account management: rename, change password, sign out, delete account.
 * Talks to /api/auth/account directly; reports results back up via callbacks.
 */
export function AccountDialog({ open, onClose, user, onUpdated, onSignOut, onDeleted }) {
  const [name, setName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open) {
      setName(user?.name || "");
      setCurrentPassword(""); setNewPassword("");
      setMsg(""); setError(""); setConfirmDelete(false);
    }
  }, [open, user]);

  if (!open) return null;

  const saveProfile = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg(""); setError("");
    try {
      const patch = { name };
      if (newPassword) { patch.currentPassword = currentPassword; patch.newPassword = newPassword; }
      const updated = await auth.updateAccount(patch);
      onUpdated?.(updated);
      setMsg("Saved.");
      setCurrentPassword(""); setNewPassword("");
    } catch (err) {
      setError(err?.message || "Could not save changes.");
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    setBusy(true); setError("");
    try {
      await auth.deleteAccount();
      onDeleted?.();
    } catch (err) {
      setError(err?.message || "Could not delete the account.");
      setBusy(false);
    }
  };

  return (
    <div className="lvp-no-print fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 overflow-y-auto" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative w-full max-w-md mt-[6vh] rounded-xl border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <UserCircle2 className="h-4 w-4 text-primary" />
            <div className="text-sm font-semibold">Account</div>
          </div>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="p-4 space-y-4">
          <div className="rounded-lg border border-border p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Signed in as</div>
            <div className="font-data text-sm mt-0.5 truncate">{user?.email}</div>
          </div>

          <form className="space-y-3" onSubmit={saveProfile}>
            <div className="space-y-1.5">
              <Label htmlFor="acct-name">Display name</Label>
              <Input id="acct-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
            </div>

            <Separator />
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Change password <span className="font-normal normal-case">(optional)</span></div>
            <div className="space-y-1.5">
              <Label htmlFor="acct-cur">Current password</Label>
              <Input id="acct-cur" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Required to set a new one" autoComplete="current-password" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acct-new">New password</Label>
              <Input id="acct-new" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters" autoComplete="new-password" minLength={8} />
            </div>

            {msg && <div className="flex items-center gap-1.5 text-[12px] text-emerald-600"><ShieldCheck className="h-3.5 w-3.5" />{msg}</div>}
            {error && <div className="rounded-md bg-destructive/10 px-3 py-2 text-[12px] text-destructive">{error}</div>}

            <Button type="submit" size="sm" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save changes
            </Button>
          </form>

          <Separator />
          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" size="sm" onClick={onSignOut}><LogOut className="h-3.5 w-3.5 mr-1.5" />Sign out</Button>

            {!confirmDelete ? (
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete account
              </Button>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">Delete everything?</span>
                <Button variant="destructive" size="sm" onClick={doDelete} disabled={busy}>
                  {busy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}Yes, delete
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>No</Button>
              </div>
            )}
          </div>
          {confirmDelete && (
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              This permanently removes your account and every saved study. This can't be undone.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

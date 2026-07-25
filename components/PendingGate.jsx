import { Hourglass, LogOut, RefreshCw, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Shown full-screen when a tester's trial has ended, they've submitted feedback,
 * and they're waiting for the admin to approve their year of access.
 */
export function PendingGate({ user, onSignOut, onRefresh }) {
  const [busy, setBusy] = useState(false);
  const refresh = async () => { setBusy(true); try { await onRefresh?.(); } finally { setBusy(false); } };

  return (
    <div className="lvp-no-print fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background" />
      <div className="relative w-full max-w-md rounded-xl border border-border bg-card shadow-xl p-6 text-center">
        <div className="mx-auto h-12 w-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
          <Hourglass className="h-6 w-6 text-amber-500" />
        </div>
        <div className="mt-3 text-lg font-semibold tracking-tight">Thanks for your feedback!</div>
        <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-muted-foreground leading-relaxed">
          Your feedback has been submitted and is <b>pending approval</b>. Once the developer approves your
          account, you'll get a full year of access. Please check back soon.
        </p>
        {user?.email && <div className="mt-3 text-[11px] font-data text-muted-foreground">{user.email}</div>}
        <div className="mt-5 flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}Check again
          </Button>
          <Button variant="ghost" size="sm" onClick={onSignOut}><LogOut className="h-4 w-4 mr-1.5" />Sign out</Button>
        </div>
      </div>
    </div>
  );
}

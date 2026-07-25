import { useState, useEffect } from "react";
import { Bug, Lightbulb, X, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { reports as reportsApi } from "@/lib/apiClient";

/** Report a bug or an improvement idea — separate from the star feedback. */
export function ReportDialog({ open, onClose, onSubmitted }) {
  const [type, setType] = useState("bug");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (open) { setType("bug"); setTitle(""); setDetail(""); setError(""); setBusy(false); setDone(false); }
  }, [open]);

  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!detail.trim()) { setError("Please describe the bug or the improvement."); return; }
    setBusy(true);
    try {
      await reportsApi.submit({ type, title, detail });
      setDone(true);
      onSubmitted?.();
      setTimeout(() => onClose?.(), 900);
    } catch (err) {
      setError(err?.message || "Could not send the report. Try again.");
      setBusy(false);
    }
  };

  return (
    <div className="lvp-no-print fixed inset-0 z-[70] flex items-start justify-center p-4 sm:p-6 overflow-y-auto" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-md mt-[6vh] rounded-xl border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Bug className="h-4 w-4 text-primary" />
            <div className="text-sm font-semibold">Report a bug or improvement</div>
          </div>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        {done ? (
          <div className="p-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
            <div className="mt-2 font-medium">Thanks — report sent.</div>
          </div>
        ) : (
          <form className="p-4 space-y-3.5" onSubmit={submit}>
            <div className="flex gap-2">
              {[{ id: "bug", label: "Bug", icon: Bug }, { id: "improvement", label: "Improvement", icon: Lightbulb }].map((t) => {
                const active = type === t.id;
                return (
                  <button key={t.id} type="button" onClick={() => setType(t.id)}
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] transition-colors ${
                      active ? "border-primary bg-primary/10 text-primary font-medium" : "border-border text-muted-foreground hover:bg-muted"}`}>
                    <t.icon className="h-4 w-4" />{t.label}
                  </button>
                );
              })}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rp-title">Title <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input id="rp-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short summary" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rp-detail">Details</Label>
              <Textarea id="rp-detail" rows={5} value={detail} onChange={(e) => setDetail(e.target.value)}
                placeholder={type === "bug" ? "What happened, what did you expect, and the steps to reproduce it." : "What would you like to see improved, and why?"} />
            </div>
            {error && <div className="rounded-md bg-destructive/10 px-3 py-2 text-[12px] text-destructive">{error}</div>}
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
              <Button type="submit" size="sm" disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Send report
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

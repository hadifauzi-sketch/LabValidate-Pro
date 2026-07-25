import { useState, useEffect } from "react";
import { Star, X, Loader2, MessageSquare, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { feedback as feedbackApi } from "@/lib/apiClient";

/**
 * Feedback form — a star rating + comment, plus who the tester is
 * (name, company, job, country). This is the compulsory beta feedback.
 * Bug/improvement reports are a separate thing (ReportDialog).
 *
 * Modes:
 *  - voluntary (mandatory=false): dismissible dialog from the menu/banner.
 *  - gate (mandatory=true): non-dismissible; shown when the trial has ended.
 */
export function FeedbackDialog({ open, onClose, onSubmitted, mandatory = false, user }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [job, setJob] = useState("");
  const [country, setCountry] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setRating(0); setHover(0); setComment(""); setError(""); setBusy(false);
      setName(user?.name || ""); setCompany(user?.company || "");
      setJob(user?.job || ""); setCountry(user?.country || "");
    }
  }, [open, user]);

  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!(rating >= 1)) { setError("Please tap a star rating first."); return; }
    if (!name.trim()) { setError("Please enter your name."); return; }
    if (!company.trim()) { setError("Please enter your company / organisation."); return; }
    if (!job.trim()) { setError("Please enter your job / role."); return; }
    if (!comment.trim()) { setError("Please add a short comment."); return; }
    setBusy(true);
    try {
      const updated = await feedbackApi.submit({ rating, comment, name, company, job, country });
      onSubmitted?.(updated);
    } catch (err) {
      setError(err?.message || "Could not send feedback. Try again.");
      setBusy(false);
    }
  };

  return (
    <div className="lvp-no-print fixed inset-0 z-[70] flex items-start justify-center p-4 sm:p-6 overflow-y-auto"
      onClick={mandatory ? undefined : onClose}>
      <div className={`absolute inset-0 ${mandatory ? "bg-background" : "bg-black/60 backdrop-blur-sm"}`} />
      <div className="relative w-full max-w-md mt-[4vh] rounded-xl border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            {mandatory ? <Lock className="h-4 w-4 text-primary" /> : <MessageSquare className="h-4 w-4 text-primary" />}
            <div className="text-sm font-semibold">{mandatory ? "Your beta trial has ended" : "Send feedback"}</div>
          </div>
          {!mandatory && <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}><X className="h-4 w-4" /></Button>}
        </div>

        <form className="p-4 space-y-3.5" onSubmit={submit}>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            {mandatory
              ? "This app is still in development. Share your rating and a comment to request a full year of access — the developer will approve you."
              : "This app is still in development. Your rating and comment help shape it."}
          </p>

          {/* Stars */}
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" className="p-0.5" aria-label={`${n} star${n > 1 ? "s" : ""}`}
                onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)} onClick={() => setRating(n)}>
                <Star className={`h-7 w-7 transition-colors ${(hover || rating) >= n ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />
              </button>
            ))}
            <span className="ml-2 text-[12px] text-muted-foreground">{rating ? `${rating}/5` : "Rate it"}</span>
          </div>

          {/* Who you are */}
          <div className="space-y-1.5">
            <Label htmlFor="fb-name">Your name</Label>
            <Input id="fb-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hadi Fauzi" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="fb-company">Company</Label>
              <Input id="fb-company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Organisation" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fb-job">Job / role</Label>
              <Input id="fb-job" value={job} onChange={(e) => setJob(e.target.value)} placeholder="e.g. QA Chemist" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fb-country">Country <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input id="fb-country" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Where are you from?" />
          </div>

          {/* Comment */}
          <div className="space-y-1.5">
            <Label htmlFor="fb-comment">Comment</Label>
            <Textarea id="fb-comment" rows={3} value={comment} onChange={(e) => setComment(e.target.value)}
              placeholder="What did you think? What would make it better?" />
          </div>

          {error && <div className="rounded-md bg-destructive/10 px-3 py-2 text-[12px] text-destructive">{error}</div>}

          <div className="flex items-center justify-end gap-2 pt-1">
            {!mandatory && <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>}
            <Button type="submit" size="sm" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Send feedback
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

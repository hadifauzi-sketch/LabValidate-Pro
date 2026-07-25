import { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck, X, Loader2, Users, Star, Download, RefreshCw, Trash2, Ban, RotateCcw,
  BadgeCheck, Bug, Lightbulb,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { admin as adminApi, feedback as feedbackApi, reports as reportsApi } from "@/lib/apiClient";

function statusBadge(a) {
  const map = {
    admin: ["text-primary", "Admin"],
    active: ["text-emerald-600", `Active · ${a.daysLeft}d`],
    trial: ["text-amber-600", `Trial · ${a.daysLeft}d`],
    pending: ["text-blue-600", "Pending approval"],
    expired: ["text-destructive", "Expired"],
  };
  const [cls, text] = map[a.status] || ["text-muted-foreground", a.status];
  return <span className={`text-[11px] font-medium ${cls}`}>{text}</span>;
}

function download(name, text, mime) {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  URL.revokeObjectURL(a.href);
}
const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const toCSV = (head, rows) => [head.join(","), ...rows.map((r) => r.map(esc).join(","))].join("\r\n");
const stamp = () => new Date().toISOString().slice(0, 10);

export function AdminDialog({ open, onClose }) {
  const [tab, setTab] = useState("users");
  const [users, setUsers] = useState([]);
  const [fb, setFb] = useState({ feedback: [], summary: { count: 0, avg: 0 } });
  const [reps, setReps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [u, f, r] = await Promise.all([adminApi.listUsers(), feedbackApi.listAll(), reportsApi.listAll()]);
      setUsers(u); setFb(f); setReps(r);
    } catch (e) {
      setError(e?.message || "Could not load admin data.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  if (!open) return null;

  const act = async (id, patch) => {
    setBusyId(id);
    try { await adminApi.updateUser(id, patch); await load(); }
    catch (e) { setError(e?.message || "Action failed."); }
    finally { setBusyId(null); }
  };
  const removeUser = async (id) => {
    setBusyId(id);
    try { await adminApi.deleteUser(id); await load(); }
    catch (e) { setError(e?.message || "Delete failed."); }
    finally { setBusyId(null); }
  };

  const exportFeedbackCSV = () => download(`labvalidate-feedback-${stamp()}.csv`,
    toCSV(["date", "rating", "name", "company", "job", "country", "email", "comment"],
      fb.feedback.map((f) => [f.createdAt, f.rating, f.name, f.company, f.job, f.country, f.email, f.comment])), "text/csv");
  const exportReportsCSV = () => download(`labvalidate-reports-${stamp()}.csv`,
    toCSV(["date", "type", "title", "email", "detail"],
      reps.map((r) => [r.createdAt, r.type, r.title, r.email, r.detail])), "text/csv");

  return (
    <div className="lvp-no-print fixed inset-0 z-[60] flex items-start justify-center p-4 sm:p-6 overflow-y-auto" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative w-full max-w-3xl mt-[5vh] rounded-xl border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <div className="text-sm font-semibold">Admin panel</div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={load} title="Refresh" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}><X className="h-4 w-4" /></Button>
          </div>
        </div>

        <div className="p-4">
          {error && <div className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-[12px] text-destructive">{error}</div>}
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="users"><Users className="h-3.5 w-3.5 mr-1.5" />Testers ({users.length})</TabsTrigger>
              <TabsTrigger value="feedback"><Star className="h-3.5 w-3.5 mr-1.5" />Feedback ({fb.summary.count})</TabsTrigger>
              <TabsTrigger value="reports"><Bug className="h-3.5 w-3.5 mr-1.5" />Reports ({reps.length})</TabsTrigger>
            </TabsList>

            {/* Testers */}
            <TabsContent value="users" className="mt-3">
              <div className="max-h-[60vh] overflow-y-auto space-y-2 pr-0.5">
                {users.length === 0 && !loading && <div className="text-[13px] text-muted-foreground py-8 text-center">No accounts yet.</div>}
                {users.map((u) => (
                  <div key={u.id} className={`rounded-lg border p-3 ${u.access.pendingApproval ? "border-blue-500/40 bg-blue-500/5" : "border-border"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium truncate">{u.name || u.email}</div>
                        <div className="text-[11px] text-muted-foreground font-data truncate">{u.email}</div>
                        {(u.company || u.job || u.country) && (
                          <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                            {[u.job, u.company, u.country].filter(Boolean).join(" · ")}
                          </div>
                        )}
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                          {statusBadge(u.access)}
                          <span>· {u.feedbackCount} feedback</span>
                          <span>· {u.studyCount} studies</span>
                        </div>
                      </div>
                      {u.access.isAdmin && <Badge variant="outline" className="text-primary border-primary/40 text-[10px]">ADMIN</Badge>}
                    </div>
                    {!u.access.isAdmin && (
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        <Button size="sm" className="h-7 text-[11px] px-2" disabled={busyId === u.id} onClick={() => act(u.id, { action: "approve" })}>
                          <BadgeCheck className="h-3 w-3 mr-1" />Approve 1 year
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-[11px] px-2" disabled={busyId === u.id} onClick={() => act(u.id, { action: "resetTrial" })}>
                          <RotateCcw className="h-3 w-3 mr-1" />Reset trial
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-[11px] px-2 text-amber-600" disabled={busyId === u.id} onClick={() => act(u.id, { action: "block" })}>
                          <Ban className="h-3 w-3 mr-1" />Block
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-[11px] px-2" disabled={busyId === u.id} onClick={() => act(u.id, { action: "setRole", role: "admin" })}>
                          Make admin
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive ml-auto" disabled={busyId === u.id} onClick={() => removeUser(u.id)} title="Delete tester + data">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* Feedback */}
            <TabsContent value="feedback" className="mt-3">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 text-[13px]">
                  <div className="flex items-center gap-1 font-medium">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />{fb.summary.avg || 0}
                  </div>
                  <span className="text-muted-foreground">avg · {fb.summary.count} total</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="sm" className="h-8" disabled={!fb.feedback.length} onClick={exportFeedbackCSV}>
                    <Download className="h-3.5 w-3.5 mr-1.5" />CSV
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8" disabled={!fb.feedback.length}
                    onClick={() => download(`labvalidate-feedback-${stamp()}.json`, JSON.stringify(fb.feedback, null, 2), "application/json")}>
                    <Download className="h-3.5 w-3.5 mr-1.5" />JSON
                  </Button>
                </div>
              </div>
              <div className="max-h-[58vh] overflow-y-auto space-y-2 pr-0.5">
                {fb.feedback.length === 0 && !loading && <div className="text-[13px] text-muted-foreground py-8 text-center">No feedback yet.</div>}
                {fb.feedback.map((f) => (
                  <div key={f.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star key={n} className={`h-3.5 w-3.5 ${n <= f.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
                        ))}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{f.createdAt ? new Date(f.createdAt).toLocaleString() : ""}</div>
                    </div>
                    <p className="text-[13px] mt-1.5 whitespace-pre-wrap leading-relaxed">{f.comment}</p>
                    <div className="text-[11px] text-muted-foreground mt-1.5">
                      <span className="font-medium text-foreground">{f.name || "—"}</span>
                      {[f.job, f.company, f.country].filter(Boolean).length > 0 && <> · {[f.job, f.company, f.country].filter(Boolean).join(" · ")}</>}
                      <span className="font-data"> · {f.email || "—"}</span>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* Reports */}
            <TabsContent value="reports" className="mt-3">
              <div className="flex items-center justify-end gap-1.5 mb-3">
                <Button variant="outline" size="sm" className="h-8" disabled={!reps.length} onClick={exportReportsCSV}>
                  <Download className="h-3.5 w-3.5 mr-1.5" />CSV
                </Button>
                <Button variant="ghost" size="sm" className="h-8" disabled={!reps.length}
                  onClick={() => download(`labvalidate-reports-${stamp()}.json`, JSON.stringify(reps, null, 2), "application/json")}>
                  <Download className="h-3.5 w-3.5 mr-1.5" />JSON
                </Button>
              </div>
              <div className="max-h-[58vh] overflow-y-auto space-y-2 pr-0.5">
                {reps.length === 0 && !loading && <div className="text-[13px] text-muted-foreground py-8 text-center">No reports yet.</div>}
                {reps.map((r) => (
                  <div key={r.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" className={`text-[10px] capitalize ${r.type === "bug" ? "text-destructive border-destructive/40" : "text-primary border-primary/40"}`}>
                        {r.type === "bug" ? <Bug className="h-3 w-3 mr-1" /> : <Lightbulb className="h-3 w-3 mr-1" />}{r.type}
                      </Badge>
                      <div className="text-[11px] text-muted-foreground">{r.createdAt ? new Date(r.createdAt).toLocaleString() : ""}</div>
                    </div>
                    {r.title && <div className="text-[13px] font-medium mt-1.5">{r.title}</div>}
                    <p className="text-[13px] mt-1 whitespace-pre-wrap leading-relaxed">{r.detail}</p>
                    <div className="text-[11px] text-muted-foreground font-data mt-1.5">{r.email || "—"}</div>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

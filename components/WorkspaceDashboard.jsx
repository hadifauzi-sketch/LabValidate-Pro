import { useState } from "react";
import {
  LayoutDashboard, FilePlus, FlaskConical, Upload, Trash2, Loader2, RefreshCw, Cloud,
  Pencil, Check, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

/* Themed tooltip wrapper (relies on the app-level TooltipProvider). */
const Hint = ({ label, children }) => (
  <Tooltip>
    <TooltipTrigger asChild>{children}</TooltipTrigger>
    <TooltipContent side="bottom">{label}</TooltipContent>
  </Tooltip>
);

/**
 * Per-account landing page: a greeting plus every saved study as a card,
 * so the user can monitor and re-open their work at a glance.
 */
export function WorkspaceDashboard({ user, presets, loading, onOpen, onDelete, onRename, onNew, onRefresh }) {
  const firstName = (user?.name || user?.email || "").split(/[@\s]/)[0] || "there";
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState("");

  const startEdit = (e) => { setEditingId(e.id); setDraft(e.name || ""); };
  const cancelEdit = () => { setEditingId(null); setDraft(""); };
  const commitEdit = (e) => {
    const name = draft.trim();
    if (name && name !== e.name) onRename?.(e.id, name);
    cancelEdit();
  };

  return (
    <div className="mx-auto w-full max-w-[1100px] p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-muted-foreground">
            <LayoutDashboard className="h-3.5 w-3.5" />Workspace
          </div>
          <h1 className="text-2xl font-semibold tracking-tight mt-1 capitalize">Welcome back, {firstName}</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
            <Cloud className="h-3.5 w-3.5 text-primary" />
            {presets.length === 0 ? "No saved studies yet" : `${presets.length} saved ${presets.length === 1 ? "study" : "studies"}`} · synced to your account
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Hint label="Refresh">
            <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </Hint>
          <Button size="sm" onClick={onNew}><FilePlus className="h-4 w-4 mr-1.5" />New study</Button>
        </div>
      </div>

      {loading && presets.length === 0 ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border py-16 text-[13px] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />Loading your studies…
        </div>
      ) : presets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 px-6 text-center">
          <div className="mx-auto h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <FlaskConical className="h-6 w-6 text-primary" />
          </div>
          <div className="mt-3 font-medium">Start your first validation study</div>
          <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted-foreground leading-relaxed">
            Create a study, enter your data across the modules, and save it — it'll appear here and stay
            synced to your account on every device.
          </p>
          <Button className="mt-4" onClick={onNew}><FilePlus className="h-4 w-4 mr-1.5" />New study</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {presets.map((e) => (
            <div key={e.id}
              className="group flex flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50">
              <div className="flex items-start gap-2">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <FlaskConical className="h-4.5 w-4.5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  {editingId === e.id ? (
                    <Input
                      autoFocus value={draft} onChange={(ev) => setDraft(ev.target.value)}
                      onKeyDown={(ev) => { if (ev.key === "Enter") commitEdit(e); if (ev.key === "Escape") cancelEdit(); }}
                      onBlur={() => commitEdit(e)}
                      className="h-7 text-[14px] px-2 py-1"
                    />
                  ) : (
                    <div className="font-medium text-[14px] truncate" title={e.name}>{e.name}</div>
                  )}
                  <div className="text-[11px] text-muted-foreground font-data truncate mt-0.5">
                    {[e.analyte, e.matrix].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground mt-3">
                {e.savedAt ? `Saved ${new Date(e.savedAt).toLocaleString()}` : ""}
              </div>
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                {editingId === e.id ? (
                  <>
                    <Button size="sm" className="flex-1 h-8" onMouseDown={(ev) => ev.preventDefault()} onClick={() => commitEdit(e)}>
                      <Check className="h-3.5 w-3.5 mr-1.5" />Save name
                    </Button>
                    <Hint label="Cancel">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onMouseDown={(ev) => ev.preventDefault()} onClick={cancelEdit}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </Hint>
                  </>
                ) : (
                  <>
                    <Button variant="outline" size="sm" className="flex-1 h-8" onClick={() => onOpen(e)}>
                      <Upload className="h-3.5 w-3.5 mr-1.5" />Open
                    </Button>
                    <Hint label="Rename">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => startEdit(e)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </Hint>
                    <Hint label="Delete">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={() => onDelete(e)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </Hint>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

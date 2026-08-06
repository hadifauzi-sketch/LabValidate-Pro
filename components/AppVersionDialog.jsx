/* ══════════════════════════════════════════════════════════════════════════
   AppVersionDialog — "App version" from the ⚙ Settings menu.

   Shows the version this build is running and the release history behind it,
   read from lib/appVersion.js (the single source of truth shared with the
   About dialog). Nothing here is computed; to change what it says, edit
   CHANGELOG rather than this file.
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect } from "react";
import { History, X, Sparkles, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_VERSION, APP_VERSION_DATE, CHANGELOG } from "@/lib/appVersion";

function Release({ entry, last }) {
  return (
    <li className="relative pl-7">
      {/* The timeline: a dot per release, and a rule joining it to the next. */}
      <span
        className={`absolute left-[5px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-card ${
          entry.current ? "bg-primary" : "bg-border"}`}
        aria-hidden="true"
      />
      {!last && <span className="absolute left-[10px] top-4 bottom-0 w-px bg-border" aria-hidden="true" />}

      <div className={last ? "" : "pb-5"}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`font-data text-[12px] font-semibold ${entry.current ? "text-primary" : "text-foreground"}`}>
            v{entry.version}
          </span>
          {entry.current && (
            <span className="rounded-full border border-primary/40 bg-primary/10 px-1.5 py-px text-[9px] font-medium uppercase tracking-wider text-primary">
              Current
            </span>
          )}
          <span className="text-[11px] text-muted-foreground">{entry.date}</span>
        </div>
        {entry.title && <div className="mt-0.5 text-[13px] font-medium">{entry.title}</div>}

        <ul className="mt-1.5 space-y-1.5">
          {entry.notes.map((note, i) => (
            <li key={i} className="flex gap-2 text-[12px] leading-relaxed text-muted-foreground">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" aria-hidden="true" />
              <span>{note}</span>
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}

export function AppVersionDialog({ open, onClose }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="lvp-no-print fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative flex max-h-[90vh] w-full max-w-[min(34rem,96vw)] flex-col rounded-xl border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="App version"
      >
        {/* Header stays put; only the release list below scrolls. */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            <div className="text-sm font-semibold">App version</div>
          </div>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary">
              <FlaskConical className="h-6 w-6 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold tracking-tight">LabValidate <span className="text-primary">Pro</span></div>
              <div className="font-data text-[12px] text-muted-foreground">
                Version {APP_VERSION} · {APP_VERSION_DATE}
              </div>
            </div>
            <Sparkles className="ml-auto h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          </div>

          <div className="mb-3 mt-5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            What changed
          </div>
          <ol className="relative">
            {CHANGELOG.map((entry, i) => (
              <Release key={entry.version} entry={entry} last={i === CHANGELOG.length - 1} />
            ))}
          </ol>

          <div className="mt-4 border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
            Studies saved with an older version stay readable — new releases add modules and
            calculations rather than change the file format.
          </div>
        </div>
      </div>
    </div>
  );
}

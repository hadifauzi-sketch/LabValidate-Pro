import { FlaskConical, X, ExternalLink, ShieldCheck, Cloud, Info, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

const LINKEDIN_URL = "https://www.linkedin.com/in/chm-hadi-fauzi";

export function AboutDialog({ open, onClose, onOpenTerms }) {
  if (!open) return null;
  return (
    <div className="lvp-no-print fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 overflow-y-auto" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative w-full max-w-md mt-[8vh] rounded-xl border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-primary" />
            <div className="text-sm font-semibold">About this app</div>
          </div>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-primary flex items-center justify-center shrink-0">
              <FlaskConical className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <div className="font-semibold tracking-tight">LabValidate <span className="text-primary">Pro</span></div>
              <div className="text-[11px] font-data text-muted-foreground">Version 1.1.0</div>
            </div>
          </div>

          <p className="text-[13px] text-muted-foreground leading-relaxed">
            A method <b>validation &amp; verification</b> workspace for analytical laboratories — plan a study,
            enter data, and get the statistics and pass/fail checks for each performance characteristic,
            ready to compile into a report.
          </p>

          <div className="space-y-2">
            <div className="flex items-start gap-2 text-[12px]">
              <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <span>Aligned with <b>EURACHEM</b> “Fitness for Purpose of Analytical Methods”, 3rd Ed. (2025) and
                <b> ISO/IEC 17025:2017</b>.</span>
            </div>
            <div className="flex items-start gap-2 text-[12px]">
              <Cloud className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <span>Studies are saved to your account and synced across devices, or kept locally when you work as a guest.</span>
            </div>
          </div>

          <div className="rounded-lg border border-border p-3 text-[12px]">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Developed by</div>
            <a href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline">
              ChM. Ts. Hadi Fauzi <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>

          <button type="button" onClick={onOpenTerms}
            className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-[12px] font-medium transition-colors hover:bg-muted">
            <FileText className="h-4 w-4 text-primary shrink-0" />
            Terms &amp; Conditions
            <span className="ml-auto text-muted-foreground">View</span>
          </button>
        </div>
      </div>
    </div>
  );
}

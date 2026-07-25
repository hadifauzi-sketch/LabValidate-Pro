import { useState } from "react";
import {
  GraduationCap, X, ChevronRight, ChevronLeft, ClipboardList, Activity,
  Target, Save, LayoutDashboard, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const STEPS = [
  {
    icon: ClipboardList,
    title: "1 · Plan the study",
    body: "Open Study Plan and set the analyte, matrix, unit, and whether you're doing a full validation or verifying a standard method. This drives the acceptance criteria used everywhere else.",
  },
  {
    icon: Activity,
    title: "2 · Enter data per characteristic",
    body: "Work down the left rail — Linearity, LOD/LOQ, Trueness, Precision, Recovery, Ruggedness, Uncertainty. Paste or type replicate results; each module computes its statistics live.",
  },
  {
    icon: Target,
    title: "3 · Read the pass / fail checks",
    body: "Each module shows a status dot and a verdict against the Eurachem/ISO criteria. Green means the characteristic meets the target; amber/red flags what to review.",
  },
  {
    icon: Save,
    title: "4 · Save your study",
    body: "Use Save (or Presets) to store the study. Signed in, it's saved to your account in the cloud; as a guest it's kept in this browser or a folder you choose.",
  },
  {
    icon: LayoutDashboard,
    title: "5 · Your workspace",
    body: "When you're signed in, the Workspace lists every saved study as a card — open one to keep working, or start a new study. Everything stays in sync across your devices.",
  },
];

export function TutorialDialog({ open, onClose }) {
  const [i, setI] = useState(0);
  if (!open) return null;

  const step = STEPS[i];
  const last = i === STEPS.length - 1;
  const StepIcon = step.icon;

  const close = () => { setI(0); onClose(); };

  return (
    <div className="lvp-no-print fixed inset-0 z-50 flex items-center justify-center p-4" onClick={close}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative w-full max-w-md rounded-xl border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-primary" />
            <div className="text-sm font-semibold">Tutorial</div>
          </div>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={close}><X className="h-4 w-4" /></Button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <StepIcon className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-1">
              <div className="font-semibold text-[15px] tracking-tight">{step.title}</div>
              <p className="text-[13px] text-muted-foreground leading-relaxed">{step.body}</p>
            </div>
          </div>

          <div className="flex items-center justify-center gap-1.5">
            {STEPS.map((_, idx) => (
              <button key={idx} onClick={() => setI(idx)} aria-label={`Step ${idx + 1}`}
                className={`h-1.5 rounded-full transition-all ${idx === i ? "w-5 bg-primary" : "w-1.5 bg-border"}`} />
            ))}
          </div>

          <div className="flex items-center justify-between pt-1">
            <Button variant="ghost" size="sm" onClick={() => setI((v) => Math.max(0, v - 1))} disabled={i === 0}>
              <ChevronLeft className="h-4 w-4 mr-1" />Back
            </Button>
            {last ? (
              <Button size="sm" onClick={close}><CheckCircle2 className="h-4 w-4 mr-1.5" />Got it</Button>
            ) : (
              <Button size="sm" onClick={() => setI((v) => Math.min(STEPS.length - 1, v + 1))}>
                Next<ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   CalcSteps — shared shell and building blocks for the "how was this
   calculated" modals that sit behind the result cards.

   Each module gets its own dialog file holding only its explanation engine
   (StatCalcDialog for LOD/LOQ, LinearityCalcDialog for Linearity & Range …).
   Everything they have in common — the modal chrome, the numbered-step
   renderer, the formatters and the recurring standard-deviation walkthrough —
   lives here so the modals stay identical to each other and to the app.

   An explanation object is:
     { title, subtitle, result, why, steps: [step], footer }
   and a step is:
     { title, formula, table: { head, rows, foot }, work: [string], note,
       highlightLast }
   Falsy entries in `steps` are dropped, so steps can be included
   conditionally with `cond && { … }`.
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect } from "react";
import { X, Calculator, Info } from "lucide-react";
import { Button } from "@/components/ui/button";

/* ── formatters & statistics ─────────────────────────────────────────────── */
// toFixed/toPrecision throw a RangeError on an out-of-range digit count, which
// takes the whole dialog down. Anything that is not a usable integer — including
// the array Array.map passes as its third argument — falls back to the default.
const digits = (d, dflt, lo) => (Number.isInteger(d) && d >= lo && d <= 100 ? d : dflt);
export const fmt = (v, d = 4) => (v === null || v === undefined || isNaN(v) ? "—" : (+v).toFixed(digits(d, 4, 0)));
export const fmtSig = (v, d = 4) => (v === null || v === undefined || isNaN(v) ? "—" : (+v).toPrecision(digits(d, 4, 1)));
export const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
export const sumSq = (a) => { const m = mean(a); return a.reduce((s, x) => s + (x - m) ** 2, 0); };
/** Signed term for writing a sum out longhand: "0.001 + 0.002 − 0.0004". */
export const signed = (v, i, d = 3) => (i === 0 ? fmtSig(v, d) : v < 0 ? `− ${fmtSig(-v, d)}` : `+ ${fmtSig(v, d)}`);

/* ── presentation atoms ─────────────────────────────────────────────────── */
export const Mono = ({ children, accent }) => (
  <div className={`font-data text-[12px] rounded-md border px-2.5 py-1.5 overflow-x-auto whitespace-pre-wrap break-words ${
    accent ? "border-primary/40 bg-primary/5 text-foreground font-semibold" : "border-border bg-card text-foreground"}`}>
    {children}
  </div>
);

export const StepTable = ({ head, rows, foot }) => (
  <div className="overflow-x-auto rounded-md border border-border bg-card">
    <table className="w-full text-[11px] font-data border-collapse">
      <thead>
        <tr className="border-b border-border text-muted-foreground">
          {head.map((h, i) => (
            <th key={i} className={`px-2.5 py-1.5 font-medium whitespace-nowrap ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-border/40 last:border-0">
            {r.map((c, j) => (
              <td key={j} className={`px-2.5 py-1 whitespace-nowrap ${j === 0 ? "text-left text-muted-foreground" : "text-right"}`}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
      {foot && (
        <tfoot>
          <tr className="border-t border-border bg-muted/40 font-semibold">
            {foot.map((c, j) => (
              <td key={j} className={`px-2.5 py-1.5 whitespace-nowrap ${j === 0 ? "text-left" : "text-right"}`}>{c}</td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  </div>
);

export const Step = ({ index, step }) => (
  // break-inside-avoid keeps a step whole when the list flows into columns;
  // the margin lives here rather than on the <ol> because space-y utilities
  // behave badly across a column break.
  <li className="flex gap-3 mb-5 break-inside-avoid">
    <div className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-primary/10 text-primary text-[10px] font-semibold font-data flex items-center justify-center">
      {index}
    </div>
    <div className="min-w-0 flex-1 space-y-1.5">
      {step.title && <div className="text-[12px] leading-relaxed text-foreground">{step.title}</div>}
      {step.formula && <Mono>{step.formula}</Mono>}
      {step.table && <StepTable {...step.table} />}
      {(step.work || []).map((w, i) => (
        <Mono key={i} accent={step.highlightLast && i === step.work.length - 1}>{w}</Mono>
      ))}
      {step.note && <div className="text-[11px] leading-relaxed text-muted-foreground">{step.note}</div>}
    </div>
  </li>
);

/* ── recurring walkthroughs ─────────────────────────────────────────────── */

/** The sample standard deviation, worked through a deviation table. */
export const sdSteps = (values, unit, { sym = "s", vSym = "xᵢ", mSym = "x̄" } = {}) => {
  const n = values.length;
  const m = mean(values);
  const ss = sumSq(values);
  const v = ss / (n - 1);
  const u = unit ? ` ${unit}` : "";
  return [
    {
      title: `Subtract the mean ${mSym} = ${fmtSig(m)}${u} from every value, then square each difference. Squaring removes the sign, so values below and above the mean both add to the spread.`,
      table: {
        head: ["#", `${vSym}${unit ? ` (${unit})` : ""}`, `${vSym} − ${mSym}`, `(${vSym} − ${mSym})²`],
        rows: values.map((x, i) => [String(i + 1), fmtSig(x), fmtSig(x - m, 3), fmtSig((x - m) ** 2, 3)]),
        foot: ["Σ", "", "", fmtSig(ss, 4)],
      },
    },
    {
      title: `Divide that sum of squares by n − 1 = ${n - 1}. The result is the variance.`,
      formula: `${sym}² = Σ(${vSym} − ${mSym})² / (n − 1)`,
      work: [`${sym}² = ${fmtSig(ss, 4)} / ${n - 1} = ${fmtSig(v, 4)}`],
      note: `n − 1 rather than n (Bessel's correction) because ${mSym} was estimated from these same values — one degree of freedom is already spent.`,
    },
    {
      title: "Take the square root to get back to the original units.",
      work: [`${sym} = √${fmtSig(v, 4)} = ${fmtSig(Math.sqrt(v))}${u}`],
      highlightLast: true,
    },
  ];
};

/** "Here is the data you typed in" opening step. */
export const dataStep = (values, unit, what, vSym = "xᵢ") => ({
  title: `Take the ${values.length} ${what} you entered above. Blank input boxes are ignored, so n = ${values.length}.`,
  table: {
    head: ["#", `${vSym}${unit ? ` (${unit})` : ""}`],
    rows: values.map((x, i) => [String(i + 1), fmtSig(x)]),
  },
});

/* Rough estimate of how tall an explanation will render, in arbitrary units.
   A bare step costs little; a data table with many rows costs a lot. Used to
   decide how much of the screen the modal should claim — a three-step
   explanation in a 1400 px window looks silly, a nine-step one needs it. */
const heightOf = (steps) =>
  steps.reduce((n, s) => n + 2
    + (s.table ? 2 + s.table.rows.length * 0.8 : 0)
    + (s.work ? s.work.length : 0)
    + (s.formula ? 1 : 0)
    + (s.note ? 1 : 0), 0);

/* ══════════════════════════════════════════════════════════════════════════
   The modal itself. Fully controlled: the caller decides which explanation to
   build and passes it in; `ex = null` renders the empty state.

   Sizing is driven by the viewport rather than fixed pixels, so the same
   explanation uses a 27" monitor properly and still fits a laptop. Long
   explanations widen and flow into as many ~26rem columns as the width
   allows, which keeps line length readable and cuts the scrolling roughly in
   half per extra column.
   ══════════════════════════════════════════════════════════════════════════ */
export function CalcDialogShell({ open, onClose, ex, unit }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const resultUnit = ex && "unit" in ex ? ex.unit : unit;
  const steps = ex ? ex.steps.filter(Boolean) : [];
  const tall = heightOf(steps) >= 18;

  return (
    <div className="lvp-no-print fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className={`relative flex max-h-[94vh] w-full flex-col rounded-xl border border-border bg-card shadow-xl ${
        tall ? "max-w-[min(96rem,96vw)]" : "max-w-[min(42rem,96vw)]"}`}
        onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">

        {/* Header stays put; only the body below it scrolls, so Close is always reachable. */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <Calculator className="h-4 w-4 text-primary shrink-0" />
            <div className="text-sm font-semibold truncate">
              How <span className="text-primary">{ex ? ex.title : "this"}</span> is calculated
            </div>
          </div>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {!ex ? (
          <div className="p-5 text-[13px] text-muted-foreground">
            Nothing to show yet — enter the measurement data for this module first.
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {/* On a wide screen the result and the explanation sit side by side
                rather than stacking, which buys back a chunk of height. */}
            <div className={`grid gap-3 ${tall ? "lg:grid-cols-[minmax(15rem,auto)_1fr] lg:items-stretch" : ""}`}>
              <div className="flex flex-col justify-center rounded-lg border border-emerald-600/40 bg-emerald-600/5 px-4 py-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{ex.subtitle}</div>
                <div className="font-data text-2xl font-semibold text-emerald-600 mt-0.5">
                  {ex.result}
                  {resultUnit && <span className="text-[12px] text-muted-foreground ml-1.5 font-normal">{resultUnit}</span>}
                </div>
              </div>

              <div className="flex gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
                <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div>{ex.why}</div>
              </div>
            </div>

            <div className="mt-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-3">
                Step by step, from your data
              </div>
              {/* columns-[26rem] asks for as many ~26rem columns as fit, so the
                  layout follows the viewport instead of fixed breakpoints. */}
              <ol className={tall ? "columns-[26rem] gap-x-8" : ""}>
                {steps.map((st, i) => <Step key={i} index={i + 1} step={st} />)}
              </ol>
            </div>

            {ex.footer && (
              <div className="border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
                {ex.footer}
              </div>
            )}

            <div className="mt-2 text-[11px] text-muted-foreground">
              Tip — click any other result card to see its working.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

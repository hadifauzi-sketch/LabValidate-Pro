/* ══════════════════════════════════════════════════════════════════════════
   FtSummaryCalcDialog — "show me the arithmetic" modal for the Summary table
   in the F & t Tests module.

   The stat cards above answer "what is this number?"; this table answers
   "what did the test decide, and why?". So these walkthroughs are framed as
   hypothesis tests — the null being tested, the statistic, the critical
   value, the verdict — and each closes with what the test could and could not
   have detected, which a bare pass/fail cannot convey.

   Holds only the summary-row explanations — the modal chrome and formatters
   come from CalcSteps.
   ══════════════════════════════════════════════════════════════════════════ */
import { CalcDialogShell, fmt, fmtSig } from "@/components/CalcSteps";

/* ══════════════════════════════════════════════════════════════════════════
   The explanation engine — one builder per summary row.
   ══════════════════════════════════════════════════════════════════════════ */
function buildExplain(row, { comp: K, unit, labels }) {
  if (!K || K.mode !== "twoSample") return null;
  const la = labels?.a || "A";
  const lb = labels?.b || "B";
  const F = K.f, T = K.tt;

  switch (row) {
    /* ──────────────────────── F (variances) row ─────────────────────────── */
    case "F": {
      const largerLabel = F.aLarger ? la : lb;
      const smallerLabel = F.aLarger ? lb : la;
      const vLarger = F.aLarger ? F.va : F.vb;
      const vSmaller = F.aLarger ? F.vb : F.va;
      const detectableRatio = Math.sqrt(F.fCrit);
      return {
        title: "F (variances)",
        subtitle: "does the precision of the two data sets differ?",
        result: fmt(F.F, 3), unit: "",
        why: `The first of the two linked tests. It asks whether the two data sets scatter by different amounts — a question worth answering in its own right, since it tells you whether one method or laboratory is measurably less precise than the other. Its outcome also decides which t-test may legitimately be used on the means.`,
        steps: [
          {
            title: "The hypothesis being tested.",
            work: [
              `H₀ : the two populations have equal variance  (σ²${la} = σ²${lb})`,
              `H₁ : they differ, in either direction`,
            ],
            note: "A test never proves H₀. It either finds enough evidence to reject it, or it does not.",
          },
          {
            title: "STATISTIC — the ratio of the two sample variances, larger on top so F is always ≥ 1 and one upper critical value suffices.",
            formula: "F = s²(larger) / s²(smaller)",
            work: [
              `s(${la}) = ${fmtSig(F.sa)} ${unit}   →   s² = ${fmtSig(F.va, 4)}`,
              `s(${lb}) = ${fmtSig(F.sb)} ${unit}   →   s² = ${fmtSig(F.vb, 4)}`,
              `F = ${fmtSig(vLarger, 4)} / ${fmtSig(vSmaller, 4)} = ${fmt(F.F, 3)}`,
            ],
            note: `${largerLabel} is the noisier of the two, so its variance goes on top; ${smallerLabel} goes underneath.`,
            highlightLast: true,
          },
          {
            title: `CRITICAL VALUE — the largest ratio chance alone would plausibly produce. Degrees of freedom follow the order the ratio was formed in: numerator ${F.df1}, denominator ${F.df2}.`,
            work: [`F crit (α = 0.05 two-tailed; df ${F.df1}, ${F.df2}) = ${fmt(F.fCrit, 2)}`],
            note: "Tabulated at the one-tailed 0.025 point, which delivers a two-tailed test at 5 % — the question is whether the variances differ, not whether one particular set is the noisier.",
          },
          {
            title: "OUTCOME.",
            work: [
              `${fmt(F.F, 3)} ${F.significant ? ">" : "≤"} ${fmt(F.fCrit, 2)}  →  ${F.significant ? "reject H₀ — variances differ" : "do not reject H₀ — variances comparable"}`,
            ],
            highlightLast: true,
            note: `This is what the chart below plots: the F distribution for df (${F.df1}, ${F.df2}), with your F at ${fmt(F.F, 2)} and the critical value at ${fmt(F.fCrit, 2)}. The area beyond F crit is the 5 % the test is willing to attribute to chance.`,
          },
          {
            title: "CONSEQUENCE — this outcome selects the t-test on the row below.",
            note: F.significant
              ? "Variances differ, so they must not be pooled. Welch's t-test is used instead, which keeps them separate and reduces the degrees of freedom to compensate."
              : "Variances are comparable, so the two data sets can share a single pooled estimate of the spread. That buys degrees of freedom and makes the t-test more sensitive.",
          },
          {
            title: "What this test could actually have detected:",
            work: [
              `smallest detectable variance ratio = F crit = ${fmt(F.fCrit, 2)}`,
              `i.e. one SD would have to be ${fmt(detectableRatio, 2)}× the other before this test would notice`,
            ],
            note: `With ${F.df1 + 1} and ${F.df2 + 1} results the F-test has very little power. A "comparable" verdict here is weak evidence of equal precision — it rules out a gross difference, not a modest one. The test is also sensitive to non-normal data.`,
          },
        ],
        footer: "Eurachem §6.3 / ISO/IEC 17025 §7.2.2. Run this test first: using a pooled t-test when the variances genuinely differ inflates the false-positive rate.",
      };
    }

    /* ───────────────────────── t (means) row ────────────────────────────── */
    case "t": {
      const ci = T.tCrit * T.se;
      const mde = T.tCrit * T.se;
      return {
        title: `t (${K.pooled ? "pooled" : "Welch"})`,
        subtitle: "do the two means differ?",
        result: fmt(T.t, 3), unit: "",
        why: `The question the module exists to answer. Two sets of measurements never average to exactly the same value, so a difference on its own proves nothing. The t-test weighs the observed difference against how precisely that difference is known — if it is only a fraction of its own uncertainty, chance explains it perfectly well.`,
        steps: [
          {
            title: "The hypothesis being tested.",
            work: [
              `H₀ : the two populations have equal means  (µ${la} = µ${lb})`,
              `H₁ : they differ, in either direction`,
            ],
          },
          {
            title: `WHICH TEST — inherited from the F-test above: variances came out ${F.significant ? "significantly different" : "comparable"}, so the ${K.pooled ? "pooled-variance" : "Welch"} form applies.`,
            note: K.pooled
              ? "Pooling estimates one standard deviation from all the data, which is the more sensitive choice when it is justified."
              : "Welch keeps the variances separate and adjusts the degrees of freedom downward — a slightly blunter test, but the valid one here.",
          },
          {
            title: "The difference being tested.",
            work: [
              `mean ${la} = ${fmtSig(T.m1)} ${unit}   (n = ${T.n1})`,
              `mean ${lb} = ${fmtSig(T.m2)} ${unit}   (n = ${T.n2})`,
              `difference = ${fmtSig(T.diff)} ${unit}`,
            ],
          },
          K.pooled
            ? {
                title: "Pool the variances, weighted by degrees of freedom, then form the standard error of the difference.",
                formula: "sp² = [ (n₁−1)s₁² + (n₂−1)s₂² ] / (n₁+n₂−2)        se = sp · √( 1/n₁ + 1/n₂ )",
                work: [
                  `sp² = [ ${T.n1 - 1} × ${fmtSig(T.v1, 4)} + ${T.n2 - 1} × ${fmtSig(T.v2, 4)} ] / ${T.n1 + T.n2 - 2} = ${fmtSig(T.sp2, 4)}`,
                  `sp  = √${fmtSig(T.sp2, 4)} = ${fmtSig(T.sp)} ${unit}`,
                  `se  = ${fmtSig(T.sp)} × √( 1/${T.n1} + 1/${T.n2} ) = ${fmtSig(T.se)} ${unit}`,
                ],
              }
            : {
                title: "Keep the variances separate and form the standard error of the difference from both.",
                formula: "se = √( s₁²/n₁ + s₂²/n₂ )",
                work: [
                  `s₁²/n₁ = ${fmtSig(T.v1, 4)} / ${T.n1} = ${fmtSig(T.v1 / T.n1, 4)}`,
                  `s₂²/n₂ = ${fmtSig(T.v2, 4)} / ${T.n2} = ${fmtSig(T.v2 / T.n2, 4)}`,
                  `se = √( ${fmtSig(T.v1 / T.n1, 4)} + ${fmtSig(T.v2 / T.n2, 4)} ) = ${fmtSig(T.se)} ${unit}`,
                ],
              },
          {
            title: "STATISTIC — the difference expressed in units of its own standard error.",
            formula: "t = | difference | / se",
            work: [`t = |${fmtSig(T.diff)}| / ${fmtSig(T.se)} = ${fmt(T.t, 3)}`],
            highlightLast: true,
          },
          {
            title: K.pooled
              ? `CRITICAL VALUE — two-tailed 95 % at df = n₁ + n₂ − 2 = ${T.df}.`
              : `CRITICAL VALUE — two-tailed 95 % at the Welch–Satterthwaite df = ${fmt(T.df, 1)}.`,
            work: [`t crit = ${fmt(T.tCrit, 3)}`],
            note: K.pooled
              ? "Pooling is what earns these degrees of freedom — both data sets contribute to the one variance estimate."
              : "The fractional degrees of freedom come from the Welch–Satterthwaite approximation, which trades power for validity when the variances differ.",
          },
          {
            title: "OUTCOME.",
            work: [
              `${fmt(T.t, 3)} ${T.significant ? ">" : "≤"} ${fmt(T.tCrit, 3)}  →  ${T.significant ? "reject H₀ — the means differ" : "do not reject H₀ — no significant difference"}`,
            ],
            highlightLast: true,
          },
          {
            title: "What this test could actually have detected:",
            work: [
              `95 % CI on the difference = ${fmtSig(T.diff)} ± ${fmt(T.tCrit, 3)} × ${fmtSig(T.se)}`,
              `                          = ${fmtSig(T.diff - ci)}  to  ${fmtSig(T.diff + ci)} ${unit}`,
              `smallest detectable difference ≈ t crit × se = ${fmtSig(mde, 3)} ${unit}`,
            ],
            note: T.significant
              ? "The interval excludes zero, matching the verdict. Read it to see how large the difference plausibly is — significance says it is real, the interval says how big."
              : `The interval includes zero, so no difference is demonstrated. But a real difference smaller than about ${fmtSig(mde, 3)} ${unit} would have slipped through unnoticed — "no significant difference" is not the same as "the two agree exactly".`,
          },
          !T.significant && {
            title: "If you need to claim the two are equivalent:",
            note: "This test cannot do that. It only failed to find a difference. Demonstrating equivalence needs a pre-stated acceptable difference and an equivalence test (TOST) against it — a different question with a different answer.",
          },
        ],
        footer: `Both tests are two-tailed at 95 %: a difference in either direction counts. ${T.significant ? "Investigate the bias before treating the two as interchangeable." : "Consistent with equivalent performance, within what this study could resolve."}`,
      };
    }

    default:
      return null;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Fully controlled — `row` selects the summary row, `onClose` clears it.
   ══════════════════════════════════════════════════════════════════════════ */
export function FtSummaryCalcDialog({ open, onClose, row, comp, unit, labels }) {
  const ex = open ? buildExplain(row, { comp, unit, labels }) : null;
  return <CalcDialogShell open={open} onClose={onClose} ex={ex} unit={unit} />;
}

export default FtSummaryCalcDialog;

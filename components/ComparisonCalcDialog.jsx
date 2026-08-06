/* ══════════════════════════════════════════════════════════════════════════
   ComparisonCalcDialog — "show me the arithmetic" modal for the F & t Tests
   result cards, covering both modes the module offers:

     • Two data sets — mean A, mean B, difference, s A, s B
     • One data set  — mean, reference, bias, bias %, t, t crit

   The two tests are linked, and the walkthroughs say so: the F-test compares
   the variances, and its outcome decides whether the means are compared with
   a pooled-variance t-test or with Welch's. The Difference card carries that
   whole chain end to end.

   Holds only the F & t explanations — the modal chrome, formatters and the
   shared standard-deviation walkthrough come from CalcSteps.
   ══════════════════════════════════════════════════════════════════════════ */
import { CalcDialogShell, fmt, fmtSig, mean, sdSteps, dataStep } from "@/components/CalcSteps";

/* Both data sets side by side — the opening step for the two-sample cards. */
const pairStep = (a, b, la, lb, unit) => ({
  title: "The two data sets being compared, as entered.",
  table: {
    head: ["#", `${la} (${unit})`, `${lb} (${unit})`],
    rows: Array.from({ length: Math.max(a.length, b.length) }, (_, i) => [
      String(i + 1),
      i < a.length ? fmtSig(a[i]) : "—",
      i < b.length ? fmtSig(b[i]) : "—",
    ]),
    foot: ["mean", fmtSig(mean(a)), fmtSig(mean(b))],
  },
  note: `n = ${a.length} and ${b.length}. The sets need not be the same size — the tests handle that.`,
});

/* The F-test, worked through. Shared by the s A, s B and Difference cards. */
const fTestSteps = (F, la, lb, unit) => {
  const largerLabel = F.aLarger ? la : lb;
  const smallerLabel = F.aLarger ? lb : la;
  const vLarger = F.aLarger ? F.va : F.vb;
  const vSmaller = F.aLarger ? F.vb : F.va;
  return [
    {
      title: "Compare the two variances by putting the larger one on top — that way F is always ≥ 1 and a single upper critical value suffices.",
      formula: "F = s²(larger) / s²(smaller)",
      work: [
        `s²(${largerLabel}) = ${fmtSig(vLarger, 4)}   ← larger`,
        `s²(${smallerLabel}) = ${fmtSig(vSmaller, 4)}`,
        `F = ${fmtSig(vLarger, 4)} / ${fmtSig(vSmaller, 4)} = ${fmt(F.F, 3)}`,
      ],
    },
    {
      title: `Compare with the critical value. Degrees of freedom follow the order the ratio was formed in: numerator df = ${F.df1}, denominator df = ${F.df2}.`,
      work: [
        `F crit (α = 0.05 two-tailed; df ${F.df1}, ${F.df2}) = ${fmt(F.fCrit, 2)}`,
        `${fmt(F.F, 3)} ${F.significant ? ">" : "≤"} ${fmt(F.fCrit, 2)}  →  ${F.significant ? "variances differ significantly" : "variances are comparable"}`,
      ],
      note: "The tabulated value is the one-tailed 0.025 point, which gives a two-tailed test at 5 % — the question is whether the variances differ, not whether one particular set is the noisier.",
    },
  ];
};

/* ══════════════════════════════════════════════════════════════════════════
   The explanation engine — one builder per F & t card.
   ══════════════════════════════════════════════════════════════════════════ */
function buildExplain(statKey, { comp: K, unit, labels }) {
  if (!K) return null;
  const la = labels?.a || "A";
  const lb = labels?.b || "B";
  const two = K.mode === "twoSample";
  const T = K.tt, F = K.f;

  switch (statKey) {
    /* ═════════════════════════ Two data sets ══════════════════════════════ */

    case "meanA":
    case "meanB": {
      if (!two) return null;
      const isA = statKey === "meanA";
      const set = isA ? K.a : K.b;
      const lbl = isA ? la : lb;
      const other = isA ? lb : la;
      const m = isA ? T.m1 : T.m2;
      const sum = set.reduce((x, y) => x + y, 0);
      return {
        title: `Mean ${lbl}`,
        subtitle: `x̄ — the average of the ${lbl} results`,
        result: fmtSig(m), unit,
        why: `Each data set is reduced to one number before the sets can be compared. Individual results scatter, so the comparison is made between the two means — and how much confidence that comparison deserves depends on how many results stand behind each mean, which is why n follows it everywhere.`,
        steps: [
          dataStep(set, unit, `${lbl} results`),
          {
            title: "The arithmetic mean.",
            formula: "x̄ = Σxᵢ / n",
          },
          {
            title: `Add the ${set.length} results and divide.`,
            work: [
              `Σx = ${fmtSig(sum, 6)} ${unit}`,
              `x̄ = ${fmtSig(sum, 6)} / ${set.length} = ${fmtSig(m)} ${unit}`,
            ],
            highlightLast: true,
          },
          {
            title: `Against ${other}:`,
            work: [
              `mean ${la} = ${fmtSig(T.m1)} ${unit}   (n = ${T.n1})`,
              `mean ${lb} = ${fmtSig(T.m2)} ${unit}   (n = ${T.n2})`,
              `difference = ${fmtSig(T.diff)} ${unit}`,
            ],
            note: "Whether that difference is real is settled on the Difference card.",
          },
        ],
        footer: "Both means are only as trustworthy as the data behind them — check for outliers before reading anything into a small difference.",
      };
    }

    case "diff": {
      if (!two) return null;
      const ci = T.tCrit * T.se;
      return {
        title: "Difference",
        subtitle: `mean ${la} − mean ${lb}`,
        result: fmtSig(T.diff), unit,
        why: `The number the whole module exists to judge. Two sets of measurements will never average to exactly the same value, so the question is never "is there a difference?" — it is "is this difference bigger than the scatter can explain?". Answering it takes two linked tests, both worked through below.`,
        steps: [
          pairStep(K.a, K.b, la, lb, unit),
          {
            title: "The difference itself is just a subtraction.",
            formula: `difference = mean ${la} − mean ${lb}`,
            work: [`difference = ${fmtSig(T.m1)} − ${fmtSig(T.m2)} = ${fmtSig(T.diff)} ${unit}`],
            note: `A negative value means ${la} reads lower than ${lb}.`,
          },
          {
            title: "STEP 1 — the F-test. Before the means can be compared, the two spreads must be checked, because that decides which t-test is valid.",
          },
          ...fTestSteps(F, la, lb, unit),
          {
            title: `STEP 2 — the F-test outcome selects the t-test: ${K.pooled ? "variances comparable, so the two data sets can share one pooled estimate of the spread." : "variances differ, so they must not be pooled — Welch's t-test is used instead."}`,
            note: K.pooled
              ? "Pooling uses all the data to estimate a single standard deviation, which buys degrees of freedom and makes the test more sensitive."
              : "Welch keeps the two variances separate and reduces the degrees of freedom to compensate — a slightly blunter test, but the honest one when the spreads genuinely differ.",
          },
          K.pooled
            ? {
                title: "Pool the two variances, weighted by their degrees of freedom.",
                formula: "sp² = [ (n₁−1)·s₁² + (n₂−1)·s₂² ] / (n₁ + n₂ − 2)",
                work: [
                  `sp² = [ ${T.n1 - 1} × ${fmtSig(T.v1, 4)} + ${T.n2 - 1} × ${fmtSig(T.v2, 4)} ] / ${T.n1 + T.n2 - 2} = ${fmtSig(T.sp2, 4)}`,
                  `sp = √${fmtSig(T.sp2, 4)} = ${fmtSig(T.sp)} ${unit}`,
                ],
                note: "The larger data set pulls the pooled value towards its own variance — that is what the weighting does.",
              }
            : {
                title: "Keep the variances separate.",
                work: [
                  `s₁²/n₁ = ${fmtSig(T.v1, 4)} / ${T.n1} = ${fmtSig(T.v1 / T.n1, 4)}`,
                  `s₂²/n₂ = ${fmtSig(T.v2, 4)} / ${T.n2} = ${fmtSig(T.v2 / T.n2, 4)}`,
                ],
              },
          {
            title: "The standard error of the difference — how much the difference itself would bounce around on repeat studies.",
            formula: K.pooled
              ? "se = sp · √( 1/n₁ + 1/n₂ )"
              : "se = √( s₁²/n₁ + s₂²/n₂ )",
            work: [
              K.pooled
                ? `se = ${fmtSig(T.sp)} × √( 1/${T.n1} + 1/${T.n2} ) = ${fmtSig(T.se)} ${unit}`
                : `se = √( ${fmtSig(T.v1 / T.n1, 4)} + ${fmtSig(T.v2 / T.n2, 4)} ) = ${fmtSig(T.se)} ${unit}`,
            ],
          },
          {
            title: "Express the difference in units of its own standard error.",
            formula: "t = | difference | / se",
            work: [`t = |${fmtSig(T.diff)}| / ${fmtSig(T.se)} = ${fmt(T.t, 3)}`],
            highlightLast: true,
          },
          {
            title: K.pooled
              ? `Compare with the two-tailed 95 % critical value at df = n₁ + n₂ − 2 = ${T.df}.`
              : `Compare with the two-tailed 95 % critical value at the Welch–Satterthwaite df = ${fmt(T.df, 1)}.`,
            work: [
              `t crit = ${fmt(T.tCrit, 3)}`,
              `${fmt(T.t, 3)} ${T.significant ? ">" : "≤"} ${fmt(T.tCrit, 3)}  →  ${T.significant ? "the means differ significantly" : "no significant difference"}`,
            ],
            highlightLast: true,
          },
          {
            title: "How large a difference this study could actually have resolved:",
            work: [
              `95 % CI on the difference = ${fmtSig(T.diff)} ± ${fmt(T.tCrit, 3)} × ${fmtSig(T.se)}`,
              `                          = ${fmtSig(T.diff - ci)}  to  ${fmtSig(T.diff + ci)} ${unit}`,
            ],
            note: T.significant
              ? "The interval excludes zero, which is the same conclusion the t-test reached — read the interval to see how big the difference plausibly is."
              : `The interval includes zero, so no difference is demonstrated. But it also spans ±${fmtSig(ci, 2)} ${unit}: a real difference smaller than that would not have been detected. "No significant difference" is not the same as "the methods agree to within nothing".`,
          },
        ],
        footer: "Eurachem §6.3 / ISO/IEC 17025 §7.2.2. The two tests must be run in this order — using a pooled t-test when the F-test says the variances differ inflates the false-positive rate.",
      };
    }

    case "sA":
    case "sB": {
      if (!two) return null;
      const isA = statKey === "sA";
      const set = isA ? K.a : K.b;
      const lbl = isA ? la : lb;
      const s = isA ? F.sa : F.sb;
      const isLarger = isA ? F.aLarger : !F.aLarger;
      return {
        title: `s ${lbl}`,
        subtitle: `standard deviation of the ${lbl} results`,
        result: fmtSig(s), unit,
        why: `The spread of a data set does double duty here. It is a result in its own right — precision — and it is also the yardstick the difference between the means gets measured against. On top of that, comparing this spread with the other set's is what decides which t-test is legitimate.`,
        steps: [
          dataStep(set, unit, `${lbl} results`),
          {
            title: "The sample standard deviation:",
            formula: "s = √[ Σ(xᵢ − x̄)² / (n − 1) ]",
          },
          ...sdSteps(set, unit, { sym: "s" }),
          {
            title: `Now the F-test — is this spread genuinely different from ${isA ? lb : la}'s? ${isLarger ? "This set is the noisier of the two, so it goes on top of the ratio." : "The other set is the noisier of the two, so it goes on top of the ratio."}`,
          },
          ...fTestSteps(F, la, lb, unit),
          {
            title: "What that decides:",
            note: F.significant
              ? `The variances differ, so the means must be compared with Welch's t-test rather than a pooled one. It also matters in its own right: if these are two methods, one is measurably less precise than the other.`
              : `The variances are comparable, so the two sets can share a pooled standard deviation when the means are compared — see the Difference card.`,
          },
        ],
        footer: "The F-test is sensitive to non-normal data. With few replicates it also has little power, so a \"comparable\" verdict from small data sets is weak evidence of equal precision.",
      };
    }

    /* ═════════════════════════ One data set ═══════════════════════════════ */

    case "mean": {
      if (two) return null;
      const sum = K.a.reduce((x, y) => x + y, 0);
      return {
        title: "Mean",
        subtitle: "x̄ — the average of your results",
        result: fmtSig(K.mean), unit,
        why: `In one-sample mode the data set is compared against a single stated value rather than against another data set. The mean is your side of that comparison — the method's centre, estimated from ${K.a.length} results so that individual scatter averages out.`,
        steps: [
          dataStep(K.a, unit, "results"),
          {
            title: "The arithmetic mean.",
            formula: "x̄ = Σxᵢ / n",
          },
          {
            title: `Add the ${K.a.length} results and divide.`,
            work: [
              `Σx = ${fmtSig(sum, 6)} ${unit}`,
              `x̄ = ${fmtSig(sum, 6)} / ${K.a.length} = ${fmtSig(K.mean)} ${unit}`,
            ],
            highlightLast: true,
          },
          {
            title: "Against the reference value:",
            work: [
              `x̄        = ${fmtSig(K.mean)} ${unit}`,
              `reference = ${fmtSig(K.ref)} ${unit}`,
              `bias      = ${fmtSig(K.bias)} ${unit}`,
            ],
          },
        ],
        footer: "More replicates make the mean steadier — and the test sharper, since the standard error falls as 1/√n.",
      };
    }

    case "ref": {
      if (two) return null;
      return {
        title: "Reference",
        subtitle: "the target value — entered, not calculated",
        result: fmtSig(K.ref), unit,
        why: `This is the value your results are being tested against. Nothing is computed here: it comes from outside the study, and everything else on this page is measured relative to it. Its own uncertainty is not part of the t-test, so a reference value that is itself poorly known will make the test look more decisive than it really is.`,
        steps: [
          {
            title: "The value as entered:",
            work: [`µ₀ = ${fmtSig(K.ref)} ${unit}`],
            note: "Typical sources: a CRM certificate, an assigned proficiency-test value, a nominal formulation, or a target specified in the method.",
          },
          {
            title: "Everything on this page is measured against it:",
            work: [
              `bias = x̄ − µ₀ = ${fmtSig(K.mean)} − ${fmtSig(K.ref)} = ${fmtSig(K.bias)} ${unit}`,
              K.biasPct != null ? `bias % = bias / µ₀ × 100 = ${fmt(K.biasPct, 2)} %` : "bias % — not available (reference is zero)",
              `t = |bias| / se = ${fmt(K.t, 3)}`,
            ],
          },
          {
            title: "One caveat worth keeping in mind:",
            note: "The one-sample t-test treats µ₀ as exact. Where the reference carries a meaningful uncertainty of its own — a CRM certificate always does — compare the bias against that uncertainty too, as the Trueness module does.",
          },
        ],
        footer: "A reference value of zero disables the percentage figure, since the division has no meaning there.",
      };
    }

    case "bias": {
      if (two) return null;
      return {
        title: "Bias",
        subtitle: "difference between your mean and the reference",
        result: fmtSig(K.bias), unit,
        why: `The systematic part of the error: how far your method's centre sits from where it should be. Unlike scatter, it does not average away with more replicates — running the method a thousand times would leave the same offset in place.`,
        steps: [
          {
            title: "Two numbers: where the method sits, and where it should sit.",
            work: [
              `x̄  = ${fmtSig(K.mean)} ${unit}   (mean of ${K.a.length} results)`,
              `µ₀ = ${fmtSig(K.ref)} ${unit}   (reference value)`,
            ],
          },
          {
            title: "The signed difference.",
            formula: "bias = x̄ − µ₀",
            work: [`bias = ${fmtSig(K.mean)} − ${fmtSig(K.ref)} = ${fmtSig(K.bias)} ${unit}`],
            highlightLast: true,
          },
          {
            title: "Reading the sign:",
            note: K.bias > 0
              ? "Positive — the method reads high. Look for contamination, an interference adding signal, or a calibration set too low."
              : K.bias < 0
                ? "Negative — the method reads low. Look for losses in preparation, incomplete recovery, or a calibration set too high."
                : "Zero to the displayed precision.",
          },
          {
            title: "Whether it is more than chance:",
            work: [`t = |${fmtSig(K.bias)}| / se = ${fmt(K.t, 3)}  vs  t crit = ${fmt(K.tCrit, 3)}  →  ${K.significant ? "significant" : "not significant"}`],
            note: "See the t card for the full working.",
          },
        ],
        footer: "Size and significance are separate questions — a bias can be statistically significant yet far too small to affect any decision made on the result.",
      };
    }

    case "biasPct": {
      if (two || K.biasPct == null) return null;
      return {
        title: "Bias %",
        subtitle: "bias relative to the reference value",
        result: fmt(K.biasPct, 2), unit: "%",
        why: `An absolute bias cannot be judged without knowing the level it sits at. As a percentage it becomes comparable across concentrations and directly checkable against a specification, which is nearly always written in relative terms.`,
        steps: [
          {
            title: "Take the bias and the reference it was measured against.",
            work: [
              `bias = ${fmtSig(K.bias)} ${unit}`,
              `µ₀   = ${fmtSig(K.ref)} ${unit}`,
            ],
          },
          {
            title: "Scale it.",
            formula: "bias % = bias / µ₀ × 100",
            work: [`bias % = ${fmtSig(K.bias)} / ${fmtSig(K.ref)} × 100 = ${fmt(K.biasPct, 2)} %`],
            highlightLast: true,
          },
          {
            title: "The same figure as recovery, shifted:",
            work: [`recovery = 100 + bias % = ${fmt(100 + K.biasPct, 2)} %`],
          },
        ],
        footer: "Relative bias grows sharply as the reference value approaches zero — near the LOQ, judge the absolute bias instead.",
      };
    }

    case "t": {
      if (two) return null;
      return {
        title: "t",
        subtitle: "the test statistic — bias measured in standard errors",
        result: fmt(K.t, 3), unit: "",
        why: `A bias of ${fmtSig(K.bias)} ${unit} means nothing on its own: it could be a real offset or it could be the scatter of a handful of replicates. The t statistic settles it by expressing the bias in units of how precisely the mean itself is known. A t of 1 says the bias is the size of ordinary noise; a t of 5 says noise cannot plausibly explain it.`,
        steps: [
          {
            title: "Start from the scatter of the individual results.",
            formula: "s = √[ Σ(xᵢ − x̄)² / (n − 1) ]",
          },
          ...(K.a.length > 1 ? sdSteps(K.a, unit, { sym: "s" }) : []),
          {
            title: "The mean is known far better than any single result — averaging n of them shrinks the scatter by √n.",
            formula: "se = s / √n",
            work: [`se = ${fmtSig(K.sd)} / √${K.a.length} = ${fmtSig(K.se)} ${unit}`],
            note: "This standard error, not s, is the right yardstick — the bias is a property of the mean.",
          },
          {
            title: "Divide the bias by it.",
            formula: "t = | x̄ − µ₀ | / se",
            work: [
              `t = |${fmtSig(K.mean)} − ${fmtSig(K.ref)}| / ${fmtSig(K.se)}`,
              `t = ${fmtSig(Math.abs(K.bias))} / ${fmtSig(K.se)} = ${fmt(K.t, 3)}`,
            ],
            highlightLast: true,
          },
          {
            title: "The decision:",
            work: [
              `${fmt(K.t, 3)} ${K.significant ? ">" : "≤"} t crit(${K.df}) = ${fmt(K.tCrit, 3)}  →  ${K.significant ? "differs from the reference" : "consistent with the reference"}`,
            ],
            note: K.significant
              ? "The departure is larger than replicate scatter accounts for. Investigate the cause before deciding whether to correct."
              : `Not proof of agreement — only that this study could not resolve a difference. A bias smaller than about ${fmtSig(K.tCrit * K.se, 2)} ${unit} would have gone undetected.`,
          },
        ],
        footer: "Two-tailed at 95 %: the test asks whether the mean differs from the reference in either direction.",
      };
    }

    case "tCrit": {
      if (two) return null;
      return {
        title: "t crit (95 %)",
        subtitle: `two-tailed critical value at df = ${K.df}`,
        result: fmt(K.tCrit, 3), unit: "",
        why: `The bar the test statistic has to clear. It comes from the Student-t distribution, not from your data — it says how large t could get by chance alone, 5 % of the time, when there is genuinely no bias. Exceeding it is what "significant" means.`,
        steps: [
          {
            title: "Degrees of freedom first — one is spent estimating the mean from the same data.",
            work: [`df = n − 1 = ${K.a.length} − 1 = ${K.df}`],
          },
          {
            title: "Look up the two-tailed 95 % point of the Student-t distribution at that df.",
            work: [`t crit ( df = ${K.df},  α = 0.05 two-tailed ) = ${fmt(K.tCrit, 3)}`],
            note: "Two-tailed because a bias in either direction matters. A one-tailed test would use a smaller value and is only appropriate when a difference in one direction is genuinely impossible.",
          },
          {
            title: "Why it depends on n:",
            note: `With few replicates the standard deviation is itself poorly known, so the bar is set higher to compensate — t crit is 12.71 at df = 1, ${fmt(K.tCrit, 3)} at df = ${K.df}, and falls towards 1.96 as df grows. Adding replicates lowers the bar and shrinks the standard error at the same time, which is why n matters twice over.`,
          },
          {
            title: "What it means for this study in practice:",
            work: [
              `smallest detectable bias ≈ t crit × se = ${fmt(K.tCrit, 3)} × ${fmtSig(K.se)} = ${fmtSig(K.tCrit * K.se, 3)} ${unit}`,
              `your bias = ${fmtSig(K.bias)} ${unit}  →  ${K.significant ? "above the threshold" : "below the threshold"}`,
            ],
            note: "Anything smaller than that threshold cannot be distinguished from zero by this data set, however real it may be.",
          },
        ],
        footer: "The value is interpolated from a standard table, so it may differ in the third decimal from a table you look up by hand.",
      };
    }

    default:
      return null;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Fully controlled — `statKey` selects the explanation, `onClose` clears it.
   ══════════════════════════════════════════════════════════════════════════ */
export function ComparisonCalcDialog({ open, onClose, statKey, comp, unit, labels }) {
  const ex = open ? buildExplain(statKey, { comp, unit, labels }) : null;
  return <CalcDialogShell open={open} onClose={onClose} ex={ex} unit={unit} />;
}

export default ComparisonCalcDialog;

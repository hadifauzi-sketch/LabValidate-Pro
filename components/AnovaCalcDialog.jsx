/* ══════════════════════════════════════════════════════════════════════════
   AnovaCalcDialog — "show me the arithmetic" modal for the ANOVA table rows
   in the Precision module.

   The stat cards above the table answer "what is sr?"; this table answers
   "where did the variation come from?". So these walkthroughs are organised
   the way the table is — by source of variation — taking one row at a time
   through its sum of squares, degrees of freedom, mean square and, for the
   between-group row, the F-test that follows.

   Holds only the ANOVA-row explanations — the modal chrome and formatters
   come from CalcSteps.
   ══════════════════════════════════════════════════════════════════════════ */
import { CalcDialogShell, fmt, fmtSig, mean } from "@/components/CalcSteps";

/* Per-group summaries, recomputed the way S.anova1 does so the tables below
   show exactly the quantities that went into the table row. */
const groupStats = (prec) =>
  prec.groups.map((g, i) => {
    const m = mean(g);
    return {
      i, n: g.length, m, values: g,
      ss: g.reduce((s, v) => s + (v - m) ** 2, 0),   // within-group sum of squares
      dev: m - prec.gm,                               // group mean − grand mean
    };
  });

/* The partition identity — the check that ties the two rows together. Shown
   on both, because seeing the halves add back up is what makes ANOVA click. */
const partitionStep = (prec, g) => {
  const ssTotal = prec.ssb + prec.ssw;
  return {
    title: "How the two rows fit together. ANOVA splits the total scatter of every result about the grand mean into exactly two parts, with nothing left over.",
    formula: "SS_total = SS_between + SS_within        df_total = df_b + df_w",
    work: [
      `SS_total = ${fmtSig(prec.ssb, 4)} + ${fmtSig(prec.ssw, 4)} = ${fmtSig(ssTotal, 4)}`,
      `df_total = ${prec.dfb} + ${prec.dfw} = ${prec.dfb + prec.dfw} = N − 1 = ${prec.N} − 1 ✓`,
    ],
    note: `Of the total, ${fmt((prec.ssb / ssTotal) * 100, 1)} % sits between ${g}s and ${fmt((prec.ssw / ssTotal) * 100, 1)} % within them. Note this is a split of the raw sums of squares — the mean squares below divide by very different degrees of freedom, which is why the F ratio can look nothing like this split.`,
  };
};

/* ══════════════════════════════════════════════════════════════════════════
   The explanation engine — one builder per ANOVA table row.
   ══════════════════════════════════════════════════════════════════════════ */
function buildExplain(row, { prec, unit, groupLabel = "Group" }) {
  if (!prec) return null;
  const g = groupLabel.toLowerCase();
  const gs = groupStats(prec);

  switch (row) {
    /* ───────────────────────── Between-group row ────────────────────────── */
    case "between": {
      const sig = prec.f > prec.fCrit;
      return {
        title: `Between-${g} row`,
        subtitle: `MS between ${g}s — variation from one ${g} to the next`,
        result: fmtSig(prec.msb), unit: "",
        why: `This row asks whether the ${g}s disagree with each other. It measures how far each ${g}'s mean sits from the overall mean — so it captures anything that changed between ${g}s: a fresh calibration, a different operator, the instrument drifting. On its own it is not yet an answer, because group means also scatter from ordinary within-${g} noise; the F-test at the end is what separates the two.`,
        steps: [
          {
            title: `SS — take each ${g}'s mean, measure its distance from the grand mean x̿ = ${fmtSig(prec.gm)} ${unit}, square it, and weight by how many results that ${g} contributed.`,
            formula: "SS_between = Σ nᵢ ( x̄ᵢ − x̿ )²",
            table: {
              head: [groupLabel, "nᵢ", `x̄ᵢ (${unit})`, "x̄ᵢ − x̿", "nᵢ(x̄ᵢ − x̿)²"],
              rows: gs.map((s) => [
                `${groupLabel} ${s.i + 1}`, String(s.n), fmtSig(s.m),
                fmtSig(s.dev, 3), fmtSig(s.n * s.dev ** 2, 3),
              ]),
              foot: ["Σ = SS_b", "", "", "", fmtSig(prec.ssb, 4)],
            },
            note: `The weight nᵢ matters: a ${g} built from more replicates has a better-known mean, so its distance from the centre counts for more.`,
          },
          {
            title: `df — with p = ${prec.p} ${g} means measured against one grand mean, only ${prec.dfb} of them are free to vary.`,
            formula: "df_between = p − 1",
            work: [`df_b = ${prec.p} − 1 = ${prec.dfb}`],
          },
          {
            title: "MS — the mean square is the sum of squares per degree of freedom, which turns it into a variance.",
            formula: "MS_between = SS_between / df_between",
            work: [`MS_b = ${fmtSig(prec.ssb, 4)} / ${prec.dfb} = ${fmtSig(prec.msb)}`],
            highlightLast: true,
          },
          {
            title: `F — compare the two mean squares. If the ${g}s were interchangeable, MS_b would estimate the same quantity as MS_w and the ratio would sit near 1.`,
            formula: "F = MS_between / MS_within",
            work: [`F = ${fmtSig(prec.msb, 4)} / ${fmtSig(prec.msw, 4)} = ${fmt(prec.f, 2)}`],
          },
          {
            title: `F crit — the largest ratio chance alone would plausibly produce, at 5 %, with (${prec.dfb}, ${prec.dfw}) degrees of freedom.`,
            work: [
              `F crit (${prec.dfb}, ${prec.dfw}) = ${fmt(prec.fCrit, 2)}`,
              `${fmt(prec.f, 2)} ${sig ? ">" : "≤"} ${fmt(prec.fCrit, 2)}  →  ${sig ? `significant between-${g} effect` : `no significant between-${g} effect`}`,
            ],
            highlightLast: true,
          },
          {
            title: "What the verdict means:",
            note: sig
              ? `The ${g}s genuinely differ by more than within-${g} noise explains. Worth chasing — recalibration between ${g}s, standards degrading, or the instrument warming up are the usual causes. It also means sI will come out meaningfully above sr.`
              : `F below 1 like this is not an error; it simply means the ${g} means happen to sit closer together than within-${g} scatter alone would predict. The between-${g} variance component is set to zero and sI comes out equal to sr = ${fmtSig(prec.sr)} ${unit}.`,
          },
          partitionStep(prec, g),
        ],
        footer: `The F-test only asks whether a between-${g} effect is detectable. A "not significant" verdict from a small design is weak evidence that none exists — widen the study if you need to rule one out.`,
      };
    }

    /* ────────────────────────── Within-group row ────────────────────────── */
    case "within": {
      return {
        title: `Within-${g} row`,
        subtitle: `MS within ${g}s — the repeatability variance`,
        result: fmtSig(prec.msw), unit: "",
        why: `This row is the method's baseline noise: how much replicates disagree when everything that could be held constant was held constant. It serves two jobs at once — it is where repeatability sr comes from, and it is the yardstick the between-${g} row gets compared against in the F-test.`,
        steps: [
          {
            title: `SS — inside each ${g}, measure every result against that ${g}'s own mean, square, and add. Then add across all ${prec.p} ${g}s.`,
            formula: "SS_within = Σᵢ Σⱼ ( xᵢⱼ − x̄ᵢ )²",
            table: {
              head: [groupLabel, "nᵢ", `x̄ᵢ (${unit})`, "Σ(xᵢⱼ − x̄ᵢ)²"],
              rows: gs.map((s) => [
                `${groupLabel} ${s.i + 1}`, String(s.n), fmtSig(s.m), fmtSig(s.ss, 3),
              ]),
              foot: ["Σ = SS_w", "", "", fmtSig(prec.ssw, 4)],
            },
            note: `Each ${g} is measured against its own mean, never the grand mean. That is exactly what keeps ${g}-to-${g} drift out of this row and confines it to the row above.`,
          },
          {
            title: `df — each of the p = ${prec.p} ${g}s spends one degree of freedom on its own mean, so ${prec.N} results leave ${prec.dfw}.`,
            formula: "df_within = N − p",
            work: [`df_w = ${prec.N} − ${prec.p} = ${prec.dfw}`],
            note: `Pooling across ${g}s is what makes repeatability well determined: ${prec.dfw} degrees of freedom, against just ${gs[0] ? gs[0].n - 1 : 1} from any single ${g} on its own.`,
          },
          {
            title: "MS — sum of squares per degree of freedom. This mean square is a variance.",
            formula: "MS_within = SS_within / df_within",
            work: [`MS_w = ${fmtSig(prec.ssw, 4)} / ${prec.dfw} = ${fmtSig(prec.msw)}`],
            highlightLast: true,
          },
          {
            title: "This is repeatability, one square root away.",
            formula: "sr = √MS_within",
            work: [
              `sr = √${fmtSig(prec.msw, 4)} = ${fmtSig(prec.sr)} ${unit}`,
              `RSDr = ${fmtSig(prec.sr)} / ${fmtSig(prec.gm)} × 100 = ${fmt(prec.rsdR, 2)} %`,
            ],
            note: "Which is why this row has no F or F crit entry — it is the denominator of the test, not a hypothesis being tested.",
          },
          partitionStep(prec, g),
        ],
        footer: `MS_within assumes the scatter is the same in every ${g}. A ${g} that is visibly noisier than the rest breaks that assumption — check the "Individual values by ${g}" chart before relying on the pooled figure.`,
      };
    }

    default:
      return null;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Fully controlled — `row` selects the ANOVA row, `onClose` clears it.
   ══════════════════════════════════════════════════════════════════════════ */
export function AnovaCalcDialog({ open, onClose, row, prec, unit, groupLabel }) {
  const ex = open ? buildExplain(row, { prec, unit, groupLabel }) : null;
  return <CalcDialogShell open={open} onClose={onClose} ex={ex} unit={unit} />;
}

export default AnovaCalcDialog;

/* ══════════════════════════════════════════════════════════════════════════
   RecoveryCalcDialog — "show me the arithmetic" modal for the Recovery
   results table.

   Unlike the other modules, Recovery reports one row per fortification level
   rather than a row of stat cards. So the walkthrough is keyed by row index
   and covers that level end to end: its replicates, mean, SD, RSD and
   recovery, then how it sits against the other levels in the study. Works for
   any number of levels.

   Holds only the Recovery explanations — the modal chrome, formatters and the
   shared standard-deviation walkthrough come from CalcSteps.
   ══════════════════════════════════════════════════════════════════════════ */
import { CalcDialogShell, fmt, fmtSig, mean, sdSteps } from "@/components/CalcSteps";

/* Where this level sits among the others — the context a single row cannot show. */
const acrossLevelsStep = (rec, index, limits, unit) => {
  const ok = (r) => r.recovery >= (limits.recMin ?? -Infinity) && r.recovery <= (limits.recMax ?? Infinity);
  return {
    title: `This level in the context of the whole study (${rec.length} level${rec.length === 1 ? "" : "s"}):`,
    table: {
      head: ["", `Level (${unit})`, "n", "Recovery %", "RSD %", ""],
      rows: rec.map((r, i) => [
        i === index ? "▸" : "",
        fmt(r.conc, 2), String(r.n), fmt(r.recovery, 1), fmt(r.rsd, 2),
        ok(r) ? "pass" : "fail",
      ]),
    },
    note: rec.length < 3
      ? "Eurachem expects at least three levels spanning the working range — low (≈ LOQ), mid, and high (≈ 90 % of range). Add more levels before drawing conclusions about the method as a whole."
      : "Read down the recovery column for a trend. A recovery that falls steadily as the level drops points at losses that matter most near the LOQ; one that drifts at the top of the range points at saturation.",
  };
};

/* ══════════════════════════════════════════════════════════════════════════
   The explanation engine — keyed by which table row was clicked.
   ══════════════════════════════════════════════════════════════════════════ */
function buildExplain(index, { rec, levels, unit, limits }) {
  const row = rec?.[index];
  const reps = levels?.[index]?.reps || [];
  if (!row || reps.length < 2) return null;
  const L = limits || {};
  const sum = reps.reduce((a, b) => a + b, 0);
  const inWindow = row.recovery >= (L.recMin ?? -Infinity) && row.recovery <= (L.recMax ?? Infinity);
  const isLowest = rec.every((r) => r.conc >= row.conc);

  return {
    title: `Recovery at ${fmt(row.conc, 2)} ${unit}`,
    subtitle: `fortification level ${index + 1} of ${rec.length} — ${fmt(row.conc, 2)} ${unit} nominal`,
    result: fmt(row.recovery, 1), unit: "%",
    why: `A recovery study fortifies a blank matrix with a known amount of analyte and asks how much the method finds again. Because the amount added is known exactly, any shortfall is the method's — losses in extraction, digestion or clean-up. Running several levels shows whether that behaviour holds across the working range or only in the comfortable middle.`,
    steps: [
      {
        title: `The ${reps.length} replicates measured at this level, against the ${fmt(row.conc, 2)} ${unit} that was actually added.`,
        table: {
          head: ["#", `Measured (${unit})`, "Nominal", "individual recovery %"],
          rows: reps.map((v, i) => [
            String(i + 1), fmtSig(v), fmt(row.conc, 2), fmt((v / row.conc) * 100, 1),
          ]),
        },
        note: "The last column is what the control chart below the table plots — one × per replicate, in run order.",
      },
      {
        title: "Average the replicates.",
        formula: "x̄ = Σxᵢ / n",
        work: [
          `Σx = ${fmtSig(sum, 6)} ${unit}`,
          `x̄ = ${fmtSig(sum, 6)} / ${reps.length} = ${fmtSig(row.mean)} ${unit}`,
        ],
      },
      {
        title: "How much do the replicates scatter at this level?",
        formula: "s = √[ Σ(xᵢ − x̄)² / (n − 1) ]",
      },
      ...sdSteps(reps, unit, { sym: "s" }),
      {
        title: "As a relative figure — this is the RSD % column in the table.",
        formula: "RSD = s / x̄ × 100",
        work: [`RSD = ${fmtSig(row.sd, 3)} / ${fmtSig(row.mean)} × 100 = ${fmt(row.rsd, 2)} %`],
        note: "Precision normally worsens as the level falls, so compare this against the other levels rather than against a single fixed limit.",
      },
      {
        title: "Recovery is the mean measured back, as a percentage of what was put in.",
        formula: "recovery = x̄ / nominal × 100",
        work: [`recovery = ${fmtSig(row.mean)} / ${fmt(row.conc, 2)} × 100 = ${fmt(row.recovery, 1)} %`],
        highlightLast: true,
      },
      L.recMin != null && L.recMax != null && {
        title: "Against the acceptance window:",
        work: [
          `${fmt(L.recMin, 0)} %  ${row.recovery >= L.recMin ? "≤" : ">"}  ${fmt(row.recovery, 1)} %  ${row.recovery <= L.recMax ? "≤" : ">"}  ${fmt(L.recMax, 0)} %   →   ${inWindow ? "pass" : "fail"}`,
        ],
        note: inWindow
          ? `Set in Study Plan. The shortfall of ${fmt(Math.abs(100 - row.recovery), 1)} % from perfect recovery is within what the window allows.`
          : "Set in Study Plan. Investigate before reporting: either the method loses analyte at this level, or the window is unrealistically tight for it.",
      },
      {
        title: "Reading the result:",
        note: row.recovery < 100
          ? `${fmt(100 - row.recovery, 1)} % of the added analyte was not recovered. Usual suspects: incomplete extraction or digestion, adsorption onto glassware, or losses during evaporation.${isLowest ? " This is the lowest level in the study, where losses bite hardest — expect it to be the worst of the set." : ""}`
          : row.recovery > 100
            ? `${fmt(row.recovery - 100, 1)} % more was found than was added. Look for a matrix interference adding signal, contamination from reagents or labware, or a calibration reading high.`
            : "Exactly 100 % to the displayed precision.",
      },
      acrossLevelsStep(rec, index, L, unit),
    ],
    footer: "Eurachem does not require correcting results for recovery. If you do apply a correction factor, its own uncertainty must be carried into the uncertainty budget.",
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   Fully controlled — `index` selects the table row, `onClose` clears it.
   ══════════════════════════════════════════════════════════════════════════ */
export function RecoveryCalcDialog({ open, onClose, index, rec, levels, unit, limits }) {
  const ex = open && index != null ? buildExplain(index, { rec, levels, unit, limits }) : null;
  return <CalcDialogShell open={open} onClose={onClose} ex={ex} unit={unit} />;
}

export default RecoveryCalcDialog;

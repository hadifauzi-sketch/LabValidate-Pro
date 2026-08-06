/* ══════════════════════════════════════════════════════════════════════════
   RuggednessCalcDialog — "show me the arithmetic" modal for the Effect
   evaluation table in the Ruggedness module.

   One row per method parameter, so the walkthrough is keyed by row index and
   takes that factor end to end: the two results either side of nominal, the
   effect, the effect as a percentage, and the two separate judgements applied
   to it — against your own tolerance, and against repeatability noise.

   Holds only the Ruggedness explanations — the modal chrome and formatters
   come from CalcSteps.
   ══════════════════════════════════════════════════════════════════════════ */
import { CalcDialogShell, fmt, fmtSig } from "@/components/CalcSteps";

/* Every factor ranked by how much it moves the result — the context a single
   row cannot show, and the whole point of running a ruggedness study. */
const acrossFactorsStep = (robust, index, limits) => {
  const ranked = robust
    .map((r, i) => ({ ...r, i }))
    .sort((a, b) => Math.abs(b.effectPct) - Math.abs(a.effectPct));
  const worst = ranked[0];
  return {
    title: `All ${robust.length} factor${robust.length === 1 ? "" : "s"}, ranked by how much they move the result:`,
    table: {
      head: ["", "Factor", "Effect", "Effect %", ""],
      rows: ranked.map((r) => [
        r.i === index ? "▸" : "",
        r.name || "—", fmtSig(r.effect, 3), fmt(r.effectPct, 2),
        limits.robustPctMax != null
          ? (Math.abs(r.effectPct) <= limits.robustPctMax ? "pass" : "review")
          : "",
      ]),
    },
    note: worst.i === index
      ? "This is the most influential parameter in the study. It is the one whose tolerance the SOP most needs to state explicitly."
      : `"${worst.name || "—"}" moves the result more than this one (${fmt(worst.effectPct, 2)} %). Control that parameter first.`,
  };
};

/* ══════════════════════════════════════════════════════════════════════════
   The explanation engine — keyed by which table row was clicked.
   ══════════════════════════════════════════════════════════════════════════ */
function buildExplain(index, { robust, unit, limits, noise }) {
  const r = robust?.[index];
  if (!r) return null;
  const L = limits || {};
  const lo = +r.resLow, hi = +r.resHigh;
  const mid = (hi + lo) / 2;
  const within = L.robustPctMax != null && Math.abs(r.effectPct) <= L.robustPctMax;
  const name = r.name || "this factor";

  return {
    title: name,
    subtitle: `effect of moving ${name} from its low to its high setting`,
    result: fmtSig(r.effect, 3), unit,
    why: `A ruggedness study deliberately mis-sets one method parameter at a time and measures how much the result shifts. The question it answers is practical: does this parameter need to be controlled tightly, and what tolerance should the SOP state? A parameter that barely moves the result can be left loose; one that moves it a lot must be pinned down.`,
    steps: [
      {
        title: "The parameter was varied either side of its nominal setting, and the method run at each extreme.",
        table: {
          head: ["Setting", "Value", `Result (${unit})`],
          rows: [
            ["Low", String(r.low ?? "—"), fmtSig(lo)],
            ["Nominal", String(r.nominal ?? "—"), "— (not run)"],
            ["High", String(r.high ?? "—"), fmtSig(hi)],
          ],
        },
        note: "Only the two extremes are measured — the nominal setting is the method's normal operating point and is assumed to sit between them.",
      },
      {
        title: "The effect is simply how far the result moved across that range.",
        formula: "effect = result@high − result@low",
        work: [`effect = ${fmtSig(hi)} − ${fmtSig(lo)} = ${fmtSig(r.effect, 3)} ${unit}`],
        note: r.effect > 0
          ? `Positive — raising ${name} raises the result.`
          : r.effect < 0
            ? `Negative — raising ${name} lowers the result.`
            : "Zero to the displayed precision — the result did not move.",
      },
      {
        title: "Express it relative to the level the method operates at, so it can be judged against a percentage tolerance.",
        formula: "effect % = effect / midpoint × 100        midpoint = ( result@high + result@low ) / 2",
        work: [
          `midpoint = ( ${fmtSig(hi)} + ${fmtSig(lo)} ) / 2 = ${fmtSig(mid)} ${unit}`,
          `effect % = ${fmtSig(r.effect, 3)} / ${fmtSig(mid)} × 100 = ${fmt(r.effectPct, 2)} %`,
        ],
        highlightLast: true,
      },
      L.robustPctMax != null && {
        title: "JUDGEMENT 1 — against your own tolerance.",
        work: [
          `| ${fmt(r.effectPct, 2)} % |  ${within ? "≤" : ">"}  ${L.robustPctMax} %   →   ${within ? "negligible" : "must be controlled"}`,
        ],
        note: within
          ? `Set in Study Plan. Eurachem §6.7 treats an effect this small as negligible — the parameter can be allowed to drift over the range tested without affecting results.`
          : `Set in Study Plan. The parameter materially changes the result, so the SOP must state a tolerance tighter than the ${r.low} – ${r.high} range tested here.`,
      },
      noise
        ? {
            title: "JUDGEMENT 2 — against repeatability noise. A shift the method would produce anyway, just from run-to-run scatter, is not evidence that the parameter matters.",
            formula: "critical difference = sr · t · √2 / √n̄",
            work: [
              `sr = ${fmtSig(noise.sr)} ${unit}        (repeatability, from the Precision ANOVA)`,
              `t (df = ${noise.dfw}, 95 %) = ${fmt(noise.t, 3)}`,
              `√2 = ${fmt(Math.SQRT2, 3)}        n̄ = ${fmt(noise.nBar, 3)}`,
              `crit. diff. = ${fmtSig(noise.sr)} × ${fmt(noise.t, 3)} × ${fmt(Math.SQRT2, 3)} / √${fmt(noise.nBar, 3)} = ${fmtSig(noise.value, 3)} ${unit}`,
            ],
            note: "√2 appears because two independent results are being subtracted, so their variances add. Dividing by √n̄ reflects that each result carries the same replication as the precision study it is being compared against.",
          }
        : {
            title: "JUDGEMENT 2 — against repeatability noise: not available.",
            note: "The \"vs sr\" column reads n/a because the Precision module has not been completed. Without sr there is no way to tell whether an effect this size is real or just run-to-run scatter — fill in Precision and this comparison appears automatically.",
          },
      noise && {
        title: "Compare.",
        work: [
          `| effect | = ${fmtSig(Math.abs(r.effect), 3)} ${unit}`,
          `crit. diff. = ${fmtSig(noise.value, 3)} ${unit}`,
          `${fmtSig(Math.abs(r.effect), 3)} ${r.srTest ? ">" : "≤"} ${fmtSig(noise.value, 3)}  →  ${r.srTest ? "distinguishable from noise" : "within noise"}`,
        ],
        highlightLast: true,
        note: r.srTest
          ? "The shift is larger than repeatability alone would produce, so the parameter genuinely influences the result."
          : `The shift is not distinguishable from ordinary scatter. That is a weaker statement than "no effect" — it means this study could not resolve one. An effect up to ${fmtSig(noise.value, 3)} ${unit} would have gone undetected.${
              Math.abs(r.effect) > 0.7 * noise.value ? " This one sits close to the threshold, so treat it as borderline rather than settled." : ""}`,
      },
      {
        title: "Why two judgements rather than one:",
        note: "They answer different questions. The tolerance check asks whether the shift is big enough to matter for your intended use; the noise check asks whether it is real at all. A large effect that is within noise means the study was too imprecise to conclude anything — the answer there is more replication, not a looser SOP.",
      },
      acrossFactorsStep(robust, index, L),
    ],
    footer: "One factor at a time gets slow beyond about four parameters, and it cannot reveal interactions between them. Eurachem §6.7 recommends a Youden or Plackett–Burman design for larger studies.",
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   Fully controlled — `index` selects the table row, `onClose` clears it.
   ══════════════════════════════════════════════════════════════════════════ */
export function RuggednessCalcDialog({ open, onClose, index, robust, unit, limits, noise }) {
  const ex = open && index != null ? buildExplain(index, { robust, unit, limits, noise }) : null;
  return <CalcDialogShell open={open} onClose={onClose} ex={ex} unit={unit} />;
}

export default RuggednessCalcDialog;

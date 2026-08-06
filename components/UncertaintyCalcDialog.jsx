/* ══════════════════════════════════════════════════════════════════════════
   UncertaintyCalcDialog — "show me the arithmetic" modal for the Uncertainty
   result cards: u(P), u(bias), uc, U (k = 2) and U relative.

   This module computes nothing from raw replicates of its own — it is a
   top-down EURACHEM/CITAC CG4 budget assembled from the Precision and
   Trueness modules. So the walkthroughs spend as much effort on *where each
   term came from* as on the arithmetic that combines them.

   Holds only the Uncertainty explanations — the modal chrome and formatters
   come from CalcSteps.
   ══════════════════════════════════════════════════════════════════════════ */
import { CalcDialogShell, fmt, fmtSig } from "@/components/CalcSteps";

/* The budget as a table of variance contributions — the heart of the whole
   module, and reused by the uc, U and U-relative cards. */
const budgetStep = (mu, unit, title) => ({
  title,
  table: {
    head: ["Component", `u (${unit})`, "u²", "share of u²"],
    rows: [
      ["Precision u(P)", fmtSig(mu.uPrec), fmtSig(mu.uPrec ** 2, 3),
        fmt((mu.uPrec ** 2 / mu.uc ** 2) * 100, 1) + " %"],
      ...(mu.uBias !== null
        ? [["Bias u(bias)", fmtSig(mu.uBias), fmtSig(mu.uBias ** 2, 3),
            fmt((mu.uBias ** 2 / mu.uc ** 2) * 100, 1) + " %"]]
        : [["Bias u(bias)", "—", "—", "not assessed"]]),
    ],
    foot: ["Σ = uc²", fmtSig(mu.uc), fmtSig(mu.uc ** 2, 3), "100 %"],
  },
  note: "Shares are of the variance, not of u — that is why the larger component dominates so heavily. Halving the smaller one would barely move uc.",
});

/* Which component is limiting, and what that implies for the analyst. */
const dominanceNote = (mu, trueMode, refU) => {
  if (mu.uBias === null) return "Only precision is in the budget, so uc is simply u(P). Any bias the method carries is currently unaccounted for.";
  const biasShare = (mu.uBias ** 2 / mu.uc ** 2) * 100;
  if (biasShare > 60) {
    return trueMode === "crm" && refU
      ? `Bias dominates at ${fmt(biasShare, 1)} % of the variance — and inside u(bias) the CRM certificate's own uncertainty is usually the biggest part of that. When it is, the limit on your reported uncertainty is the reference material, not your method: more replicates will not help, a better-certified CRM will.`
      : `Bias dominates at ${fmt(biasShare, 1)} % of the variance. Effort spent tightening precision will barely move U — investigate the source of the bias instead.`;
  }
  if (biasShare < 40) {
    return `Precision dominates at ${fmt(100 - biasShare, 1)} % of the variance. More replicates per reported result, or tighter control of the day-to-day conditions, is where U will actually come down.`;
  }
  return "Precision and bias contribute comparably, so neither alone is the obvious target for improvement.";
};

/* ══════════════════════════════════════════════════════════════════════════
   The explanation engine — one builder per Uncertainty card.
   ══════════════════════════════════════════════════════════════════════════ */
function buildExplain(statKey, { mu, prec, trueness, refU, unit, groupLabel = "Group" }) {
  if (!mu) return null;
  const g = groupLabel.toLowerCase();
  const mode = trueness?.mode;

  switch (statKey) {
    /* ───────────────────────────── u(P) = sI ────────────────────────────── */
    case "uPrec": {
      return {
        title: "u(P) = sI",
        subtitle: "the precision contribution to the budget",
        result: fmtSig(mu.uPrec), unit,
        why: `The random part of the uncertainty: how much a reported result moves about purely from run-to-run variation. Nothing new is measured here — the figure is taken straight from the Precision module's ANOVA, which is the point of a top-down budget.`,
        steps: [
          {
            title: "The value is the intermediate precision sI, carried over from the Precision module.",
            work: [
              `u(P) = sI = ${fmtSig(mu.uPrec)} ${unit}`,
              prec ? `equivalently  RSDI = ${fmt(prec.rsdI, 2)} % of the grand mean ${fmtSig(prec.gm)} ${unit}` : "",
            ].filter(Boolean),
          },
          prec && {
            title: `Why sI and not the tighter sr. Repeatability describes results produced back to back under identical conditions; real reported results are produced on different ${g}s. The budget has to reflect how the method is actually used.`,
            work: [
              `sr (repeatability)  = ${fmtSig(prec.sr)} ${unit}   ← too optimistic for a budget`,
              `sI (intermediate)   = ${fmtSig(prec.sI)} ${unit}   ← used here`,
            ],
          },
          prec && {
            title: "Recall how sI was built — it already contains both sources of random variation.",
            formula: "sI = √( sr² + s²between )",
            work: [
              `sI = √( ${fmtSig(prec.sr ** 2, 4)} + ${fmtSig(prec.sBetween ** 2, 4)} ) = ${fmtSig(prec.sI)} ${unit}`,
            ],
            note: prec.sBetween === 0
              ? `The between-${g} component came out at zero in your study, so sI equals sr here. That is a finding about this data set, not a shortcut — see the sI card in Precision.`
              : `The second term is the ${g}-to-${g} variation, which repeatability alone would miss entirely.`,
          },
          prec && {
            title: "How well founded is this figure?",
            work: [`based on ${prec.N} results across ${prec.p} ${g}s`],
            note: "A precision estimate from few groups is itself uncertain. EURACHEM/CITAC CG4 expects the design behind u(P) to be representative of routine operation — same instruments, same analysts, same spread of days.",
          },
        ],
        footer: "This is one of only two components in this screening budget. A full budget would itemise calibration, sampling, purity of standards and any dilution steps as well.",
      };
    }

    /* ────────────────────────────── u(bias) ─────────────────────────────── */
    case "uBias": {
      if (mu.uBias === null) {
        return {
          title: "u(bias)",
          subtitle: "not assessed",
          result: "—", unit: "",
          why: `The budget has no bias term because the Trueness module has not been completed. That does not mean the method is unbiased — it means any bias it carries is currently invisible to this estimate, and the uncertainty below is optimistic as a result.`,
          steps: [
            {
              title: "What is missing:",
              work: [`uc = √( u(P)² + u(bias)² )  →  uc = u(P) = ${fmtSig(mu.uc)} ${unit}`],
              note: "With no bias term, the combined uncertainty collapses to the precision alone.",
            },
            {
              title: "How to fill it in:",
              note: "Complete the Trueness / Bias module by either route — a CRM study (preferred) or a spike recovery study. Either produces the bias term automatically and this card will populate.",
            },
          ],
          footer: "EURACHEM/CITAC CG4 requires trueness to be evaluated; a budget containing only precision is not a defensible measurement uncertainty.",
        };
      }
      if (mode === "crm") {
        const sm = trueness.sd / Math.sqrt(trueness.n);
        const uRef = (refU ?? 0) / 2;
        const terms = [
          ["s_m — your own mean", sm],
          ["u(ref) — the certificate", uRef],
          ["bias — uncorrected", Math.abs(trueness.bias)],
        ];
        const ss = terms.reduce((s, [, v]) => s + v ** 2, 0);
        return {
          title: "u(bias)",
          subtitle: "uncertainty of the bias, from the CRM study",
          result: fmtSig(mu.uBias), unit,
          why: `The systematic part of the budget. Three separate things limit how well you know the method's offset: how precisely you measured the CRM, how well the CRM's own value is known, and the size of the bias you found but chose not to correct for. All three are uncertainties in the reported result, so all three go in.`,
          steps: [
            {
              title: "Term 1 — how well you know your own CRM mean. A mean of n results is better determined than any single one.",
              formula: "s_m = s / √n",
              work: [`s_m = ${fmtSig(trueness.sd)} / √${trueness.n} = ${fmtSig(sm)} ${unit}`],
            },
            {
              title: "Term 2 — how well the certified value itself is known. Certificates quote an expanded uncertainty, so divide by its coverage factor to get back to a standard uncertainty.",
              formula: "u(ref) = U(certificate) / k       (k = 2)",
              work: [`u(ref) = ${fmtSig(refU)} / 2 = ${fmtSig(uRef)} ${unit}`],
              note: "Check the certificate for the stated k — most use 2, but not all. If it quotes a standard uncertainty already, do not divide again.",
            },
            {
              title: "Term 3 — the bias itself. Because the result is not being corrected for it, the whole offset is carried as an uncertainty rather than removed.",
              work: [`|bias| = ${fmtSig(Math.abs(trueness.bias), 3)} ${unit}`],
              note: "If you did correct results for this bias, this term would be replaced by the uncertainty of the correction factor — usually much smaller. Not correcting is simpler and is what this app assumes.",
            },
            {
              title: "Combine the three by root sum of squares — independent contributions add as variances.",
              formula: "u(bias) = √( s_m² + u(ref)² + bias² )",
              table: {
                head: ["Term", `u (${unit})`, "u²", "share"],
                rows: terms.map(([n, v]) => [n, fmtSig(v), fmtSig(v ** 2, 3), fmt((v ** 2 / ss) * 100, 1) + " %"]),
                foot: ["Σ", fmtSig(Math.sqrt(ss)), fmtSig(ss, 3), "100 %"],
              },
            },
            {
              title: "Take the root.",
              work: [`u(bias) = √${fmtSig(ss, 4)} = ${fmtSig(mu.uBias)} ${unit}`],
              highlightLast: true,
            },
            {
              title: "Which of the three is limiting you:",
              note: uRef ** 2 / ss > 0.6
                ? `The certificate dominates at ${fmt((uRef ** 2 / ss) * 100, 1)} % of this term. Your method is being judged against a reference that is itself only known to ± ${fmtSig(refU)} ${unit} — no amount of extra replicate work will improve that. A more tightly certified CRM would.`
                : sm ** 2 / ss > 0.6
                  ? `Your own measurement scatter dominates at ${fmt((sm ** 2 / ss) * 100, 1)} %. More CRM replicates would tighten this directly, since s_m falls as 1/√n.`
                  : `The uncorrected bias dominates at ${fmt((trueness.bias ** 2 / ss) * 100, 1)} %. Finding and removing its cause — or correcting for it and carrying the correction's uncertainty instead — is what would help.`,
            },
          ],
          footer: "EURACHEM/CITAC CG4 §7.2: where a bias is found but not corrected, its magnitude must be included in the uncertainty budget rather than ignored.",
        };
      }
      return {
        title: "u(bias)",
        subtitle: "uncertainty of the bias, from the spike recovery study",
        result: fmtSig(mu.uBias), unit,
        why: `A spike study gives the size of the offset directly. Because the result is not corrected for that offset, the offset itself is carried as an uncertainty component — the method could be reading high or low by about this much, systematically.`,
        steps: [
          {
            title: "Take the bias found in the Trueness module.",
            work: [
              `recovery = ${fmt(trueness.recovery, 1)} %`,
              `bias     = ${fmtSig(trueness.bias, 3)} ${unit}`,
            ],
          },
          {
            title: "Since results are not corrected for it, the magnitude of the bias becomes the uncertainty contribution.",
            formula: "u(bias) = | bias |",
            work: [`u(bias) = ${fmtSig(mu.uBias)} ${unit}`],
            highlightLast: true,
          },
          {
            title: "A note on this simplification:",
            note: "The CRM route also folds in the uncertainty of your own mean and of the reference value. A spike study has no certified reference, so this estimate is coarser. Where a matrix-matched CRM exists, prefer it — the budget it produces is better founded.",
          },
        ],
        footer: "EURACHEM/CITAC CG4 §7.2: an uncorrected bias must appear in the budget. A spike-based estimate is acceptable when no suitable CRM is available.",
      };
    }

    /* ──────────────────────────────── uc ────────────────────────────────── */
    case "uc": {
      return {
        title: "uc",
        subtitle: "combined standard uncertainty",
        result: fmtSig(mu.uc), unit,
        why: `The two contributions describe different things — random scatter and systematic offset — and they are independent, so they combine as variances rather than by simple addition. uc is the single standard uncertainty of a reported result, before any coverage factor is applied.`,
        steps: [
          {
            title: "The two components already established.",
            work: [
              `u(P)    = ${fmtSig(mu.uPrec)} ${unit}   (precision, from ANOVA)`,
              mu.uBias !== null
                ? `u(bias) = ${fmtSig(mu.uBias)} ${unit}   (${mode === "crm" ? "CRM study" : "spike study"})`
                : `u(bias) = —   (Trueness not completed)`,
            ],
          },
          {
            title: "Independent contributions add in quadrature — square each, add, take the root.",
            formula: "uc = √( u(P)² + u(bias)² )",
            note: "Adding them directly would assume both errors always push the same way at the same time, which would badly overstate the uncertainty.",
          },
          budgetStep(mu, unit, "Squaring makes the balance between them obvious:"),
          {
            title: "Take the root of the total.",
            work: [
              mu.uBias !== null
                ? `uc = √( ${fmtSig(mu.uPrec ** 2, 4)} + ${fmtSig(mu.uBias ** 2, 4)} ) = √${fmtSig(mu.uc ** 2, 4)} = ${fmtSig(mu.uc)} ${unit}`
                : `uc = u(P) = ${fmtSig(mu.uc)} ${unit}`,
            ],
            highlightLast: true,
          },
          {
            title: "Where to spend effort:",
            note: dominanceNote(mu, mode, refU),
          },
        ],
        footer: "uc is a standard uncertainty — roughly a 68 % interval. It is not what you report; see the U (k = 2) card.",
      };
    }

    /* ───────────────────────────── U (k = 2) ────────────────────────────── */
    case "U": {
      const lo = prec ? prec.gm - mu.U : null;
      const hi = prec ? prec.gm + mu.U : null;
      return {
        title: "U (k = 2)",
        subtitle: "expanded uncertainty — the figure you report",
        result: fmtSig(mu.U), unit,
        why: `A standard uncertainty covers only about 68 % of the plausible range, which is not enough confidence to base a decision on. Multiplying by a coverage factor widens the interval to roughly 95 %, and that is the convention for reporting a result with its uncertainty.`,
        steps: [
          {
            title: "Start from the combined standard uncertainty.",
            work: [`uc = ${fmtSig(mu.uc)} ${unit}`],
          },
          {
            title: "Apply the coverage factor.",
            formula: "U = k · uc        (k = 2, approximately 95 % confidence)",
            note: "k = 2 assumes an approximately normal distribution and adequate degrees of freedom. Where the budget rests on very few measurements, a larger k from the Student-t distribution is more honest.",
          },
          {
            title: "Substitute.",
            work: [`U = 2 × ${fmtSig(mu.uc)} = ${fmtSig(mu.U)} ${unit}`],
            highlightLast: true,
          },
          prec && {
            title: "How the result is then reported:",
            work: [
              `x̄ ± U = ${fmtSig(prec.gm)} ± ${fmtSig(mu.U)} ${unit}`,
              `interval = ${fmtSig(lo)} to ${fmtSig(hi)} ${unit}   (k = 2, ~95 %)`,
            ],
            note: "Always state the coverage factor alongside the value — \"± 2.0 mg/kg\" is meaningless without it, since the same budget yields a different number at k = 1 or k = 3.",
          },
          {
            title: "What the interval actually claims:",
            note: "That the true value lies within it with roughly 95 % confidence — given that the budget captured every significant source. This is a screening estimate from two components, so treat it as a floor: an itemised budget including calibration, sampling and standard purity can only make it wider.",
          },
        ],
        footer: "Round U to no more than two significant figures for reporting, and round the result to the same decimal place — ISO/IEC Guide 98-3 (GUM) §7.2.6.",
      };
    }

    /* ──────────────────────────── U relative ────────────────────────────── */
    case "UPct": {
      if (!prec) return null;
      return {
        title: "U relative",
        subtitle: "expanded uncertainty as a percentage of the result",
        result: fmt(mu.UPct, 2), unit: "%",
        why: `An uncertainty of ${fmtSig(mu.U)} ${unit} cannot be judged without knowing the level it applies at. As a percentage it becomes comparable across concentrations and directly checkable against a fitness-for-purpose requirement, which is nearly always written in relative terms.`,
        steps: [
          {
            title: "Take the expanded uncertainty and the level it was estimated at.",
            work: [
              `U  = ${fmtSig(mu.U)} ${unit}`,
              `x̄  = ${fmtSig(prec.gm)} ${unit}   (grand mean from the Precision module)`,
            ],
          },
          {
            title: "Express one as a percentage of the other.",
            formula: "U relative = U / x̄ × 100",
            work: [`U relative = ${fmtSig(mu.U)} / ${fmtSig(prec.gm)} × 100 = ${fmt(mu.UPct, 2)} %`],
            highlightLast: true,
          },
          {
            title: "Against the other relative figures in the study:",
            work: [
              `RSDI (intermediate precision) = ${fmt(prec.rsdI, 2)} %`,
              `U relative (k = 2)            = ${fmt(mu.UPct, 2)} %`,
            ],
            note: mu.UPct > 3 * prec.rsdI
              ? "U relative is far larger than the precision alone, which means the bias term is carrying the budget — precision is not your constraint."
              : "U relative is roughly what the precision would suggest, so no single component is grossly out of proportion.",
          },
          {
            title: "How to use it:",
            note: "Compare against the analytical requirement recorded in Study Plan. A common rule of thumb is that U should be no more than a third to a half of the specification width you need to make decisions against — otherwise borderline results cannot be judged either way.",
          },
        ],
        footer: "Relative uncertainty grows sharply as the result approaches the LOQ. This figure applies at the level the precision study was run at, not across the whole working range.",
      };
    }

    default:
      return null;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Fully controlled — `statKey` selects the explanation, `onClose` clears it.
   ══════════════════════════════════════════════════════════════════════════ */
export function UncertaintyCalcDialog({ open, onClose, statKey, mu, prec, trueness, refU, unit, groupLabel }) {
  const ex = open ? buildExplain(statKey, { mu, prec, trueness, refU, unit, groupLabel }) : null;
  return <CalcDialogShell open={open} onClose={onClose} ex={ex} unit={unit} />;
}

export default UncertaintyCalcDialog;

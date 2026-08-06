/* ══════════════════════════════════════════════════════════════════════════
   TruenessCalcDialog — "show me the arithmetic" modal for the Trueness / Bias
   result cards, covering both routes the module offers:

     • CRM study      — mean, bias, bias %, recovery, t / t crit
     • Spike recovery — expected mix conc, spike added, total recovery,
                        spike (marginal) recovery, u(Rec), t / t crit
                        for both the APHA/USEPA and the volume-mixing models

   Clicking a card walks the number back to the replicates and the certified
   or spiking values the user typed in.

   Holds only the Trueness explanations — the modal chrome, formatters and the
   shared standard-deviation walkthrough come from CalcSteps.
   ══════════════════════════════════════════════════════════════════════════ */
import { CalcDialogShell, fmt, fmtSig, mean, sdSteps, dataStep } from "@/components/CalcSteps";

const variance = (a) => {
  const m = mean(a);
  return a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1);
};

/* The two replicate sets a spike study rests on, side by side. */
const spikeDataStep = (uns, spk, unit) => ({
  title: `A spike study compares two sets of replicates on the same material: one as received, one with a known amount of analyte added.`,
  table: {
    head: ["#", `Unspiked (${unit})`, `Spiked (${unit})`],
    rows: Array.from({ length: Math.max(uns.length, spk.length) }, (_, i) => [
      String(i + 1),
      i < uns.length ? fmtSig(uns[i]) : "—",
      i < spk.length ? fmtSig(spk[i]) : "—",
    ]),
    foot: ["mean", fmtSig(mean(uns)), fmtSig(mean(spk))],
  },
  note: `n = ${uns.length} unspiked and ${spk.length} spiked replicates. The two sets need not be the same size; the degrees of freedom follow the smaller one.`,
});

/* Recovery window check, shared by every recovery-style card. */
const windowStep = (value, L, what = "Recovery") => {
  if (L.recMin == null || L.recMax == null) return null;
  const ok = value >= L.recMin && value <= L.recMax;
  return {
    title: "Against your acceptance window:",
    work: [`${L.recMin} %  ${value >= L.recMin ? "≤" : ">"}  ${fmt(value, 1)} %  ${value <= L.recMax ? "≤" : ">"}  ${L.recMax} %   →   ${ok ? "pass" : "outside the window"}`],
    note: `${what} limits are set in Study Plan. Widen them for trace-level work — a 90–110 % window is unrealistic near the LOQ.`,
  };
};

/* ══════════════════════════════════════════════════════════════════════════
   The explanation engine — one builder per Trueness card.
   ══════════════════════════════════════════════════════════════════════════ */
function buildExplain(statKey, { trueness: T, unit, refValue, refU, reps, limits }) {
  if (!T) return null;
  const L = limits || {};
  const R = reps || {};
  const crmReps = R.crmReps || [];
  const uns = R.unspiked || [];
  const spk = R.spiked || [];
  const vol = T.method === "volume";

  switch (statKey) {
    /* ═══════════════════════════ CRM route ════════════════════════════════ */

    case "mean": {
      if (T.mode !== "crm" || !crmReps.length) return null;
      const sum = crmReps.reduce((a, b) => a + b, 0);
      return {
        title: "Mean",
        subtitle: "x̄ — the average of your CRM results",
        result: fmtSig(T.mean), unit,
        why: `A certified reference material has a known true value, so measuring it repeatedly and averaging tells you where your method actually sits. Averaging is the point: single results scatter, but the mean of ${T.n} of them is a far steadier estimate of the method's centre — and it is that centre, not any one result, that bias is measured from.`,
        steps: [
          dataStep(crmReps, unit, "CRM replicate results"),
          {
            title: "The arithmetic mean.",
            formula: "x̄ = Σxᵢ / n",
          },
          {
            title: `Add the ${T.n} results and divide.`,
            work: [
              `Σx = ${fmtSig(sum, 6)} ${unit}`,
              `x̄ = ${fmtSig(sum, 6)} / ${T.n} = ${fmtSig(T.mean)} ${unit}`,
            ],
            highlightLast: true,
          },
          {
            title: "Next to the certified value:",
            work: [
              `x̄            = ${fmtSig(T.mean)} ${unit}`,
              `certified    = ${fmtSig(refValue)} ${unit}`,
              `difference   = ${fmtSig(T.bias, 3)} ${unit}   ← this is the bias`,
            ],
          },
        ],
        footer: T.grubbs?.outlierIdx >= 0
          ? `A Grubbs test flags ${fmtSig(T.grubbs.outlierVal)} ${unit} as a possible outlier. Investigate it before accepting this mean — a single stray result drags the mean and inflates the scatter.`
          : "A Grubbs test found no outlier among these replicates at the 95 % level.",
      };
    }

    case "bias": {
      if (T.mode !== "crm") return null;
      const withinU = refU != null && Math.abs(T.bias) <= refU;
      return {
        title: "Bias",
        subtitle: "systematic difference from the certified value",
        result: fmtSig(T.bias, 3), unit,
        why: `Bias is the systematic part of the error — the amount your method is consistently off by, in the same direction, no matter how many times you repeat it. Precision cannot reveal it: a method can be beautifully repeatable and still be wrong. Only a material with a known value can expose it, which is why a CRM is the preferred route.`,
        steps: [
          {
            title: "Two numbers: where your method sits, and where it should sit.",
            work: [
              `x̄         = ${fmtSig(T.mean)} ${unit}   (your mean of ${T.n} results)`,
              `certified = ${fmtSig(refValue)} ${unit}   (from the CRM certificate)`,
            ],
          },
          {
            title: "Bias is simply the difference, signed.",
            formula: "bias = x̄ − certified value",
            note: "A positive bias means the method reads high, negative means it reads low. The sign matters — it points at the cause.",
          },
          {
            title: "Substitute.",
            work: [`bias = ${fmtSig(T.mean)} − ${fmtSig(refValue)} = ${fmtSig(T.bias, 3)} ${unit}`],
            highlightLast: true,
          },
          refU != null && {
            title: "Before calling this a real bias, compare it with the CRM's own expanded uncertainty.",
            work: [
              `U (CRM certificate) = ± ${fmtSig(refU)} ${unit}`,
              `|bias| = ${fmtSig(Math.abs(T.bias), 3)}  ${withinU ? "≤" : ">"}  ${fmtSig(refU)}  →  ${withinU ? "inside the certified uncertainty" : "outside the certified uncertainty"}`,
            ],
            note: withinU
              ? "The difference is smaller than the uncertainty on the certified value itself, so the material cannot resolve a bias this small. Nothing to correct."
              : "The difference exceeds the certificate's own uncertainty, so it cannot be explained by the reference value alone. Investigate the method.",
          },
        ],
        footer: "Eurachem §6.5: judge bias against both its statistical significance (the t-test) and the CRM's uncertainty. A bias can be statistically significant yet too small to matter, or practically important yet undetectable with few replicates.",
      };
    }

    case "biasPct": {
      if (T.mode !== "crm") return null;
      return {
        title: "Bias %",
        subtitle: "bias relative to the certified value",
        result: fmt(T.biasPct, 2), unit: "%",
        why: `An absolute bias of ${fmtSig(T.bias, 3)} ${unit} means nothing until you know the level it was measured at. Expressing it as a percentage makes it comparable across concentrations and directly checkable against a recovery window, which is almost always specified in percentage terms.`,
        steps: [
          {
            title: "Take the bias and the certified value it was measured against.",
            work: [
              `bias      = ${fmtSig(T.bias, 3)} ${unit}`,
              `certified = ${fmtSig(refValue)} ${unit}`,
            ],
          },
          {
            title: "Scale it.",
            formula: "bias % = bias / certified value × 100",
            work: [`bias % = ${fmtSig(T.bias, 3)} / ${fmtSig(refValue)} × 100 = ${fmt(T.biasPct, 2)} %`],
            highlightLast: true,
          },
          {
            title: "The same information as recovery, shifted:",
            work: [`recovery = 100 + bias % = 100 + ${fmt(T.biasPct, 2)} = ${fmt(T.recovery, 1)} %`],
            note: "The two cards are not independent findings — they are one number expressed two ways.",
          },
          windowStep(T.recovery, L),
        ],
        footer: "The card's colour follows the t-test, not this percentage: it is red only when the bias is statistically significant.",
      };
    }

    case "recovery": {
      if (T.mode !== "crm") return null;
      return {
        title: "Recovery",
        subtitle: "what fraction of the certified amount you measured back",
        result: fmt(T.recovery, 1), unit: "%",
        why: `Recovery answers the question in the form most analysts think in: of what was certified to be there, how much did the method actually find? 100 % is perfect; below that suggests losses in extraction, digestion or clean-up, above it suggests an interference adding signal.`,
        steps: [
          {
            title: "Take your mean and the certified value.",
            work: [
              `x̄         = ${fmtSig(T.mean)} ${unit}`,
              `certified = ${fmtSig(refValue)} ${unit}`,
            ],
          },
          {
            title: "Recovery is the ratio, as a percentage.",
            formula: "recovery = x̄ / certified value × 100",
            work: [`recovery = ${fmtSig(T.mean)} / ${fmtSig(refValue)} × 100 = ${fmt(T.recovery, 1)} %`],
            highlightLast: true,
          },
          windowStep(T.recovery, L),
          {
            title: "Reading the result:",
            note: T.recovery < 100
              ? "Below 100 % — look for losses: incomplete extraction or digestion, adsorption onto glassware, or analyte volatilised during evaporation."
              : T.recovery > 100
                ? "Above 100 % — look for additions: a spectral or matrix interference, contamination from reagents or labware, or a calibration reading high."
                : "Exactly 100 % to the displayed precision.",
          },
        ],
        footer: "Eurachem does not require correcting for recovery, but if you do apply a correction factor you must include its uncertainty in the budget.",
      };
    }

    /* ═══════════════════════ Spike-recovery route ═════════════════════════ */

    case "cExpected": {
      if (T.mode !== "spike" || !vol) return null;
      return {
        title: "Expected mix conc",
        subtitle: "what the spiked sample should read at 100 % recovery",
        result: fmtSig(T.cExpected), unit,
        why: `Adding a spike also dilutes the sample, so the spiked solution is not simply "sample plus spike" — both components are diluted into the combined volume. This is the concentration that mixing alone predicts, before the method is asked to measure anything. Everything downstream is judged against it.`,
        steps: [
          {
            title: "The mixing inputs, as entered.",
            work: [
              `V_sample = ${fmtSig(T.Vspl)}      mean unspiked conc = ${fmtSig(T.mu)} ${unit}`,
              `V_spike  = ${fmtSig(T.Vspk)}      spike conc c_spk   = ${fmtSig(T.cSpk)} ${unit}`,
              `V_total  = ${fmtSig(T.Vspl)} + ${fmtSig(T.Vspk)} = ${fmtSig(T.Vt)}`,
            ],
          },
          {
            title: "Conserve mass: the analyte from each component, divided by the combined volume.",
            formula: "c_expected = ( V_sample · c_unspiked + V_spike · c_spike ) / V_total",
          },
          {
            title: "Substitute.",
            work: [
              `numerator = ${fmtSig(T.Vspl)} × ${fmtSig(T.mu)} + ${fmtSig(T.Vspk)} × ${fmtSig(T.cSpk)} = ${fmtSig(T.Vspl * T.mu + T.Vspk * T.cSpk, 6)}`,
              `c_expected = ${fmtSig(T.Vspl * T.mu + T.Vspk * T.cSpk, 6)} / ${fmtSig(T.Vt)} = ${fmtSig(T.cExpected)} ${unit}`,
            ],
            highlightLast: true,
          },
          {
            title: "It splits into two contributions, which the next cards use separately:",
            work: [
              `diluted native analyte = V_sample · c_unspiked / V_total = ${fmtSig(T.dilutedSample)} ${unit}`,
              `spike contribution     = V_spike · c_spike / V_total   = ${fmtSig(T.spikeAdded)} ${unit}`,
              `sum                    = ${fmtSig(T.cExpected)} ${unit}   ✓`,
            ],
          },
        ],
        footer: "Volumes only need to be in consistent units — the ratio is what matters, so mL and mL, or µL and µL, both work.",
      };
    }

    case "spikeAdded": {
      if (T.mode !== "spike" || !vol) return null;
      const lift = T.dilutedSample !== 0 ? (T.spikeAdded / T.dilutedSample) * 100 : null;
      return {
        title: "Spike added (in mix)",
        subtitle: "the spike's contribution after dilution",
        result: fmtSig(T.spikeAdded), unit,
        why: `The spike solution is concentrated, but once mixed into the sample it is diluted like everything else. This is how much concentration the spike actually contributes to the final mixture — the denominator of the marginal recovery, and the quantity the method is really being tested on.`,
        steps: [
          {
            title: "The spike, before mixing.",
            work: [
              `V_spike = ${fmtSig(T.Vspk)}     c_spike = ${fmtSig(T.cSpk)} ${unit}`,
              `V_total = ${fmtSig(T.Vt)}`,
            ],
          },
          {
            title: "Its mass, spread over the combined volume.",
            formula: "spike added = V_spike · c_spike / V_total",
            work: [`spike added = ${fmtSig(T.Vspk)} × ${fmtSig(T.cSpk)} / ${fmtSig(T.Vt)} = ${fmtSig(T.spikeAdded)} ${unit}`],
            highlightLast: true,
          },
          {
            title: "Is the spike a sensible size?",
            work: [
              `diluted native analyte = ${fmtSig(T.dilutedSample)} ${unit}`,
              lift != null
                ? `spike raises the level by ${fmt(lift, 0)} % of the native content`
                : "native content is zero, so the spike sets the whole level",
            ],
            note: lift != null && lift < 20
              ? "A spike much smaller than the native content is a weak test: the difference between the two measurements is swamped by their own scatter. Aim for a spike of roughly 0.5–2× the native level."
              : "A spike of roughly 0.5–2× the native level gives a difference large enough to measure without pushing outside the working range.",
          },
        ],
        footer: "If the spike pushes the mixture above the calibrated range, the recovery will look poor for reasons that have nothing to do with trueness.",
      };
    }

    case "recTotal": {
      if (T.mode !== "spike" || !vol) return null;
      return {
        title: "Total recovery",
        subtitle: "measured mix ÷ expected mix",
        result: fmt(T.recTotal, 1), unit: "%",
        why: `The straightforward comparison: what the spiked sample actually measured, against what mixing predicted it should be. It covers all the analyte present — native plus spike — which makes it the gentler of the two recovery figures, because the native portion was measured by the same method and largely cancels.`,
        steps: [
          {
            title: "Measured against expected.",
            work: [
              `mean spiked result = ${fmtSig(T.ms)} ${unit}`,
              `c_expected         = ${fmtSig(T.cExpected)} ${unit}`,
            ],
          },
          {
            title: "The ratio, as a percentage.",
            formula: "total recovery = mean spiked / c_expected × 100",
            work: [`total recovery = ${fmtSig(T.ms)} / ${fmtSig(T.cExpected)} × 100 = ${fmt(T.recTotal, 1)} %`],
            highlightLast: true,
          },
          {
            title: "Why the spike recovery card reads differently:",
            work: [
              `total recovery  = ${fmt(T.recTotal, 1)} %   (all analyte present)`,
              `spike recovery  = ${fmt(T.recovery, 1)} %   (only the added analyte)`,
            ],
            note: "Total recovery is diluted by the native analyte, which the method already handles well. The spike recovery isolates the added portion and is the more searching test of the two — judge trueness on that one.",
          },
        ],
        footer: "Reported for transparency; the acceptance decision is normally taken on the spike (marginal) recovery.",
      };
    }

    case "spikeRecovery": {
      if (T.mode !== "spike") return null;
      const title = vol ? "Spike recovery" : "Marginal recovery";
      return {
        title,
        subtitle: "how much of the added analyte the method found",
        result: fmt(T.recovery, 1), unit: "%",
        why: `The native analyte is present in both measurements, so subtracting one from the other cancels it and leaves just the spike. That is the point of the design: it tests the method on a known amount of analyte in the real matrix, which is the closest you can get to a CRM when no CRM exists for your material.`,
        steps: [
          spikeDataStep(uns, spk, unit),
          vol
            ? {
                title: "Because mixing dilutes the sample, the native contribution to subtract is the diluted one, not the raw unspiked mean.",
                formula: "spike recovery = ( mean spiked − diluted native ) / spike added × 100",
                work: [
                  `mean spiked    = ${fmtSig(T.ms)} ${unit}`,
                  `diluted native = ${fmtSig(T.dilutedSample)} ${unit}`,
                  `spike added    = ${fmtSig(T.spikeAdded)} ${unit}`,
                ],
              }
            : {
                title: "The APHA / USEPA matrix-spike form: subtract the unspiked result, divide by the amount added.",
                formula: "%R = ( SSR − SR ) / SA × 100",
                work: [
                  `SSR = mean spiked result   = ${fmtSig(T.ms)} ${unit}`,
                  `SR  = mean unspiked result = ${fmtSig(T.mu)} ${unit}`,
                  `SA  = spike amount added   = ${fmtSig(T.amt)} ${unit}`,
                ],
                note: "This form assumes the spike volume is small enough that dilution can be ignored. If it is not, switch to the volume-mixing method above.",
              },
          {
            title: "Substitute.",
            work: vol
              ? [
                  `numerator = ${fmtSig(T.ms)} − ${fmtSig(T.dilutedSample)} = ${fmtSig(T.ms - T.dilutedSample, 4)} ${unit}`,
                  `recovery  = ${fmtSig(T.ms - T.dilutedSample, 4)} / ${fmtSig(T.spikeAdded)} × 100 = ${fmt(T.recovery, 1)} %`,
                ]
              : [
                  `numerator = ${fmtSig(T.ms)} − ${fmtSig(T.mu)} = ${fmtSig(T.ms - T.mu, 4)} ${unit}`,
                  `%R        = ${fmtSig(T.ms - T.mu, 4)} / ${fmtSig(T.amt)} × 100 = ${fmt(T.recovery, 1)} %`,
                ],
            highlightLast: true,
          },
          windowStep(T.recovery, L),
          {
            title: "As a bias:",
            work: [`bias % = recovery − 100 = ${fmt(T.biasPct, 2)} %`],
            note: "Whether that bias is real or just scatter is what the t / t crit card decides.",
          },
        ],
        footer: "A spike measures recovery of analyte added in solution. It cannot detect analyte bound into the matrix that the method fails to release — only a matrix-matched CRM can.",
      };
    }

    case "uRec": {
      if (T.mode !== "spike") return null;
      const vu = variance(uns), vs = variance(spk);
      const seu2 = vu / uns.length, ses2 = vs / spk.length;
      const factor = vol ? (T.Vspl / T.Vt) ** 2 : 1;
      const denom = vol ? T.spikeAdded : T.amt;
      return {
        title: "u(Rec)",
        subtitle: "standard uncertainty of the recovery figure",
        result: fmt(T.sdRec, 2), unit: "%",
        why: `Recovery is built from two measured means, and both carry scatter. u(Rec) propagates that scatter through the subtraction and the division, giving the standard deviation of the recovery percentage itself. Without it, a recovery of ${fmt(T.recovery, 1)} % cannot be judged — you would have no idea whether the departure from 100 % is meaningful.`,
        steps: [
          spikeDataStep(uns, spk, unit),
          {
            title: "How well is each mean known? The standard error of a mean shrinks with the number of replicates.",
            formula: "se² = s² / n",
            work: [
              `unspiked: s² = ${fmtSig(vu, 4)}   n = ${uns.length}   →   se² = ${fmtSig(seu2, 4)}`,
              `spiked:   s² = ${fmtSig(vs, 4)}   n = ${spk.length}   →   se² = ${fmtSig(ses2, 4)}`,
            ],
          },
          {
            title: vol
              ? "The two are independent, so their variances add when subtracted — and the native term is scaled by the dilution factor, because that is how it enters the recovery formula."
              : "The two are independent, so their variances add when one mean is subtracted from the other.",
            formula: vol
              ? "u(numerator) = √( se²spiked + (V_sample/V_total)² · se²unspiked )"
              : "u(numerator) = √( se²spiked + se²unspiked )",
            work: vol
              ? [
                  `(V_sample/V_total)² = (${fmtSig(T.Vspl)}/${fmtSig(T.Vt)})² = ${fmtSig(factor, 4)}`,
                  `u(numerator) = √( ${fmtSig(ses2, 4)} + ${fmtSig(factor, 4)} × ${fmtSig(seu2, 4)} ) = ${fmtSig(Math.sqrt(ses2 + factor * seu2), 4)} ${unit}`,
                ]
              : [`u(numerator) = √( ${fmtSig(ses2, 4)} + ${fmtSig(seu2, 4)} ) = ${fmtSig(Math.sqrt(ses2 + seu2), 4)} ${unit}`],
            note: "Variances add, never standard deviations — that is why each term is squared before summing and the root taken at the end.",
          },
          {
            title: `Divide by the ${vol ? "spike contribution" : "amount added"} and express as a percentage, matching how recovery itself was formed.`,
            formula: `u(Rec) = u(numerator) / ${vol ? "spike added" : "SA"} × 100`,
            work: [
              `u(Rec) = ${fmtSig(Math.sqrt(ses2 + factor * seu2), 4)} / ${fmtSig(denom)} × 100 = ${fmt(T.sdRec, 2)} %`,
            ],
            highlightLast: true,
          },
          {
            title: "Roughly what that means for the recovery you measured:",
            work: [`${fmt(T.recovery, 1)} % ± ${fmt(T.sdRec, 2)} % (1 s)   →   ≈ ${fmt(T.recovery - 2 * T.sdRec, 1)} – ${fmt(T.recovery + 2 * T.sdRec, 1)} % at ~95 %`],
            note: "More replicates on either set will tighten this — the standard errors fall as 1/√n.",
          },
        ],
        footer: "This is a repeatability-only uncertainty on the recovery. It is not the full measurement uncertainty; see the Uncertainty module for that.",
      };
    }

    /* ══════════════ t / t crit — shared by both routes ════════════════════ */

    case "t": {
      if (T.mode === "crm") {
        const withinU = refU != null && Math.abs(T.bias) <= refU;
        return {
          title: "t / t crit",
          subtitle: "is the bias real, or just scatter?",
          result: `${fmt(T.t, 2)} / ${fmt(T.tCrit, 2)}`, unit: "",
          why: `Your mean will never land exactly on the certified value — some difference always appears by chance. The t-test asks whether the difference you got is larger than replicate scatter can comfortably explain. It compares the bias with the uncertainty of your own mean; if the bias is several times that uncertainty, chance stops being a credible explanation.`,
          steps: [
            {
              title: "Start from the bias and the scatter of the replicates.",
              work: [
                `bias = x̄ − certified = ${fmtSig(T.mean)} − ${fmtSig(refValue)} = ${fmtSig(T.bias, 3)} ${unit}`,
              ],
            },
            ...(crmReps.length > 1 ? sdSteps(crmReps, unit, { sym: "s" }) : []),
            {
              title: "The mean is better known than any single result — by a factor of √n.",
              formula: "se = s / √n",
              work: [`se = ${fmtSig(T.sd)} / √${T.n} = ${fmtSig(T.se)} ${unit}`],
            },
            {
              title: "The test statistic is the bias measured in units of that standard error.",
              formula: "t = | x̄ − certified | / se",
              work: [`t = |${fmtSig(T.bias, 3)}| / ${fmtSig(T.se)} = ${fmt(T.t, 2)}`],
              highlightLast: true,
            },
            {
              title: `Compare with the two-tailed 95 % critical value at df = n − 1 = ${T.df}.`,
              work: [
                `t crit = ${fmt(T.tCrit, 2)}`,
                `${fmt(T.t, 2)} ${T.significant ? ">" : "≤"} ${fmt(T.tCrit, 2)}  →  ${T.significant ? "significant bias" : "no significant bias at 95 %"}`,
              ],
              highlightLast: true,
            },
            {
              title: "What the verdict does and does not say:",
              note: T.significant
                ? `A real, reproducible offset — the method reads ${T.bias > 0 ? "high" : "low"}. Find the cause; correcting for it is a last resort, and if you do, the correction's uncertainty must go into the budget.${refU != null && withinU ? " Note the bias is still inside the CRM's own uncertainty, so the material itself only weakly supports this conclusion." : ""}`
                : `"Not significant" means this study could not detect a bias — not that there is none. With only ${T.n} replicates the test is blunt; a bias smaller than about ${fmtSig(T.tCrit * T.se, 2)} ${unit} would slip through unnoticed. Add replicates if you need to rule out a smaller one.`,
            },
          ],
          footer: "Statistical significance and practical importance are different questions. With many replicates a trivially small bias becomes significant — always check the size of the bias against your requirement too.",
        };
      }
      if (T.mode !== "spike") return null;
      return {
        title: "t / t crit",
        subtitle: "is the departure from 100 % recovery real?",
        result: `${fmt(T.t, 2)} / ${fmt(T.tCrit, 2)}`, unit: "",
        why: `A recovery of exactly 100 % essentially never happens. The test asks whether the gap between your recovery and 100 % is bigger than the scatter of the two replicate sets can account for — comparing the departure against u(Rec), the uncertainty of the recovery itself.`,
        steps: [
          {
            title: "The two ingredients, both already computed.",
            work: [
              `recovery = ${fmt(T.recovery, 1)} %      departure from 100 % = ${fmt(Math.abs(T.recovery - 100), 2)} %`,
              `u(Rec)   = ${fmt(T.sdRec, 2)} %`,
            ],
          },
          {
            title: "Express the departure in units of its own uncertainty.",
            formula: "t = | recovery − 100 | / u(Rec)",
            work: [`t = ${fmt(Math.abs(T.recovery - 100), 2)} / ${fmt(T.sdRec, 2)} = ${fmt(T.t, 2)}`],
            highlightLast: true,
          },
          {
            title: `Compare with the two-tailed 95 % critical value at df = ${T.df}.`,
            work: [
              `t crit = ${fmt(T.tCrit, 2)}`,
              `${fmt(T.t, 2)} ${T.significant ? ">" : "≤"} ${fmt(T.tCrit, 2)}  →  ${T.significant ? "significant bias" : "no significant bias at 95 %"}`,
            ],
            note: `Degrees of freedom follow the smaller replicate set: min(${uns.length}, ${spk.length}) − 1 = ${T.df}. Adding replicates to only one set does not buy much.`,
            highlightLast: true,
          },
          {
            title: "What the verdict means here:",
            note: T.significant
              ? `The method does not fully recover the spike (or over-recovers it). Check for matrix suppression or enhancement, incomplete digestion, or losses during clean-up.`
              : `The recovery is consistent with 100 % given the scatter in your replicates. As with any negative result, this is a failure to detect a bias rather than proof there is none.`,
          },
        ],
        footer: "A recovery can pass this test yet still fall outside your acceptance window, or fail it while comfortably inside — the two checks answer different questions and both matter.",
      };
    }

    default:
      return null;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Fully controlled — `statKey` selects the explanation, `onClose` clears it.
   ══════════════════════════════════════════════════════════════════════════ */
export function TruenessCalcDialog({ open, onClose, statKey, trueness, unit, refValue, refU, reps, limits }) {
  const ex = open ? buildExplain(statKey, { trueness, unit, refValue, refU, reps, limits }) : null;
  return <CalcDialogShell open={open} onClose={onClose} ex={ex} unit={unit} />;
}

export default TruenessCalcDialog;

/* ══════════════════════════════════════════════════════════════════════════
   StatCalcDialog — "show me the arithmetic" modal for the LOD / LOQ cards.

   Clicking any result card in the LOD / LOQ module opens this dialog, which
   walks the number back to the raw data the user typed in: which values were
   used, the symbolic formula, the substitution with real numbers, and the
   result. Every stat on that page has an entry.

   Deliberately self-contained — it owns its own formatters and statistics so
   nothing here has to be threaded back out of labvalidate-pro.jsx. The caller
   passes raw data + the already-computed `lod` object and a `statKey`.
   ══════════════════════════════════════════════════════════════════════════ */
import {
  CalcDialogShell, fmt, fmtSig, signed, sdSteps, dataStep,
} from "@/components/CalcSteps";

/* ══════════════════════════════════════════════════════════════════════════
   The explanation engine — one builder per stat card.
   Returns { title, result, unit, why, steps, footer } or null.
   ══════════════════════════════════════════════════════════════════════════ */
function buildExplain(statKey, { lod, unit, kQ, design }) {
  if (!lod) return null;
  const D = design || {};
  const reps = D.reps || [];
  const nI = D.nI ?? 1;
  const nB = D.nB ?? reps.length;
  const source = lod.approach === "fortified" ? "low-fortified results" : "blank results";

  switch (statKey) {
    /* ─────────────────────────────── Mean blank ─────────────────────────── */
    case "mean": {
      if (!reps.length) return null;
      const n = reps.length;
      const sum = reps.reduce((a, b) => a + b, 0);
      return {
        title: "Mean blank",
        subtitle: "x̄ — the average of the low-level results",
        result: fmtSig(lod.mean), unit,
        why: `The mean is the centre of the blank noise — the value the method reports on average when there is (nominally) no analyte. It anchors the distribution curve below: LOD and LOQ are measured as distances above this point. It also feeds the standard deviation, since the spread is measured relative to it.`,
        steps: [
          dataStep(reps, unit, source),
          {
            title: "The mean is the arithmetic average: add everything up, divide by how many there are.",
            formula: "x̄ = ( x₁ + x₂ + … + xₙ ) / n  =  Σxᵢ / n",
          },
          {
            title: "Add all the results together.",
            work: [
              // Wrapped, not passed bare: map's third argument would land in signed()'s digits slot.
              `Σxᵢ = ${reps.map((v, i) => signed(v, i)).join(" ")}`,
              `Σxᵢ = ${fmtSig(sum, 6)} ${unit}`,
            ],
          },
          {
            title: `Divide the total by n = ${n}.`,
            work: [`x̄ = ${fmtSig(sum, 6)} / ${n} = ${fmtSig(lod.mean)} ${unit}`],
            highlightLast: true,
          },
        ],
        footer: "A mean well above zero on a reagent blank points at contamination or an uncorrected baseline — investigate it before trusting the LOD.",
      };
    }

    /* ─────────────────────────────────── s₀ ─────────────────────────────── */
    case "s0": {
      if (reps.length < 2) return null;
      // A blank-corrected or near-zero mean makes the RSD meaningless, so it is
      // only offered when there is a real, positive mean to divide by.
      const rsd = lod.mean > 0 ? (lod.s0 / lod.mean) * 100 : null;
      return {
        title: "s₀",
        subtitle: "standard deviation of the low-level results",
        result: fmtSig(lod.s0), unit,
        why: `s₀ is the raw scatter of the method at (or near) zero — how much a single measurement bounces around when no analyte is present. Everything on this page is built from it: the whole point of an LOD is "how far above the noise must a result sit before it is real?", and s₀ is that noise.`,
        steps: [
          {
            title: `Start from the mean of the same ${reps.length} results — the spread is measured relative to it.`,
            work: [`x̄ = ${fmtSig(lod.mean)} ${unit}    n = ${reps.length}`],
          },
          {
            title: "The sample standard deviation:",
            formula: "s₀ = √[ Σ(xᵢ − x̄)² / (n − 1) ]",
          },
          ...sdSteps(reps, unit, { sym: "s₀" }),
          rsd != null && {
            title: "As a relative figure, for context:",
            work: [`RSD = s₀ / x̄ × 100 = ${fmtSig(lod.s0, 3)} / ${fmtSig(lod.mean, 3)} × 100 = ${fmt(rsd, 1)} %`],
            note: "Near zero an RSD like this is expected to be large — that is exactly why a separate LOQ is needed.",
          },
        ],
        footer: `Eurachem recommends ≥ 10 replicates for a stable s₀; you used ${reps.length}. Fewer replicates make s₀ itself uncertain, which propagates straight into the LOD.`,
      };
    }

    /* ─────────────────────────────────── s′₀ ────────────────────────────── */
    case "s0p": {
      if (lod.s0 == null) return null;
      const corrected = !!D.blankCorrected;
      const bracket = corrected ? 1 / nI + 1 / nB : null;
      const factor = corrected ? Math.sqrt(bracket) : Math.sqrt(nI);
      return {
        title: "s′₀",
        subtitle: corrected ? "s₀ adjusted for blank correction" : "s₀ adjusted for replicate averaging",
        result: fmtSig(lod.s0p), unit,
        why: corrected
          ? `A reported result is not one raw measurement — it is a measurement minus an averaged blank. Both parts carry noise, so the scatter of the final reported value is not s₀. s′₀ is that corrected scatter, and it is what the LOD and LOQ are actually built from.`
          : `A reported result is the average of n replicate measurements, and averaging shrinks scatter by √n. s′₀ is the scatter of the reported value rather than of a single measurement, and it is what the LOD and LOQ are built from.`,
        steps: [
          {
            title: "Start from the raw scatter of the low-level results.",
            work: [`s₀ = ${fmtSig(lod.s0)} ${unit}`],
          },
          corrected
            ? {
                title: "Because results are blank-corrected, two independent uncertainties combine — the measurement itself and the averaged blank being subtracted.",
                formula: "s′₀ = s₀ · √( 1/n + 1/n_b )",
                note: `n = ${nI} replicate measurement(s) behind each reported result; n_b = ${nB} blank replicates averaged to form the blank that gets subtracted. More blank replicates ⇒ a better-known blank ⇒ smaller s′₀.`,
              }
            : {
                title: `Each reported result is the mean of n = ${nI} replicate measurement(s), and averaging reduces scatter by √n.`,
                formula: "s′₀ = s₀ / √n",
                note: nI === 1 ? "With n = 1 there is no averaging, so s′₀ comes out equal to s₀." : null,
              },
          corrected
            ? {
                title: "Work out the bracket first.",
                work: [
                  `1/n   = 1/${nI} = ${fmtSig(1 / nI, 4)}`,
                  `1/n_b = 1/${nB} = ${fmtSig(1 / nB, 4)}`,
                  `1/n + 1/n_b = ${fmtSig(bracket, 4)}`,
                  `√(${fmtSig(bracket, 4)}) = ${fmtSig(factor, 4)}`,
                ],
              }
            : {
                title: "Work out the divisor.",
                work: [`√n = √${nI} = ${fmtSig(factor, 4)}`],
              },
          {
            title: corrected ? "Multiply s₀ by that factor." : "Divide s₀ by that factor.",
            work: [
              corrected
                ? `s′₀ = ${fmtSig(lod.s0)} × ${fmtSig(factor, 4)} = ${fmtSig(lod.s0p)} ${unit}`
                : `s′₀ = ${fmtSig(lod.s0)} / ${fmtSig(factor, 4)} = ${fmtSig(lod.s0p)} ${unit}`,
            ],
            highlightLast: true,
          },
        ],
        footer: "Toggle “Results are blank-corrected” to match how your reported results are actually produced — it changes s′₀, and therefore both limits.",
      };
    }

    /* ─────────────────────────────────── LOD ────────────────────────────── */
    case "lod": {
      if (lod.approach === "calibration") {
        return {
          title: "LOD",
          subtitle: "limit of detection, from the calibration curve",
          result: fmtSig(lod.lod), unit,
          why: `When no blank replicates are available, the scatter of the calibration points about the fitted line stands in for the blank noise. Sy/x measures that scatter in signal units; dividing by the slope converts it into concentration.`,
          steps: [
            {
              title: "Both inputs come from the Linearity & Range module — nothing extra is measured here.",
              work: [
                `Sy/x = ${fmtSig(lod.syx)}     residual standard deviation of the calibration`,
                `b₁   = ${fmtSig(lod.slope)}     slope of the fitted line`,
              ],
            },
            {
              title: "The ICH / Eurachem calibration form of the detection limit:",
              formula: "LOD = 3.3 · Sy/x / b₁",
              note: "3.3 ≈ 3.3 standard deviations above zero response. Dividing by the slope b₁ turns a signal-unit scatter into a concentration.",
            },
            {
              title: "Substitute the two numbers.",
              work: [`LOD = 3.3 × ${fmtSig(lod.syx)} / ${fmtSig(lod.slope)} = ${fmtSig(lod.lod)} ${unit}`],
              highlightLast: true,
            },
          ],
          footer: "This estimate assumes the calibration scatter near zero is the same as it is across the whole range. Where that is doubtful, prefer replicate blanks.",
        };
      }
      const lc = lod.mean + 1.5 * lod.s0p;
      return {
        title: "LOD",
        subtitle: "limit of detection = 3 · s′₀",
        result: fmtSig(lod.lod), unit,
        why: `The LOD is the smallest amount that can be reliably distinguished from a blank — not measured accurately, just detected. It is expressed as a distance above the blank, in units of the blank's own noise.`,
        steps: [
          {
            title: "Start from the scatter a reported result carries at/near zero.",
            work: [`s′₀ = ${fmtSig(lod.s0p)} ${unit}`],
          },
          {
            title: "Place the detection limit three standard deviations above the blank.",
            formula: "LOD = 3 · s′₀",
            note: "Splitting the gap in two: a decision limit placed midway (1.5 s′₀ above the blank) leaves ≈ 6.7 % chance a blank reads above it (false positive, α) and ≈ 6.7 % chance a sample truly at the LOD reads below it (false negative, β). That balance is what the factor 3 buys.",
          },
          {
            title: "Substitute s′₀.",
            work: [`LOD = 3 × ${fmtSig(lod.s0p)} = ${fmtSig(lod.lod)} ${unit}`],
            highlightLast: true,
          },
          {
            title: "For reference, where the decision limit sits on the chart below (as an absolute reading, blank included):",
            work: [
              `L_C = x̄ + 1.5 · s′₀ = ${fmtSig(lod.mean, 3)} + 1.5 × ${fmtSig(lod.s0p, 3)} = ${fmtSig(lc)} ${unit}`,
              `LOD as an absolute reading = x̄ + 3 · s′₀ = ${fmtSig(lod.mean + lod.lod)} ${unit}`,
            ],
            note: "The card shows the LOD as a distance above the blank; the chart plots it as an absolute measured value, which is why the two numbers differ by x̄.",
          },
        ],
        footer: "Report results below the LOD as “not detected”, not as a number.",
      };
    }

    /* ─────────────────────────────────── LOQ ────────────────────────────── */
    case "loq": {
      if (lod.approach === "calibration") {
        return {
          title: "LOQ",
          subtitle: `limit of quantification, from the calibration curve (k_Q = ${kQ})`,
          result: fmtSig(lod.loq), unit,
          why: `The LOQ is the lowest level you are willing to report as a number rather than as “detected”. Same inputs as the LOD, with a larger multiplier so the relative scatter at that level is acceptable.`,
          steps: [
            {
              title: "Both inputs come from the Linearity & Range module.",
              work: [
                `Sy/x = ${fmtSig(lod.syx)}     residual standard deviation of the calibration`,
                `b₁   = ${fmtSig(lod.slope)}     slope of the fitted line`,
              ],
            },
            {
              title: "Same form as the LOD, with the quantification multiplier k_Q in place of 3.3.",
              formula: `LOQ = k_Q · Sy/x / b₁     (k_Q = ${kQ})`,
              note: `k_Q = ${kQ} means the result at the LOQ carries a relative standard deviation of about ${fmt(100 / kQ, 0)} %. Change it in Study Plan if your requirement differs.`,
            },
            {
              title: "Substitute.",
              work: [`LOQ = ${kQ} × ${fmtSig(lod.syx)} / ${fmtSig(lod.slope)} = ${fmtSig(lod.loq)} ${unit}`],
              highlightLast: true,
            },
          ],
          footer: "Verify the LOQ experimentally: fortify a sample at this level and confirm precision and recovery there still meet your requirement.",
        };
      }
      return {
        title: "LOQ",
        subtitle: `limit of quantification = k_Q · s′₀  (k_Q = ${kQ})`,
        result: fmtSig(lod.loq), unit,
        why: `Detecting something and measuring it are different jobs. At the LOD a result is barely distinguishable from noise; the LOQ is set higher, where the scatter has shrunk enough relative to the value that reporting a number is defensible.`,
        steps: [
          {
            title: "Start from the same scatter used for the LOD.",
            work: [`s′₀ = ${fmtSig(lod.s0p)} ${unit}`],
          },
          {
            title: "Multiply by the quantification factor k_Q instead of 3.",
            formula: `LOQ = k_Q · s′₀     (k_Q = ${kQ})`,
            note: `k_Q is set in Study Plan; 10 is the Eurachem default. Choosing k_Q fixes the relative precision at the limit — see the last step.`,
          },
          {
            title: "Substitute s′₀.",
            work: [`LOQ = ${kQ} × ${fmtSig(lod.s0p)} = ${fmtSig(lod.loq)} ${unit}`],
            highlightLast: true,
          },
          {
            title: "Why that multiplier gives a usable number:",
            work: [`RSD at the LOQ = s′₀ / LOQ × 100 = 1 / k_Q × 100 = ${fmt(100 / kQ, 1)} %`],
            note: `A result sitting exactly at the LOQ scatters by roughly ± ${fmt(100 / kQ, 0)} % — low enough to quote a value, and ${fmt(lod.loq / lod.lod, 1)}× higher than the LOD.`,
          },
        ],
        footer: "Verify the LOQ experimentally: fortify a sample at this level and confirm precision and recovery there still meet your requirement.",
      };
    }

    /* ───────────────────────────── USEPA — IDL ──────────────────────────── */
    case "idl": {
      const v = lod.idl, vals = D.idlReps || [];
      if (!v || vals.length < 2) return null;
      return {
        title: `IDL (${fmt(v.k, 0)}·s)`,
        subtitle: "instrument detection limit",
        result: fmtSig(v.value), unit,
        why: `The IDL characterises the instrument alone — replicate injections of a low-level standard, no sample preparation and no matrix. It is a sensitivity check on the detector, not a method limit, and is normally well below the MDL.`,
        steps: [
          dataStep(vals, unit, "low-level standard injections"),
          {
            title: "Scatter of those injections — the same sample standard deviation as everywhere else:",
            formula: "s = √[ Σ(xᵢ − x̄)² / (n − 1) ]",
          },
          ...sdSteps(vals, unit, { sym: "s" }),
          {
            title: `Multiply by the chosen factor k = ${fmt(v.k, 0)}.`,
            formula: "IDL = k · s",
            work: [`IDL = ${fmt(v.k, 0)} × ${fmtSig(v.sd)} = ${fmtSig(v.value)} ${unit}`],
            highlightLast: true,
          },
        ],
        footer: "USEPA expects ≥ 7 replicate injections of a standard at roughly 3–5× the estimated IDL.",
      };
    }

    /* ────────────────────── USEPA — MDL from spikes ─────────────────────── */
    case "mdlSpiked": {
      const v = lod.mdlSpiked, vals = D.mdlSpikedReps || [];
      if (!v || vals.length < 2) return null;
      return {
        title: "MDL spiked (t·s)",
        subtitle: "method detection limit from spiked replicates",
        result: fmtSig(v.value), unit,
        why: `This is the whole method's detection limit: spiked samples taken through every preparation step, so extraction losses, matrix effects and handling variability are all inside the scatter. 40 CFR 136 App. B uses a one-sided 99 % Student-t rather than a flat factor of 3, which compensates for having only a handful of replicates.`,
        steps: [
          dataStep(vals, unit, "spiked replicates carried through the full method"),
          {
            title: "Scatter of the spiked replicates:",
            formula: "s = √[ Σ(xᵢ − x̄)² / (n − 1) ]",
          },
          ...sdSteps(vals, unit, { sym: "s" }),
          {
            title: `Look up the one-sided 99 % Student-t at df = n − 1 = ${v.n - 1}.`,
            work: [`t₍${v.n - 1}, 0.99₎ = ${fmt(v.t, 3)}`],
            note: "The value shrinks toward 2.33 as replicates increase — with few replicates s itself is poorly known, so the multiplier is larger to compensate.",
          },
          {
            title: "Multiply.",
            formula: "MDLₛ = t · s",
            work: [`MDLₛ = ${fmt(v.t, 3)} × ${fmtSig(v.sd)} = ${fmtSig(v.value)} ${unit}`],
            highlightLast: true,
          },
        ],
        footer: `The spike level must land within 1–10× the resulting MDL${D.spikeLevel ? ` — you spiked at ${fmtSig(D.spikeLevel)} ${unit}` : ""}. USEPA also expects the replicates spread over ≥ 3 days or batches.`,
      };
    }

    /* ────────────────────── USEPA — MDL from blanks ─────────────────────── */
    case "mdlBlank": {
      const v = lod.mdlBlank, vals = D.mdlBlankReps || [];
      if (!v || vals.length < 2) return null;
      return {
        title: "MDL blank (x̄ + t·s)",
        subtitle: "method detection limit from method blanks",
        result: fmtSig(v.value), unit,
        why: `If your method blanks give detectable results, the blank level itself limits detection — no spike-based figure below the blank noise is credible. This estimate starts at the mean blank rather than at zero, which is why the mean is added here but not in the spiked version.`,
        steps: [
          dataStep(vals, unit, "method-blank replicates"),
          {
            title: "Average the blanks — this is the floor the limit sits on.",
            work: [`x̄ = Σxᵢ / n = ${fmtSig(vals.reduce((a, b) => a + b, 0), 6)} / ${vals.length} = ${fmtSig(v.mean)} ${unit}`],
          },
          {
            title: "Scatter of the blanks:",
            formula: "s = √[ Σ(xᵢ − x̄)² / (n − 1) ]",
          },
          ...sdSteps(vals, unit, { sym: "s" }),
          {
            title: `One-sided 99 % Student-t at df = n − 1 = ${v.n - 1}.`,
            work: [`t₍${v.n - 1}, 0.99₎ = ${fmt(v.t, 3)}`],
          },
          {
            title: "Add the allowance to the mean blank.",
            formula: "MDL_b = x̄ + t · s",
            work: [`MDL_b = ${fmtSig(v.mean)} + ${fmt(v.t, 3)} × ${fmtSig(v.sd)} = ${fmtSig(v.value)} ${unit}`],
            highlightLast: true,
          },
        ],
        footer: "Leave the method-blank grid empty if every blank was a genuine non-detect — this estimate then does not apply.",
      };
    }

    /* ───────────────────── USEPA — reported MDL (max) ───────────────────── */
    case "mdl": {
      if (lod.mdl == null) return null;
      const s = lod.mdlSpiked, b = lod.mdlBlank;
      return {
        title: "MDL (reported)",
        subtitle: "the greater of the two estimates",
        result: fmtSig(lod.mdl), unit,
        why: `40 CFR 136 App. B requires both estimates to be computed and the larger one reported. A spike-based MDL sitting below the blank noise would be unachievable in practice, so the blank estimate acts as a floor.`,
        steps: [
          {
            title: "Collect both candidate estimates.",
            work: [
              s ? `MDLₛ (spiked) = ${fmtSig(s.value)} ${unit}` : "MDLₛ (spiked) = — (not enough replicates)",
              b ? `MDL_b (blank)  = ${fmtSig(b.value)} ${unit}` : "MDL_b (blank)  = — (no detectable blanks entered)",
            ],
          },
          {
            title: "Report the larger of the two.",
            formula: "MDL = max( MDLₛ , MDL_b )",
            work: [`MDL = ${fmtSig(lod.mdl)} ${unit}`],
            highlightLast: true,
          },
          {
            title: "Which one governs, and what that tells you:",
            note: lod.governed === "blank"
              ? "Blank-governed — your method blanks, not the measurement scatter, are setting the limit. Chase down the contamination and the MDL will drop."
              : "Spike-governed — the limit is set by the scatter of the spiked replicates, which is the normal, healthy case.",
          },
        ],
        footer: "Re-verify the MDL annually and after any significant change to the method or instrument.",
      };
    }

    default:
      return null;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Fully controlled — `statKey` selects the explanation, `onClose` clears it.
   ══════════════════════════════════════════════════════════════════════════ */
export function StatCalcDialog({ open, onClose, statKey, lod, unit, kQ = 10, design }) {
  const ex = open ? buildExplain(statKey, { lod, unit, kQ, design }) : null;
  return <CalcDialogShell open={open} onClose={onClose} ex={ex} unit={unit} />;
}

export default StatCalcDialog;

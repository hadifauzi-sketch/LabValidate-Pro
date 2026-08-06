/* ══════════════════════════════════════════════════════════════════════════
   LinearityCalcDialog — "show me the arithmetic" modal for the Linearity &
   Range result cards (slope b₁, intercept b₀, R², Sy/x, max residual, RF RSD).

   Clicking a card walks the number back to the calibration levels the user
   typed in: the mean response at each level, the sums that go into the
   least-squares fit, the substitution, and the result.

   Holds only the Linearity explanations — the modal chrome, formatters and
   the shared standard-deviation walkthrough come from CalcSteps.
   ══════════════════════════════════════════════════════════════════════════ */
import {
  CalcDialogShell, fmt, fmtSig, mean, sdSteps,
} from "@/components/CalcSteps";

/* Least-squares sums rebuilt from the fitted rows, so every table below shows
   the same intermediate quantities the regression itself used. */
function sums(lin) {
  const x = lin.rows.map((r) => r.conc);
  const y = lin.rows.map((r) => r.yObs);
  const mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return { x, y, mx, my, sxy, sxx, syy, n: x.length };
}

/* The opening step every explanation shares: each plotted point is the mean of
   that level's replicate readings, not a single reading. */
const levelsStep = (lin, unit, levels) => ({
  title: `Each calibration level contributes one point: the mean response of its replicate readings. That gives n = ${lin.n} points for the fit.`,
  table: {
    head: ["#", `Conc x (${unit})`, "Reps", "Mean response ȳ"],
    rows: lin.rows.map((r, i) => [
      String(i + 1),
      fmtSig(r.conc),
      String(levels?.[i]?.reps?.length ?? "—"),
      fmtSig(r.yObs),
    ]),
  },
  note: "Levels with no concentration entered, or with no readings, are skipped entirely.",
});

/* ══════════════════════════════════════════════════════════════════════════
   The explanation engine — one builder per Linearity card.
   ══════════════════════════════════════════════════════════════════════════ */
function buildExplain(statKey, { lin, unit, limits, levels, tCrit }) {
  if (!lin) return null;
  const L = limits || {};
  const { x, y, mx, my, sxy, sxx, syy, n } = sums(lin);

  switch (statKey) {
    /* ───────────────────────────────── Slope b₁ ─────────────────────────── */
    case "slope": {
      return {
        title: "Slope b₁",
        subtitle: "b₁ — sensitivity of the method",
        result: fmtSig(lin.slope), unit: "",
        why: `The slope is how much signal you gain per unit of concentration — the method's sensitivity. A steeper slope means a small change in concentration is easier to see. It is also the conversion factor that turns a measured signal back into a concentration, and the divisor in the calibration-route LOD and LOQ.`,
        steps: [
          levelsStep(lin, unit, levels),
          {
            title: "Work out the centre of the data — the fitted line is forced through this point.",
            work: [
              `x̄ = Σxᵢ / n = ${fmtSig(x.reduce((a, b) => a + b, 0), 6)} / ${n} = ${fmtSig(mx)} ${unit}`,
              `ȳ = Σyᵢ / n = ${fmtSig(y.reduce((a, b) => a + b, 0), 6)} / ${n} = ${fmtSig(my)}`,
            ],
          },
          {
            title: "Least squares picks the slope that makes the total squared vertical distance to the points as small as possible. That works out to:",
            formula: "b₁ = Σ(xᵢ − x̄)(yᵢ − ȳ) / Σ(xᵢ − x̄)²   =   Sxy / Sxx",
          },
          {
            title: "Build the two sums, level by level.",
            table: {
              head: ["#", `xᵢ`, "yᵢ", "(xᵢ−x̄)(yᵢ−ȳ)", "(xᵢ−x̄)²"],
              rows: lin.rows.map((r, i) => [
                String(i + 1), fmtSig(r.conc), fmtSig(r.yObs),
                fmtSig((x[i] - mx) * (y[i] - my), 3), fmtSig((x[i] - mx) ** 2, 3),
              ]),
              foot: ["Σ", "", "", fmtSig(sxy, 4), fmtSig(sxx, 4)],
            },
            note: "Sxx measures how widely spread your concentration levels are; Sxy measures how strongly signal moves with concentration.",
          },
          {
            title: "Divide.",
            work: [`b₁ = ${fmtSig(sxy, 4)} / ${fmtSig(sxx, 4)} = ${fmtSig(lin.slope)}`],
            highlightLast: true,
          },
          {
            title: "How well is the slope itself known?",
            work: [
              `s(b₁) = Sy/x / √Sxx = ${fmtSig(lin.syx)} / √${fmtSig(sxx, 4)} = ${fmtSig(lin.sSlope)}`,
              `relative uncertainty = ${fmt(Math.abs((lin.sSlope / lin.slope) * 100), 2)} %`,
            ],
            note: "Spreading the levels further apart increases Sxx and pins the slope down more tightly.",
          },
        ],
        footer: "Response units are whatever your instrument reports, so the slope is not shown with a unit here — it is response per " + unit + ".",
      };
    }

    /* ─────────────────────────────── Intercept b₀ ───────────────────────── */
    case "intercept": {
      const t = tCrit ?? 0;
      return {
        title: "Intercept b₀",
        subtitle: "b₀ — the fitted response at zero concentration",
        result: fmtSig(lin.intercept), unit: "",
        why: `The intercept is where the fitted line crosses zero concentration. Ideally it is indistinguishable from zero — a blank should give no signal. An intercept that is statistically different from zero points at a reagent blank, carry-over, or a baseline the method is not subtracting, and it biases every low-level result.`,
        steps: [
          {
            title: "The least-squares line always passes through the centre of the data, so once the slope is known the intercept follows.",
            formula: "b₀ = ȳ − b₁ · x̄",
          },
          {
            title: "Substitute the centre point and the slope.",
            work: [`b₀ = ${fmtSig(my)} − (${fmtSig(lin.slope)}) × (${fmtSig(mx)}) = ${fmtSig(lin.intercept)}`],
            highlightLast: true,
          },
          {
            title: "An intercept is never exactly zero by luck alone, so test whether it is meaningfully different from zero. First, its standard error:",
            formula: "s(b₀) = Sy/x · √( 1/n + x̄² / Sxx )",
            work: [
              `s(b₀) = ${fmtSig(lin.syx)} × √( 1/${n} + ${fmtSig(mx ** 2, 4)} / ${fmtSig(sxx, 4)} ) = ${fmtSig(lin.sIntercept)}`,
            ],
          },
          {
            title: `Compare |b₀| with the 95 % critical value  t × s(b₀)   (two-tailed t at df = n − 2 = ${n - 2}).`,
            work: [
              `t₍${n - 2}, 0.05₎ = ${fmt(t, 3)}`,
              `t · s(b₀) = ${fmt(t, 3)} × ${fmtSig(lin.sIntercept)} = ${fmtSig(lin.interceptCI)}`,
              `|${fmtSig(lin.intercept)}| ${lin.interceptSig ? ">" : "≤"} ${fmtSig(lin.interceptCI)}  →  ${lin.interceptSig ? "significantly different from zero" : "not significantly different from zero"}`,
            ],
            highlightLast: true,
          },
          {
            title: "What that verdict means in practice:",
            note: lin.interceptSig
              ? "The card is flagged red. Investigate blanks and carry-over before using this calibration at low levels — see the Eurachem Blanks in Method Validation supplement."
              : "The card is green: the intercept is within the noise of zero, which is what you want. It does not prove there is no bias, only that this calibration cannot detect one.",
          },
        ],
        footer: "A significant intercept does not necessarily invalidate the method at high concentrations — it matters most near the LOD and LOQ.",
      };
    }

    /* ─────────────────────────────────── R² ─────────────────────────────── */
    case "r2": {
      return {
        title: "R²",
        subtitle: "coefficient of determination",
        result: fmt(lin.r2, 5), unit: "",
        why: `R² is the fraction of the variation in response that the straight line accounts for — 1 would mean every point sits exactly on the line. It is a measure of correlation, not of linearity: a gently curving calibration can still return R² = 0.999. Treat it as a smoke alarm, and judge linearity from the residual plot and the response factors.`,
        steps: [
          {
            title: "Start from the same three sums the fit uses.",
            table: {
              head: ["#", "xᵢ", "yᵢ", "(xᵢ−x̄)(yᵢ−ȳ)", "(xᵢ−x̄)²", "(yᵢ−ȳ)²"],
              rows: lin.rows.map((r, i) => [
                String(i + 1), fmtSig(r.conc), fmtSig(r.yObs),
                fmtSig((x[i] - mx) * (y[i] - my), 3),
                fmtSig((x[i] - mx) ** 2, 3),
                fmtSig((y[i] - my) ** 2, 3),
              ]),
              foot: ["Σ", "", "", fmtSig(sxy, 4), fmtSig(sxx, 4), fmtSig(syy, 4)],
            },
          },
          {
            title: "The correlation coefficient r compares how much x and y move together with how much each moves on its own.",
            formula: "r = Sxy / √( Sxx · Syy )",
            work: [`r = ${fmtSig(sxy, 4)} / √( ${fmtSig(sxx, 4)} × ${fmtSig(syy, 4)} ) = ${fmt(lin.r, 6)}`],
          },
          {
            title: "Square it.",
            formula: "R² = r²",
            work: [`R² = ${fmt(lin.r, 6)}² = ${fmt(lin.r2, 5)}`],
            highlightLast: true,
          },
          {
            title: "Against your acceptance criterion:",
            work: [`R² = ${fmt(lin.r2, 5)}  ${lin.r2 >= (L.r2Min ?? 0) ? "≥" : "<"}  ${L.r2Min ?? "—"}  →  ${lin.r2 >= (L.r2Min ?? 0) ? "pass" : "fail"}`],
            note: `Set in Study Plan. ${fmt((1 - lin.r2) * 100, 3)} % of the variation in response is left unexplained by the straight line.`,
          },
        ],
        footer: "Eurachem §6.3 is explicit: R² alone is not sufficient evidence of linearity. Always read the residual plot beneath these cards.",
      };
    }

    /* ─────────────────────────────────── Sy/x ───────────────────────────── */
    case "syx": {
      const ssResid = lin.rows.reduce((s, r) => s + r.resid ** 2, 0);
      return {
        title: "Sy/x",
        subtitle: "residual standard deviation about the fitted line",
        result: fmtSig(lin.syx), unit: "",
        why: `Sy/x is the typical vertical distance between a measured point and the fitted line — the scatter the calibration cannot explain. It sets how well the line can be used in reverse to read a concentration off a signal, and it is the noise term in the calibration route to LOD and LOQ on the LOD/LOQ page.`,
        steps: [
          {
            title: "For each level, work out what the line predicts and how far the measurement actually landed from it.",
            formula: "ŷᵢ = b₁·xᵢ + b₀        residualᵢ = yᵢ − ŷᵢ",
            table: {
              head: ["#", `xᵢ (${unit})`, "yᵢ measured", "ŷᵢ fitted", "yᵢ − ŷᵢ", "(yᵢ − ŷᵢ)²"],
              rows: lin.rows.map((r, i) => [
                String(i + 1), fmtSig(r.conc), fmtSig(r.yObs), fmtSig(r.yPred),
                fmtSig(r.resid, 3), fmtSig(r.resid ** 2, 3),
              ]),
              foot: ["Σ", "", "", "", "", fmtSig(ssResid, 4)],
            },
            note: "The residuals always sum to about zero — that is what least squares guarantees — so they are squared before adding.",
          },
          {
            title: `Divide the sum of squared residuals by n − 2 = ${n - 2}, then take the square root.`,
            formula: "Sy/x = √[ Σ(yᵢ − ŷᵢ)² / (n − 2) ]",
            work: [
              `Sy/x = √( ${fmtSig(ssResid, 4)} / ${n - 2} )`,
              `Sy/x = √${fmtSig(ssResid / (n - 2), 4)} = ${fmtSig(lin.syx)}`,
            ],
            highlightLast: true,
            note: "n − 2, not n − 1: two parameters (slope and intercept) were estimated from this data, so two degrees of freedom are spent.",
          },
          {
            title: "Where this number is used again:",
            note: "On the LOD/LOQ page, choosing “From calibration” computes LOD = 3.3·Sy/x ÷ b₁ — Sy/x standing in for the blank noise, and the slope converting it to a concentration.",
          },
        ],
        footer: "Sy/x carries the units of the response, so it is only comparable between calibrations run on the same detector and scale.",
      };
    }

    /* ────────────────────────────── Max residual ────────────────────────── */
    case "maxResid": {
      const worst = lin.rows.reduce((a, b) => (Math.abs(b.residPct) > Math.abs(a.residPct) ? b : a), lin.rows[0]);
      const pass = lin.maxResidPct <= (L.residPctMax ?? Infinity);
      return {
        title: "Max residual",
        subtitle: "largest deviation of a point from the fitted line",
        result: fmt(lin.maxResidPct, 2), unit: "%",
        why: `A residual expressed as a percentage answers the practical question: if I read this level off the calibration, how far out would I be? Unlike R², it is judged level by level, so a single badly-fitting point — usually at the bottom of the range where the relative error is largest — cannot hide behind a good overall correlation.`,
        steps: [
          {
            title: "Express each residual relative to what the line predicted at that level.",
            formula: "residual % = ( yᵢ − ŷᵢ ) / ŷᵢ × 100",
            table: {
              head: ["#", `xᵢ (${unit})`, "yᵢ − ŷᵢ", "ŷᵢ", "residual %"],
              rows: lin.rows.map((r, i) => [
                String(i + 1), fmtSig(r.conc), fmtSig(r.resid, 3), fmtSig(r.yPred),
                fmt(r.residPct, 2) + " %",
              ]),
            },
            note: "The same numbers are plotted in the residual plot below the cards — this table is that chart, written out.",
          },
          {
            title: "Take the largest absolute value, ignoring sign.",
            work: [
              `max |residual %| = ${fmt(lin.maxResidPct, 2)} %`,
              `occurs at the level x = ${fmtSig(worst.conc)} ${unit}`,
            ],
            highlightLast: true,
          },
          {
            title: "Against your acceptance criterion:",
            work: [`${fmt(lin.maxResidPct, 2)} %  ${pass ? "≤" : ">"}  ${L.residPctMax ?? "—"} %  →  ${pass ? "pass" : "fail"}`],
            note: pass
              ? "Set in Study Plan. Still check the residual plot for a pattern — residuals that curve or fan out signal a bad model even when every one is inside the limit."
              : "Set in Study Plan. Either narrow the working range, use replicate levels to pin the fit down, or consider a weighted or non-linear calibration model.",
          },
        ],
        footer: "Residuals scattered randomly around zero support a straight-line model; a U shape means curvature, and a widening funnel means the scatter grows with concentration (a case for weighted regression).",
      };
    }

    /* ──────────────────────────────── RF RSD ────────────────────────────── */
    case "rfRSD": {
      const rfRows = lin.rows.filter((r) => r.rf !== null);
      if (rfRows.length < 2) return null;
      const rfs = rfRows.map((r) => r.rf);
      const mRF = mean(rfs);
      const sRF = Math.sqrt(rfs.reduce((s, v) => s + (v - mRF) ** 2, 0) / (rfs.length - 1));
      const pass = lin.rfRSD <= (L.residPctMax ?? Infinity);
      return {
        title: "RF RSD",
        subtitle: "scatter of the response factors across the range",
        result: fmt(lin.rfRSD, 2), unit: "%",
        why: `The response factor is signal divided by concentration. If the method really is linear through the origin, every level should return the same response factor, so their scatter is a direct test of linearity — and unlike R², it does not care how wide your range is. A drifting RF exposes curvature that a high R² will happily conceal.`,
        steps: [
          {
            title: "Divide each level's mean response by its concentration.",
            formula: "RFᵢ = yᵢ / xᵢ",
            table: {
              head: ["#", `xᵢ (${unit})`, "yᵢ", "RFᵢ = yᵢ / xᵢ", "vs mean"],
              rows: rfRows.map((r, i) => [
                String(i + 1), fmtSig(r.conc), fmtSig(r.yObs), fmtSig(r.rf),
                fmt(((r.rf - mRF) / mRF) * 100, 2) + " %",
              ]),
            },
            note: "A zero-concentration level cannot give a response factor and is left out, so this uses "
              + `${rfRows.length} of the ${n} levels.`,
          },
          {
            title: "Average the response factors.",
            work: [`RF‾ = ΣRFᵢ / ${rfRows.length} = ${fmtSig(mRF)}`],
          },
          ...sdSteps(rfs, "", { sym: "s(RF)", vSym: "RFᵢ", mSym: "RF‾" }),
          {
            title: "Express that scatter relative to the mean response factor.",
            formula: "RSD = s(RF) / RF‾ × 100",
            work: [`RSD = ${fmtSig(sRF)} / ${fmtSig(mRF)} × 100 = ${fmt(lin.rfRSD, 2)} %`],
            highlightLast: true,
          },
          {
            title: "Against your acceptance criterion:",
            work: [`${fmt(lin.rfRSD, 2)} %  ${pass ? "≤" : ">"}  ${L.residPctMax ?? "—"} %  →  ${pass ? "pass" : "review"}`],
            note: "The response-factor limit reuses the residual tolerance from Study Plan.",
          },
        ],
        footer: "Look at the “vs mean” column for a trend rather than just its spread: response factors that fall steadily as concentration rises indicate saturation at the top of the range.",
      };
    }

    default:
      return null;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Fully controlled — `statKey` selects the explanation, `onClose` clears it.
   ══════════════════════════════════════════════════════════════════════════ */
export function LinearityCalcDialog({ open, onClose, statKey, lin, unit, limits, levels, tCrit }) {
  const ex = open ? buildExplain(statKey, { lin, unit, limits, levels, tCrit }) : null;
  return <CalcDialogShell open={open} onClose={onClose} ex={ex} unit={unit} />;
}

export default LinearityCalcDialog;

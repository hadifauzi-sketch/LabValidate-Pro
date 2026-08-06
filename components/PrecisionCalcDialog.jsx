/* ══════════════════════════════════════════════════════════════════════════
   PrecisionCalcDialog — "show me the arithmetic" modal for the Precision
   result cards: the one-way ANOVA row (grand mean, sr, RSDr, sI, RSDI, r
   limit) and the Horwitz benchmark row below it.

   Clicking a card walks the number back to the nested design the user typed
   in: each group's mean and scatter, the two sums of squares, the variance
   components, and the substitution that produced the figure on the card.

   Holds only the Precision explanations — the modal chrome and the shared
   formatters come from CalcSteps.
   ══════════════════════════════════════════════════════════════════════════ */
import { CalcDialogShell, fmt, fmtSig, mean } from "@/components/CalcSteps";

/* Per-group summaries, recomputed the way S.anova1 does so the tables below
   show exactly the quantities that went into the fit. */
function groupStats(prec) {
  return prec.groups.map((g, i) => {
    const m = mean(g);
    return {
      i, n: g.length, m, values: g,
      ss: g.reduce((s, v) => s + (v - m) ** 2, 0),   // within-group sum of squares
      dev: m - prec.gm,                               // group mean − grand mean
    };
  });
}

const label = (groupLabel, i) => `${groupLabel} ${i + 1}`;

/* Every explanation opens with the design, so the reader knows what p, N and
   n̄ refer to before any formula uses them. */
const designStep = (prec, groupLabel) => ({
  title: `The design is p = ${prec.p} ${groupLabel.toLowerCase()} groups holding N = ${prec.N} results in total. Precision is split into what varies inside a ${groupLabel.toLowerCase()} and what varies between ${groupLabel.toLowerCase()}s.`,
  work: [
    `p = ${prec.p} groups     N = ${prec.N} results     n̄ = N/p = ${prec.N}/${prec.p} = ${fmt(prec.N / prec.p, 3)}`,
  ],
  note: `Groups with fewer than two replicates are dropped — one reading carries no information about scatter.`,
});

/* ══════════════════════════════════════════════════════════════════════════
   The explanation engine — one builder per Precision card.
   ══════════════════════════════════════════════════════════════════════════ */
function buildExplain(statKey, { prec, unit, limits, groupLabel = "Group" }) {
  if (!prec) return null;
  const L = limits || {};
  const H = prec.horwitz;
  const gs = groupStats(prec);
  const nBar = prec.N / prec.p;
  const varBetween = prec.sBetween ** 2;

  switch (statKey) {
    /* ────────────────────────────── Grand mean ──────────────────────────── */
    case "gm": {
      const all = prec.groups.flat();
      const sum = all.reduce((a, b) => a + b, 0);
      return {
        title: "Grand mean",
        subtitle: "x̿ — the average of every result in the study",
        result: fmtSig(prec.gm), unit,
        why: `The grand mean is the centre of the whole nested design. On its own it says nothing about precision — but every relative figure on this page (RSDr, RSDI, the HorRat ratios) is a standard deviation divided by it, so it sets the scale against which all the scatter is judged.`,
        steps: [
          designStep(prec, groupLabel),
          {
            title: `Each ${groupLabel.toLowerCase()} contributes its own results and its own mean.`,
            table: {
              head: [groupLabel, "n", `Results (${unit})`, "Mean x̄ᵢ"],
              rows: gs.map((g) => [
                label(groupLabel, g.i), String(g.n),
                g.values.map((v) => fmtSig(v, 4)).join(", "),
                fmtSig(g.m),
              ]),
            },
          },
          {
            title: "The grand mean pools every result together — it is not the average of the group means.",
            formula: "x̿ = Σ all results / N",
            note: `With equal group sizes the two happen to coincide; with unequal sizes they do not, and pooling is the correct choice because a ${groupLabel.toLowerCase()} with more replicates carries more information.`,
          },
          {
            title: `Add all ${prec.N} results and divide.`,
            work: [
              `Σx = ${fmtSig(sum, 6)} ${unit}`,
              `x̿ = ${fmtSig(sum, 6)} / ${prec.N} = ${fmtSig(prec.gm)} ${unit}`,
            ],
            highlightLast: true,
          },
        ],
        footer: prec.grubbs?.outlierIdx >= 0
          ? "A Grubbs test flags one of these results as a possible outlier — investigate it before accepting this mean."
          : "A Grubbs test over the pooled results found no outlier at the 95 % level.",
      };
    }

    /* ────────────────────────── sr — repeatability ──────────────────────── */
    case "sr": {
      return {
        title: "sr (repeatability)",
        subtitle: "scatter within a group — the best the method can do",
        result: fmtSig(prec.sr), unit,
        why: `Repeatability is the scatter you get when nothing is allowed to change: same operator, same instrument, same ${groupLabel.toLowerCase()}, same batch of reagents, measurements taken back to back. It is the floor of the method's precision — no amount of care elsewhere will beat it — and it is what the r limit below is built from.`,
        steps: [
          designStep(prec, groupLabel),
          {
            title: `Work out the scatter inside each ${groupLabel.toLowerCase()} separately: subtract that group's own mean from its results and square.`,
            table: {
              head: [groupLabel, "n", "x̄ᵢ", "Σ(xᵢⱼ − x̄ᵢ)²"],
              rows: gs.map((g) => [label(groupLabel, g.i), String(g.n), fmtSig(g.m), fmtSig(g.ss, 3)]),
              foot: ["Σ = SSw", "", "", fmtSig(prec.ssw, 4)],
            },
            note: `Each group is measured against its own mean, not the grand mean — that is what keeps ${groupLabel.toLowerCase()}-to-${groupLabel.toLowerCase()} drift out of this figure.`,
          },
          {
            title: `Pool them. Dividing by N − p = ${prec.N} − ${prec.p} = ${prec.dfw} gives the within-group mean square.`,
            formula: "MSw = SSw / (N − p)",
            work: [`MSw = ${fmtSig(prec.ssw, 4)} / ${prec.dfw} = ${fmtSig(prec.msw, 4)}`],
            note: `p degrees of freedom are spent estimating the p group means, leaving ${prec.dfw}. Pooling is why sr is better determined than the standard deviation of any single ${groupLabel.toLowerCase()}.`,
          },
          {
            title: "MSw is a variance, so take the square root.",
            formula: "sr = √MSw",
            work: [`sr = √${fmtSig(prec.msw, 4)} = ${fmtSig(prec.sr)} ${unit}`],
            highlightLast: true,
          },
        ],
        footer: `Eurachem §6.6: this is repeatability, the tightest of the three tiers. It does not tell you how the method behaves across days — that is sI.`,
      };
    }

    /* ──────────────────────────────── RSDr ──────────────────────────────── */
    case "rsdr": {
      const pass = prec.rsdR <= (L.rsdRMax ?? Infinity);
      return {
        title: "RSDr",
        subtitle: "repeatability, relative to the measured level",
        result: fmt(prec.rsdR, 2), unit: "%",
        why: `An absolute standard deviation cannot be judged without knowing the level it was measured at — ${fmtSig(prec.sr)} ${unit} is superb at one concentration and hopeless at another. Expressing it as a percentage of the grand mean makes it comparable across levels, methods and against the acceptance criterion.`,
        steps: [
          {
            title: "Take the two numbers already computed.",
            work: [
              `sr = ${fmtSig(prec.sr)} ${unit}`,
              `x̿  = ${fmtSig(prec.gm)} ${unit}`,
            ],
          },
          {
            title: "Express the scatter as a percentage of the level.",
            formula: "RSDr = sr / x̿ × 100",
            work: [`RSDr = ${fmtSig(prec.sr)} / ${fmtSig(prec.gm)} × 100 = ${fmt(prec.rsdR, 2)} %`],
            highlightLast: true,
          },
          {
            title: "Against your acceptance criterion:",
            work: [`${fmt(prec.rsdR, 2)} %  ${pass ? "≤" : ">"}  ${L.rsdRMax ?? "—"} %  →  ${pass ? "pass" : "fail"}`],
            note: "Set in Study Plan. RSD limits should rise as concentration falls — see the Horwitz benchmark below for what is realistic at this level.",
          },
        ],
        footer: "RSDr is only meaningful well above the LOQ; near the detection limit the relative scatter grows regardless of how good the method is.",
      };
    }

    /* ─────────────────── sI — intermediate precision ────────────────────── */
    case "sI": {
      const flat = prec.sBetween === 0;
      return {
        title: "sI (intermediate)",
        subtitle: "within-laboratory reproducibility",
        result: fmtSig(prec.sI), unit,
        why: `Real results are not produced back to back. Intermediate precision adds the ${groupLabel.toLowerCase()}-to-${groupLabel.toLowerCase()} variation on top of repeatability, answering the question that actually matters: how much would this result have differed if it had been run on a different ${groupLabel.toLowerCase()}? It is also the precision term that feeds the Uncertainty module.`,
        steps: [
          designStep(prec, groupLabel),
          {
            title: `Now measure how far each ${groupLabel.toLowerCase()} mean sits from the grand mean — this is the between-group signal.`,
            table: {
              head: [groupLabel, "nᵢ", "x̄ᵢ", "x̄ᵢ − x̿", "nᵢ(x̄ᵢ − x̿)²"],
              rows: gs.map((g) => [
                label(groupLabel, g.i), String(g.n), fmtSig(g.m),
                fmtSig(g.dev, 3), fmtSig(g.n * g.dev ** 2, 3),
              ]),
              foot: ["Σ = SSb", "", "", "", fmtSig(prec.ssb, 4)],
            },
          },
          {
            title: `Divide by p − 1 = ${prec.dfb} for the between-group mean square, and recall the within-group one.`,
            work: [
              `MSb = SSb / (p − 1) = ${fmtSig(prec.ssb, 4)} / ${prec.dfb} = ${fmtSig(prec.msb, 4)}`,
              `MSw = ${fmtSig(prec.msw, 4)}   (from the sr card)`,
            ],
          },
          {
            title: `MSb is not the ${groupLabel.toLowerCase()}-to-${groupLabel.toLowerCase()} variance on its own — group means scatter partly because of ordinary within-group noise. Subtract MSw to strip that out, then scale by the group size.`,
            formula: "s²between = ( MSb − MSw ) / n̄        (set to 0 if MSb ≤ MSw)",
            work: [
              `s²between = ( ${fmtSig(prec.msb, 4)} − ${fmtSig(prec.msw, 4)} ) / ${fmt(nBar, 3)} = ${fmtSig(varBetween, 4)}`,
              `s_between = ${fmtSig(prec.sBetween)} ${unit}`,
            ],
            note: flat
              ? `Here MSb ≤ MSw, so the estimate came out negative and is clamped to zero. That is not an error: the ${groupLabel.toLowerCase()}s are statistically indistinguishable — their means differ no more than ordinary repeatability noise would make them. The consequence is that sI comes out equal to sr.`
              : `A positive component means the ${groupLabel.toLowerCase()}s genuinely differ from one another by more than within-group noise explains.`,
          },
          {
            title: "The two sources are independent, so their variances add — not their standard deviations.",
            formula: "sI = √( sr² + s²between )",
            work: [
              `sI = √( ${fmtSig(prec.sr ** 2, 4)} + ${fmtSig(varBetween, 4)} ) = ${fmtSig(prec.sI)} ${unit}`,
            ],
            highlightLast: true,
          },
          {
            title: `Confirm with the F-test: is the between-${groupLabel.toLowerCase()} effect real?`,
            work: [
              `F = MSb / MSw = ${fmtSig(prec.msb, 4)} / ${fmtSig(prec.msw, 4)} = ${fmt(prec.f, 2)}`,
              `F crit (${prec.dfb}, ${prec.dfw}) at 5 % = ${fmt(prec.fCrit, 2)}`,
              `${fmt(prec.f, 2)} ${prec.f > prec.fCrit ? ">" : "≤"} ${fmt(prec.fCrit, 2)}  →  ${prec.f > prec.fCrit ? `significant between-${groupLabel.toLowerCase()} effect` : `no significant between-${groupLabel.toLowerCase()} effect`}`,
            ],
            note: prec.f > prec.fCrit
              ? `Worth chasing: something is changing between ${groupLabel.toLowerCase()}s — calibration, standards, or the instrument warming up.`
              : `Consistent with s_between = 0 above: sI ≈ sr, and this design cannot separate the two.`,
          },
        ],
        footer: `sI ≥ sr always. If they are equal, the study simply found no ${groupLabel.toLowerCase()}-to-${groupLabel.toLowerCase()} effect — widen the design (more ${groupLabel.toLowerCase()}s, more spread-out conditions) if you expected one.`,
      };
    }

    /* ──────────────────────────────── RSDI ──────────────────────────────── */
    case "rsdI": {
      const pass = prec.rsdI <= (L.rsdIMax ?? Infinity);
      return {
        title: "RSDI",
        subtitle: "intermediate precision, relative to the measured level",
        result: fmt(prec.rsdI, 2), unit: "%",
        why: `The same normalisation as RSDr, applied to the tier that reflects routine use. This is usually the number to quote when someone asks "how precise is the method?", because it includes the day-to-day variation a real sample would experience.`,
        steps: [
          {
            title: "Take the two numbers already computed.",
            work: [
              `sI = ${fmtSig(prec.sI)} ${unit}`,
              `x̿  = ${fmtSig(prec.gm)} ${unit}`,
            ],
          },
          {
            title: "Express the scatter as a percentage of the level.",
            formula: "RSDI = sI / x̿ × 100",
            work: [`RSDI = ${fmtSig(prec.sI)} / ${fmtSig(prec.gm)} × 100 = ${fmt(prec.rsdI, 2)} %`],
            highlightLast: true,
          },
          {
            title: "Against your acceptance criterion:",
            work: [`${fmt(prec.rsdI, 2)} %  ${pass ? "≤" : ">"}  ${L.rsdIMax ?? "—"} %  →  ${pass ? "pass" : "fail"}`],
            note: `Set in Study Plan. It should sit above the RSDr limit, since intermediate precision can only be worse than repeatability.`,
          },
          prec.sBetween === 0 && {
            title: "Why RSDI equals RSDr here:",
            note: `The between-${groupLabel.toLowerCase()} variance component came out at zero, so sI = sr and the two relative figures are identical. See the sI card for the detail.`,
          },
        ],
        footer: "This is the precision figure the Uncertainty module uses as u(P).",
      };
    }

    /* ───────────────────────── r limit (2.8 · sr) ───────────────────────── */
    case "rLimit": {
      return {
        title: "r limit",
        subtitle: "repeatability limit — the largest defensible difference between two results",
        result: fmtSig(prec.rLimit), unit,
        why: `A practical, bench-usable number: run the same sample twice under repeatability conditions, and 95 % of the time the two results will differ by less than r. If they differ by more, treat it as a signal that something went wrong rather than as bad luck — that is what makes this a duplicate-check criterion.`,
        steps: [
          {
            title: "Start from repeatability.",
            work: [`sr = ${fmtSig(prec.sr)} ${unit}`],
          },
          {
            title: "The difference between two independent results has its own scatter — larger than a single result's, because both results carry noise.",
            formula: "s(difference) = sr · √2",
            note: "Variances add when two independent quantities are subtracted, so the standard deviation grows by √2 ≈ 1.414.",
          },
          {
            title: "Take the 95 % two-sided limit on that difference.",
            formula: "r = 1.96 · √2 · sr  ≈  2.8 · sr",
            work: [
              `1.96 × √2 = ${fmt(1.96 * Math.SQRT2, 3)}  ≈ 2.8`,
              `r = 2.8 × ${fmtSig(prec.sr)} = ${fmtSig(prec.rLimit)} ${unit}`,
            ],
            highlightLast: true,
          },
          {
            title: "How to use it:",
            note: `Two results on the same sample, same ${groupLabel.toLowerCase()}, same analyst, differing by more than ${fmtSig(prec.rLimit)} ${unit} should be investigated and repeated. Results from different ${groupLabel.toLowerCase()}s should be judged against 2.8 · sI = ${fmtSig(2.8 * prec.sI)} ${unit} instead, which is the wider limit.`,
          },
        ],
        footer: "ISO 5725 calls this the repeatability limit r. The equivalent for different laboratories is the reproducibility limit R = 2.8 · sR.",
      };
    }

    /* ─────────────────────── Horwitz — predicted RSD_R ──────────────────── */
    case "hPRSD": {
      if (!H) return null;
      return {
        title: "Horwitz PRSD_R",
        subtitle: "reproducibility RSD the Horwitz curve predicts at this level",
        result: fmt(H.predRSDr, 2), unit: "%",
        why: `Reviewing thousands of collaborative trials, Horwitz found that between-laboratory precision depends almost entirely on the concentration being measured — not on the analyte, the matrix or the technique. The curve turns that observation into a benchmark: what precision should a competent laboratory achieve at this level?`,
        steps: [
          {
            title: "The only input is the analyte mass fraction, expressed as a dimensionless ratio.",
            work: [`C = ${fmtSig(H.C)}`],
            note: "1 % = 1e-2, 1 mg/kg (ppm) = 1e-6, 1 µg/kg (ppb) = 1e-9. Entered in the Horwitz panel; it must match the level actually under study.",
          },
          {
            title: "The Horwitz function:",
            formula: "PRSD_R = 2 · C^(−0.1505)",
            note: "The negative exponent is what makes precision worsen as concentration falls — roughly a doubling of RSD for every hundredfold drop in concentration.",
          },
          {
            title: "Substitute.",
            work: [
              `C^(−0.1505) = ${fmtSig(Math.pow(H.C, -0.1505), 4)}`,
              `PRSD_R = 2 × ${fmtSig(Math.pow(H.C, -0.1505), 4)} = ${fmt(H.predRSDr, 2)} %`,
            ],
            highlightLast: true,
          },
        ],
        footer: "The curve is unreliable at the extremes — below about 1e-9 (Thompson's modification applies) and above roughly 10 % mass fraction.",
      };
    }

    /* ──────────────────── Horwitz — predicted RSDr ──────────────────────── */
    case "hPredRSDr": {
      if (!H) return null;
      return {
        title: "Pred. RSDr",
        subtitle: "repeatability RSD expected at this level",
        result: fmt(H.predRSDrRep, 2), unit: "%",
        why: `The Horwitz curve predicts between-laboratory precision, but your study measured within-laboratory repeatability — the two are not comparable directly. Empirically, repeatability tends to land at roughly two-thirds of reproducibility, and that factor converts the benchmark into something your RSDr can be judged against.`,
        steps: [
          {
            title: "Start from the Horwitz prediction for reproducibility.",
            work: [`PRSD_R = ${fmt(H.predRSDr, 2)} %`],
          },
          {
            title: "Scale it down to repeatability conditions.",
            formula: "predicted RSDr = 0.66 · PRSD_R",
            note: "The 0.5–0.66 range is the usual rule of thumb; 0.66 is the conventional choice and the one used for HorRat_r.",
          },
          {
            title: "Substitute.",
            work: [`predicted RSDr = 0.66 × ${fmt(H.predRSDr, 2)} = ${fmt(H.predRSDrRep, 2)} %`],
            highlightLast: true,
          },
          {
            title: "Against what you actually measured:",
            work: [`measured RSDr = ${fmt(prec.rsdR, 2)} %   vs   predicted ${fmt(H.predRSDrRep, 2)} %`],
            note: "The ratio of these two is HorRat_r.",
          },
        ],
        footer: "This is a benchmark, not an acceptance criterion — your own requirement in Study Plan takes precedence.",
      };
    }

    /* ────────────────────────────── HorRat_r ────────────────────────────── */
    case "hHorRatr": {
      if (!H) return null;
      const v = H.horRatr;
      const ok = v >= 0.5 && v <= 2;
      return {
        title: "HorRat_r",
        subtitle: "measured repeatability ÷ Horwitz prediction",
        result: fmt(v, 2), unit: "",
        why: `A single dimensionless score for "is this precision normal for this concentration?". Around 1 means the method performs as the Horwitz curve expects. Much above 2 means it is unusually imprecise; well below 0.5 is suspiciously good and usually means the replicates were not truly independent.`,
        steps: [
          {
            title: "Take the measured and predicted repeatability RSDs.",
            work: [
              `measured RSDr  = ${fmt(prec.rsdR, 2)} %`,
              `predicted RSDr = 0.66 × PRSD_R = ${fmt(H.predRSDrRep, 2)} %`,
            ],
          },
          {
            title: "Divide.",
            formula: "HorRat_r = RSDr / ( 0.66 · PRSD_R )",
            work: [`HorRat_r = ${fmt(prec.rsdR, 2)} / ${fmt(H.predRSDrRep, 2)} = ${fmt(v, 2)}`],
            highlightLast: true,
          },
          {
            title: "Interpretation:",
            work: [`0.5 ≤ ${fmt(v, 2)} ≤ 2  →  ${ok ? "acceptable" : "outside the usual range"}`],
            note: ok
              ? "The method's repeatability is in line with what is normally achieved at this concentration."
              : v < 0.5
                ? "Better than the curve predicts. Check that the replicates were genuinely independent — repeat injections of one prepared sample will flatter repeatability, since they omit the sample-preparation variability."
                : "Worse than the curve predicts. Look for an uncontrolled step in the method before accepting this precision.",
          },
        ],
        footer: "HorRat is a sanity check on plausibility, not a pass/fail requirement in itself.",
      };
    }

    /* ──────────────────────── sR (measured, entered) ────────────────────── */
    case "hSR": {
      if (!H || H.sR == null) return null;
      return {
        title: "sR (measured)",
        subtitle: "inter-laboratory reproducibility — entered, not calculated",
        result: fmtSig(H.sR), unit,
        why: `Reproducibility cannot be derived from single-laboratory data, no matter how the design is arranged — it requires several laboratories measuring the same material. This value is one you typed in from a collaborative trial or proficiency-test report; the app only uses it, never estimates it.`,
        steps: [
          {
            title: "The value as entered in the Horwitz panel:",
            work: [`sR = ${fmtSig(H.sR)} ${unit}`],
            note: "Sources: an ISO 5725 collaborative trial, a published standard method's precision statement, or the between-laboratory SD from a proficiency scheme.",
          },
          {
            title: "What the app derives from it:",
            work: [
              `RSD_R = sR / x̿ × 100 = ${fmtSig(H.sR)} / ${fmtSig(prec.gm)} × 100 = ${fmt(H.rsdRepro, 2)} %`,
              `R limit = 2.8 × sR = ${fmtSig(H.reproLimit)} ${unit}`,
              `HorRat_R = RSD_R / PRSD_R = ${fmt(H.horRatR, 2)}`,
            ],
          },
          {
            title: "How it should compare with your own figures:",
            work: [
              `sr = ${fmtSig(prec.sr)} ${unit}   ≤   sI = ${fmtSig(prec.sI)} ${unit}   ≤   sR = ${fmtSig(H.sR)} ${unit}`,
            ],
            note: H.sR >= prec.sI
              ? "The expected ordering holds: reproducibility is the widest of the three tiers."
              : "Unexpected — a measured sR below your own intermediate precision suggests the entered value belongs to a different concentration level or material. Check the source.",
          },
        ],
        footer: "Leave this field empty if you have no collaborative-trial data; the rest of the Precision module works without it.",
      };
    }

    /* ─────────────────────────────── RSD_R ──────────────────────────────── */
    case "hRSDR": {
      if (!H || H.rsdRepro == null) return null;
      return {
        title: "RSD_R",
        subtitle: "reproducibility, relative to the measured level",
        result: fmt(H.rsdRepro, 2), unit: "%",
        why: `The entered reproducibility standard deviation, normalised against the level your own study was run at, so it can be compared with the Horwitz prediction and with your RSDr and RSDI.`,
        steps: [
          {
            title: "Take the entered sR and your grand mean.",
            work: [
              `sR = ${fmtSig(H.sR)} ${unit}`,
              `x̿  = ${fmtSig(prec.gm)} ${unit}`,
            ],
            note: "The grand mean comes from your data, so this figure is only meaningful if the collaborative trial was run at a comparable concentration.",
          },
          {
            title: "Express as a percentage.",
            formula: "RSD_R = sR / x̿ × 100",
            work: [`RSD_R = ${fmtSig(H.sR)} / ${fmtSig(prec.gm)} × 100 = ${fmt(H.rsdRepro, 2)} %`],
            highlightLast: true,
          },
          {
            title: "The three tiers side by side:",
            work: [
              `RSDr  = ${fmt(prec.rsdR, 2)} %   (repeatability, your lab)`,
              `RSDI  = ${fmt(prec.rsdI, 2)} %   (intermediate, your lab)`,
              `RSD_R = ${fmt(H.rsdRepro, 2)} %   (reproducibility, between labs)`,
            ],
          },
        ],
        footer: "Each tier should be no smaller than the one above it — that ordering is a useful check that the numbers belong together.",
      };
    }

    /* ────────────────────────────── HorRat_R ────────────────────────────── */
    case "hHorRatR": {
      if (!H || H.horRatR == null) return null;
      const v = H.horRatR;
      const ok = v >= 0.5 && v <= 2;
      return {
        title: "HorRat_R",
        subtitle: "measured reproducibility ÷ Horwitz prediction",
        result: fmt(v, 2), unit: "",
        why: `The original form of the HorRat ratio — measured against predicted reproducibility, with no 0.66 conversion needed because both sides describe between-laboratory precision. This is the stricter and more meaningful of the two HorRat figures where collaborative-trial data exists.`,
        steps: [
          {
            title: "Take the measured and predicted reproducibility RSDs.",
            work: [
              `measured RSD_R  = ${fmt(H.rsdRepro, 2)} %`,
              `predicted PRSD_R = ${fmt(H.predRSDr, 2)} %`,
            ],
          },
          {
            title: "Divide — no scaling factor, both are reproducibility figures.",
            formula: "HorRat_R = RSD_R / PRSD_R",
            work: [`HorRat_R = ${fmt(H.rsdRepro, 2)} / ${fmt(H.predRSDr, 2)} = ${fmt(v, 2)}`],
            highlightLast: true,
          },
          {
            title: "Interpretation:",
            work: [`0.5 ≤ ${fmt(v, 2)} ≤ 2  →  ${ok ? "acceptable" : "outside the usual range"}`],
            note: ok
              ? "The collaborative-trial precision is what the Horwitz curve expects at this concentration."
              : v < 0.5
                ? "Better than the curve predicts — unusual between laboratories. Verify the trial's design and that C matches the level tested."
                : "Worse than the curve predicts, which is the more common failure. AOAC generally treats HorRat_R above 2 as unacceptable for a collaborative study.",
          },
        ],
        footer: "This is the ratio AOAC uses when judging collaborative studies.",
      };
    }

    /* ───────────────────────── R limit (2.8 · sR) ───────────────────────── */
    case "hReproLimit": {
      if (!H || H.reproLimit == null) return null;
      return {
        title: "R limit",
        subtitle: "reproducibility limit — largest defensible difference between laboratories",
        result: fmtSig(H.reproLimit), unit,
        why: `The between-laboratory counterpart of the r limit. Two laboratories analysing the same material should agree to within R, 95 % of the time. It is the number to reach for when a client's result disagrees with yours and you need to say whether the gap is ordinary or not.`,
        steps: [
          {
            title: "Start from the entered reproducibility standard deviation.",
            work: [`sR = ${fmtSig(H.sR)} ${unit}`],
          },
          {
            title: "Same reasoning as the r limit: the difference of two independent results scatters by √2 more, then take the 95 % two-sided bound.",
            formula: "R = 1.96 · √2 · sR  ≈  2.8 · sR",
            work: [`R = 2.8 × ${fmtSig(H.sR)} = ${fmtSig(H.reproLimit)} ${unit}`],
            highlightLast: true,
          },
          {
            title: "The full ladder of critical differences:",
            work: [
              `r (same ${groupLabel.toLowerCase()}, same lab) = 2.8 × sr = ${fmtSig(prec.rLimit)} ${unit}`,
              `2.8 · sI (different ${groupLabel.toLowerCase()}s, same lab) = ${fmtSig(2.8 * prec.sI)} ${unit}`,
              `R (different labs) = ${fmtSig(H.reproLimit)} ${unit}`,
            ],
            note: "Judge any disagreement against the limit that matches the conditions the two results were produced under.",
          },
        ],
        footer: "ISO 5725-6 gives the full treatment of r and R as acceptability criteria for measurement results.",
      };
    }

    default:
      return null;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Fully controlled — `statKey` selects the explanation, `onClose` clears it.
   ══════════════════════════════════════════════════════════════════════════ */
export function PrecisionCalcDialog({ open, onClose, statKey, prec, unit, limits, groupLabel }) {
  const ex = open ? buildExplain(statKey, { prec, unit, limits, groupLabel }) : null;
  return <CalcDialogShell open={open} onClose={onClose} ex={ex} unit={unit} />;
}

export default PrecisionCalcDialog;

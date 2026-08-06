/* Smoke test for the calculation-walkthrough dialogs.
   Server-renders every stat card's modal so runtime errors (bad formatter
   arguments, undefined fields, missing guards) surface without a browser.
   Run: node scripts/smoke-calc-dialogs.mjs                                   */
import { renderToString } from "react-dom/server";
import React from "react";
import { StatCalcDialog } from "@/components/StatCalcDialog";
import { LinearityCalcDialog } from "@/components/LinearityCalcDialog";
import { PrecisionCalcDialog } from "@/components/PrecisionCalcDialog";
import { TruenessCalcDialog } from "@/components/TruenessCalcDialog";
import { ComparisonCalcDialog } from "@/components/ComparisonCalcDialog";
import { UncertaintyCalcDialog } from "@/components/UncertaintyCalcDialog";
import { RecoveryCalcDialog } from "@/components/RecoveryCalcDialog";
import { AnovaCalcDialog } from "@/components/AnovaCalcDialog";
import { RuggednessCalcDialog } from "@/components/RuggednessCalcDialog";
import { FtSummaryCalcDialog } from "@/components/FtSummaryCalcDialog";

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };

/* ── LOD/LOQ fixtures ──────────────────────────────────────────────────── */
const reps = [0.0007, 0.0008, 0.0006, 0.0007, 0.0006, 0.0009, 0.0007, 0.0006, 0.0008, 0.0007];
const s0 = sd(reps), s0p = s0 * Math.sqrt(1 / 1 + 1 / 10);
const lodBlank = { approach: "blank", nReps: 10, mean: mean(reps), s0, s0p, lod: 3 * s0p, loq: 10 * s0p, grubbs: null };
const lodCal = { approach: "calibration", slope: 2386, syx: 34.63, lod: 0.0479, loq: 0.1452 };
const spk = [0.011, 0.0125, 0.0098, 0.0132, 0.0107, 0.0119, 0.0128];
const blk = [0.0012, 0.0009, 0.0015, 0.0011, 0.0008, 0.0013, 0.001];
const mk = (v, t) => ({ n: v.length, sd: sd(v), mean: mean(v), t, value: t * sd(v) });
const lodEpa = {
  approach: "usepa",
  idl: { n: 7, sd: sd(spk), value: 3 * sd(spk), k: 3 },
  mdlSpiked: mk(spk, 2.998),
  mdlBlank: { ...mk(blk, 2.998), value: mean(blk) + 2.998 * sd(blk) },
  mdl: 0.0037, governed: "spiked", spikeLevel: 0.012, spikeRatio: 3.2,
};
const design = {
  reps, nI: 1, nB: 10, blankCorrected: true,
  idlReps: spk, mdlSpikedReps: spk, mdlBlankReps: blk, spikeLevel: 0.012,
};

/* ── Linearity fixture ─────────────────────────────────────────────────── */
const pts = [[0.5, [1210, 1198, 1225]], [1, [2410, 2455, 2398]], [2, [4820, 4790, 4855]],
             [5, [12010, 11950, 12100]], [10, [23900, 24100, 23850]], [20, [47600, 47900, 47750]]];
const lx = pts.map((p) => p[0]), ly = pts.map((p) => mean(p[1]));
const lmx = mean(lx), lmy = mean(ly);
let sxy = 0, sxx = 0;
lx.forEach((v, i) => { sxy += (v - lmx) * (ly[i] - lmy); sxx += (v - lmx) ** 2; });
const slope = sxy / sxx, intercept = lmy - slope * lmx;
const lrows = pts.map((p, i) => {
  const yPred = slope * p[0] + intercept, resid = ly[i] - yPred;
  return { conc: p[0], yObs: ly[i], yPred, resid, residPct: (resid / yPred) * 100, rf: ly[i] / p[0], repRSD: 1 };
});
const ssr = lrows.reduce((s, r) => s + r.resid ** 2, 0);
const syx = Math.sqrt(ssr / (lx.length - 2));
const lin = {
  n: 6, slope, intercept, r: 0.999999, r2: 0.999998, syx, sxx, mx: lmx,
  sSlope: syx / Math.sqrt(sxx), sIntercept: syx * Math.sqrt(1 / 6 + lmx ** 2 / sxx),
  rows: lrows, rfRSD: 0.58, interceptCI: 39.4, interceptSig: true,
  maxResidPct: Math.max(...lrows.map((r) => Math.abs(r.residPct))),
};
const levels = pts.map((p) => ({ conc: p[0], reps: p[1] }));

/* ── Precision fixture (the values from the Precision screenshot) ──────── */
const G = [[0.0502, 0.0498, 0.0504], [0.0497, 0.0501, 0.0499], [0.0503, 0.0499, 0.0501],
           [0.0498, 0.0496, 0.0502], [0.0501, 0.0504, 0.0499], [0.0497, 0.0502, 0.05],
           [0.0499, 0.0501, 0.0503], [0.0504, 0.05, 0.0498]];
const all = G.flat(), N = all.length, p = G.length, gm = mean(all);
let ssb = 0, ssw = 0;
G.forEach((g) => { const m = mean(g); ssb += g.length * (m - gm) ** 2; g.forEach((v) => (ssw += (v - m) ** 2)); });
const msb = ssb / (p - 1), msw = ssw / (N - p), sr = Math.sqrt(msw);
const sBetween = msb > msw ? Math.sqrt((msb - msw) / (N / p)) : 0;
const sI = Math.sqrt(sr ** 2 + sBetween ** 2);
const basePrec = {
  N, p, gm, ssb, ssw, dfb: p - 1, dfw: N - p, msb, msw, f: msb / msw, fCrit: 2.79,
  sr, sBetween, sI, groups: G, rsdR: (sr / gm) * 100, rsdI: (sI / gm) * 100,
  rLimit: 2.8 * sr, grubbs: { G: 1.8, crit: 2.4, outlierIdx: -1 },
};
const C = 5e-5, predRSDr = 2 * Math.pow(C, -0.1505), sRm = 0.0004;
const precFull = {
  ...basePrec,
  horwitz: {
    C, predRSDr, predRSDrRep: 0.66 * predRSDr,
    horRatR: ((sRm / gm) * 100) / predRSDr, horRatr: basePrec.rsdR / (0.66 * predRSDr),
    sR: sRm, rsdRepro: (sRm / gm) * 100, reproLimit: 2.8 * sRm,
  },
};
/* Between-group effect present, so the non-clamped sI branch is covered too. */
const Gv = [[0.050, 0.0501, 0.0499], [0.052, 0.0521, 0.0519], [0.048, 0.0481, 0.0479],
            [0.051, 0.0511, 0.0509], [0.049, 0.0491, 0.0489]];
const allv = Gv.flat(), Nv = allv.length, pv = Gv.length, gmv = mean(allv);
let ssbv = 0, sswv = 0;
Gv.forEach((g) => { const m = mean(g); ssbv += g.length * (m - gmv) ** 2; g.forEach((v) => (sswv += (v - m) ** 2)); });
const msbv = ssbv / (pv - 1), mswv = sswv / (Nv - pv), srv = Math.sqrt(mswv);
const sBetv = Math.sqrt((msbv - mswv) / (Nv / pv));
const sIv = Math.sqrt(srv ** 2 + sBetv ** 2);
const precVaried = {
  N: Nv, p: pv, gm: gmv, ssb: ssbv, ssw: sswv, dfb: pv - 1, dfw: Nv - pv, msb: msbv, msw: mswv,
  f: msbv / mswv, fCrit: 3.48, sr: srv, sBetween: sBetv, sI: sIv, groups: Gv,
  rsdR: (srv / gmv) * 100, rsdI: (sIv / gmv) * 100, rLimit: 2.8 * srv,
  grubbs: { G: 1.9, crit: 2.4, outlierIdx: 2, outlierVal: 0.052 }, horwitz: null,
};

/* ── Trueness fixtures ─────────────────────────────────────────────────── */
const tCrit95 = { 4: 2.776, 9: 2.262 };
/* CRM route — the values from the Trueness screenshot. */
const crmReps = [17.9, 18.1, 18.3, 17.8, 18.2, 17.7, 18, 17.9, 18.2, 18];
const crmRef = 18, crmU = 2;
const cMean = mean(crmReps), cSd = sd(crmReps), cSe = cSd / Math.sqrt(crmReps.length);
const cT = Math.abs((cMean - crmRef) / cSe);
const trueCrm = {
  mode: "crm", n: crmReps.length, mean: cMean, sd: cSd, se: cSe,
  bias: cMean - crmRef, biasPct: ((cMean - crmRef) / crmRef) * 100,
  recovery: (cMean / crmRef) * 100,
  t: cT, df: crmReps.length - 1, tCrit: tCrit95[9], significant: cT > tCrit95[9],
  grubbs: { G: 1.4, crit: 2.18, outlierIdx: -1 },
};
/* A CRM case that does show a significant bias, so that branch renders too. */
const crmBad = crmReps.map((v) => v + 1.2);
const bMean = mean(crmBad), bSe = sd(crmBad) / Math.sqrt(crmBad.length);
const trueCrmBias = {
  ...trueCrm, mean: bMean, sd: sd(crmBad), se: bSe,
  bias: bMean - crmRef, biasPct: ((bMean - crmRef) / crmRef) * 100,
  recovery: (bMean / crmRef) * 100,
  t: Math.abs((bMean - crmRef) / bSe), significant: true,
  grubbs: { G: 2.4, crit: 2.18, outlierIdx: 2, outlierVal: 19.5 },
};
/* Spike route — APHA/USEPA form. */
const uns = [1.9, 2.0, 1.85, 1.95, 2.05], spkd = [9.8, 9.9, 9.7, 10.0, 9.85];
const mu = mean(uns), ms = mean(spkd), amt = 8;
const varOf = (a) => { const m = mean(a); return a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1); };
const aphaSd = (Math.sqrt(varOf(spkd) / spkd.length + varOf(uns) / uns.length) / amt) * 100;
const aphaRec = ((ms - mu) / amt) * 100;
const trueApha = {
  mode: "spike", method: "apha", mu, ms, amt, recovery: aphaRec, sdRec: aphaSd,
  t: Math.abs(aphaRec - 100) / aphaSd, tCrit: tCrit95[4], df: 4,
  significant: Math.abs(aphaRec - 100) / aphaSd > tCrit95[4],
  bias: ms - mu - amt, biasPct: aphaRec - 100,
};
/* Spike route — volume-mixing form. */
const Vspl = 100, Vspk = 1, cSpk = 800, Vt = Vspl + Vspk;
const cExpected = (Vspl * mu + Vspk * cSpk) / Vt;
const spikeAdded = (Vspk * cSpk) / Vt, dilutedSample = (Vspl * mu) / Vt;
const volRec = ((ms - dilutedSample) / spikeAdded) * 100;
const volSd = (Math.sqrt(varOf(spkd) / spkd.length + (Vspl / Vt) ** 2 * (varOf(uns) / uns.length)) / spikeAdded) * 100;
const trueVol = {
  mode: "spike", method: "volume", mu, ms, Vspl, Vspk, cSpk, Vt,
  cExpected, spikeAdded, dilutedSample, recovery: volRec, recTotal: (ms / cExpected) * 100,
  sdRec: volSd, t: Math.abs(volRec - 100) / volSd, tCrit: tCrit95[4], df: 4,
  significant: Math.abs(volRec - 100) / volSd > tCrit95[4],
  bias: ms - cExpected, biasPct: volRec - 100,
};
const trueReps = { crmReps, unspiked: uns, spiked: spkd };
const recWindow = { recMin: 90, recMax: 110 };

/* ── F & t Tests fixtures ──────────────────────────────────────────────── */
const vOf = (a) => { const m = mean(a); return a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1); };
const fTest = (a, b) => {
  const va = vOf(a), vb = vOf(b), aLarger = va >= vb;
  return {
    va, vb, sa: Math.sqrt(va), sb: Math.sqrt(vb), aLarger,
    F: (aLarger ? va : vb) / (aLarger ? vb : va),
    df1: (aLarger ? a.length : b.length) - 1, df2: (aLarger ? b.length : a.length) - 1,
    fCrit: 9.6, significant: false,
  };
};
const tTest2 = (a, b, pooled) => {
  const n1 = a.length, n2 = b.length, m1 = mean(a), m2 = mean(b);
  const v1 = vOf(a), v2 = vOf(b), diff = m1 - m2;
  if (pooled) {
    const sp2 = ((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2), sp = Math.sqrt(sp2);
    const se = sp * Math.sqrt(1 / n1 + 1 / n2), t = Math.abs(diff) / se;
    return { pooled: true, n1, n2, m1, m2, v1, v2, diff, sp2, sp, se, df: n1 + n2 - 2, t, tCrit: 2.262, significant: t > 2.262 };
  }
  const se = Math.sqrt(v1 / n1 + v2 / n2);
  const df = (v1 / n1 + v2 / n2) ** 2 / ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1));
  const t = Math.abs(diff) / se;
  return { pooled: false, n1, n2, m1, m2, v1, v2, diff, se, df, t, tCrit: 2.31, significant: t > 2.31 };
};
/* The values from the F & t screenshot — pooled route. */
const setA = [18.1, 17.9, 18, 18.2, 17.8, 18], setB = [18, 18.2, 17.9, 18.1, 17.85];
const compTwo = { mode: "twoSample", a: setA, b: setB, f: fTest(setA, setB), tt: tTest2(setA, setB, true), pooled: true };
/* Unequal variances, so the Welch branch renders too. */
const setC = [18.1, 17.2, 18.9, 17.4, 18.8, 17.1];
const fUneq = { ...fTest(setC, setB), significant: true };
const compWelch = { mode: "twoSample", a: setC, b: setB, f: fUneq, tt: tTest2(setC, setB, false), pooled: false };
/* One-sample route. */
const oneSet = [18.1, 17.9, 18, 18.2, 17.8, 18], oneRef = 17.5;
const oMean = mean(oneSet), oSd = sd(oneSet), oSe = oSd / Math.sqrt(oneSet.length);
const oT = Math.abs((oMean - oneRef) / oSe);
const compOne = {
  mode: "oneSample", a: oneSet, ref: oneRef, sd: oSd, mean: oMean, se: oSe,
  t: oT, df: oneSet.length - 1, tCrit: 2.571, significant: oT > 2.571,
  bias: oMean - oneRef, biasPct: ((oMean - oneRef) / oneRef) * 100,
};
/* A zero reference disables the percentage card — must not divide by zero. */
const compOneZeroRef = { ...compOne, ref: 0, bias: oMean, biasPct: null };
const compLabels = { a: "Reference laboratory", b: "Our laboratory" };

/* ── Uncertainty fixtures ──────────────────────────────────────────────── */
const budget = (uPrec, uBias, gm) => {
  const uc = uBias !== null ? Math.sqrt(uPrec ** 2 + uBias ** 2) : uPrec;
  return { uPrec, uBias, uc, U: 2 * uc, UPct: ((2 * uc) / gm) * 100 };
};
/* CRM route, with the certificate's uncertainty dominating — the screenshot case. */
const muCrmBias = Math.sqrt((cSd / Math.sqrt(crmReps.length)) ** 2 + (crmU / 2) ** 2 + (cMean - crmRef) ** 2);
const muCrm = budget(basePrec.sI, muCrmBias, basePrec.gm);
/* CRM route with a tightly certified material, so the precision-dominated
   branch of the "where to spend effort" advice renders too. */
const muTight = budget(basePrec.sI, Math.sqrt((cSd / Math.sqrt(crmReps.length)) ** 2 + (0.02 / 2) ** 2 + 0.001 ** 2), basePrec.gm);
const trueTight = { ...trueCrm, bias: 0.001 };
/* Spike route — u(bias) is just |bias|. */
const muSpike = budget(basePrec.sI, Math.abs(trueApha.bias), basePrec.gm);
/* No trueness study at all — uc collapses to u(P). */
const muNoBias = budget(basePrec.sI, null, basePrec.gm);

/* ── Recovery fixtures — the levels from the Recovery screenshot ───────── */
const mkRecovery = (raw) => {
  const levels = raw
    .map(([conc, reps]) => ({ conc, reps }))
    .filter((lv) => lv.reps.length >= 2 && lv.conc);
  const rec = levels.map((lv) => {
    const m = mean(lv.reps);
    return { conc: lv.conc, n: lv.reps.length, mean: m, sd: sd(lv.reps), rsd: (sd(lv.reps) / m) * 100, recovery: (m / lv.conc) * 100 };
  });
  return { levels, rec };
};
const recThree = mkRecovery([
  [10, [9.6, 9.8, 10, 9.7, 10.1]],
  [18, [17.7, 18.1, 17.9, 18.2, 17.6]],
  [35, [34.4, 34.9, 35.2, 34.6, 35]],
]);
/* A single level (below the recommended three) and an over-recovering,
   out-of-window level, so those advice branches render too. */
const recOne = mkRecovery([[2, [1.6, 1.7, 1.55, 1.62]]]);
const recSix = mkRecovery([
  [1, [1.28, 1.31, 1.25, 1.3]], [5, [4.9, 5.05, 4.95, 5.1]], [10, [9.9, 10.1, 10, 9.95]],
  [20, [19.8, 20.2, 20, 19.9]], [50, [49.5, 50.4, 50, 49.8]], [100, [99, 101, 100.5, 99.5]],
]);
const recLimits = { recMin: 80, recMax: 120 };

/* ── run every card ────────────────────────────────────────────────────── */
const cases = [];
const add = (Cmp, name, keys, props) =>
  keys.forEach((k) => cases.push([`${name}/${k}`, Cmp, { ...props, statKey: k }]));

add(StatCalcDialog, "LOD·blank", ["mean", "s0", "s0p", "lod", "loq"],
  { lod: lodBlank, unit: "mg/kg", kQ: 10, design });
add(StatCalcDialog, "LOD·blank·uncorrected", ["s0p", "lod"],
  { lod: lodBlank, unit: "mg/kg", kQ: 10, design: { ...design, blankCorrected: false, nI: 3 } });
add(StatCalcDialog, "LOD·calibration", ["lod", "loq"], { lod: lodCal, unit: "mg/kg", kQ: 10, design: {} });
add(StatCalcDialog, "LOD·usepa", ["idl", "mdlSpiked", "mdlBlank", "mdl"],
  { lod: lodEpa, unit: "mg/kg", kQ: 10, design });
add(LinearityCalcDialog, "Linearity", ["slope", "intercept", "r2", "syx", "maxResid", "rfRSD"],
  { lin, unit: "mg/kg", levels, tCrit: 2.776, limits: { r2Min: 0.995, residPctMax: 5 } });
add(PrecisionCalcDialog, "Precision·clamped", ["gm", "sr", "rsdr", "sI", "rsdI", "rLimit"],
  { prec: precFull, unit: "mg/kg", groupLabel: "Day", limits: { rsdRMax: 5, rsdIMax: 7.5 } });
add(PrecisionCalcDialog, "Precision·horwitz",
  ["hPRSD", "hPredRSDr", "hHorRatr", "hSR", "hRSDR", "hHorRatR", "hReproLimit"],
  { prec: precFull, unit: "mg/kg", groupLabel: "Day", limits: { rsdRMax: 5, rsdIMax: 7.5 } });
add(PrecisionCalcDialog, "Precision·between-effect", ["gm", "sr", "rsdr", "sI", "rsdI", "rLimit"],
  { prec: precVaried, unit: "mg/kg", groupLabel: "Analyst", limits: { rsdRMax: 5, rsdIMax: 7.5 } });
add(TruenessCalcDialog, "Trueness·CRM", ["mean", "bias", "biasPct", "recovery", "t"],
  { trueness: trueCrm, unit: "mg/kg", refValue: crmRef, refU: crmU, reps: trueReps, limits: recWindow });
add(TruenessCalcDialog, "Trueness·CRM·biased", ["mean", "bias", "recovery", "t"],
  { trueness: trueCrmBias, unit: "mg/kg", refValue: crmRef, refU: crmU, reps: trueReps, limits: recWindow });
add(TruenessCalcDialog, "Trueness·CRM·noU", ["bias", "t"],
  { trueness: trueCrm, unit: "mg/kg", refValue: crmRef, refU: null, reps: trueReps, limits: {} });
add(TruenessCalcDialog, "Trueness·spike·apha", ["spikeRecovery", "uRec", "t"],
  { trueness: trueApha, unit: "mg/kg", reps: trueReps, limits: recWindow });
add(TruenessCalcDialog, "Trueness·spike·volume",
  ["cExpected", "spikeAdded", "recTotal", "spikeRecovery", "uRec", "t"],
  { trueness: trueVol, unit: "mg/kg", reps: trueReps, limits: recWindow });
/* Cards that belong to the other route must return the empty state, not throw. */
add(TruenessCalcDialog, "Trueness·wrong-route", ["cExpected", "uRec"],
  { trueness: trueCrm, unit: "mg/kg", refValue: crmRef, refU: crmU, reps: trueReps, limits: recWindow });
add(TruenessCalcDialog, "Trueness·apha-vol-only", ["cExpected", "recTotal"],
  { trueness: trueApha, unit: "mg/kg", reps: trueReps, limits: recWindow });
add(TruenessCalcDialog, "Trueness·nodata", ["mean", "t"], { trueness: null, unit: "mg/kg" });

add(ComparisonCalcDialog, "F&t·two·pooled", ["meanA", "meanB", "diff", "sA", "sB"],
  { comp: compTwo, unit: "mg/kg", labels: compLabels });
add(ComparisonCalcDialog, "F&t·two·welch", ["meanA", "diff", "sA", "sB"],
  { comp: compWelch, unit: "mg/kg", labels: compLabels });
add(ComparisonCalcDialog, "F&t·two·nolabels", ["meanA", "meanB", "diff"],
  { comp: compTwo, unit: "mg/kg" });
add(ComparisonCalcDialog, "F&t·one", ["mean", "ref", "bias", "biasPct", "t", "tCrit"],
  { comp: compOne, unit: "mg/kg" });
add(ComparisonCalcDialog, "F&t·one·zeroRef", ["ref", "bias", "biasPct"],
  { comp: compOneZeroRef, unit: "mg/kg" });
/* Cards belonging to the other mode must give the empty state, not throw. */
add(ComparisonCalcDialog, "F&t·wrong-mode", ["diff", "sA"], { comp: compOne, unit: "mg/kg" });
add(ComparisonCalcDialog, "F&t·wrong-mode-2", ["t", "tCrit", "ref"], { comp: compTwo, unit: "mg/kg", labels: compLabels });
add(ComparisonCalcDialog, "F&t·nodata", ["diff", "t"], { comp: null, unit: "mg/kg" });

const uKeys = ["uPrec", "uBias", "uc", "U", "UPct"];
add(UncertaintyCalcDialog, "Uncertainty·CRM", uKeys,
  { mu: muCrm, prec: basePrec, trueness: trueCrm, refU: crmU, unit: "mg/kg", groupLabel: "Day" });
add(UncertaintyCalcDialog, "Uncertainty·CRM·tight", uKeys,
  { mu: muTight, prec: basePrec, trueness: trueTight, refU: 0.02, unit: "mg/kg", groupLabel: "Day" });
add(UncertaintyCalcDialog, "Uncertainty·spike", uKeys,
  { mu: muSpike, prec: basePrec, trueness: trueApha, unit: "mg/kg", groupLabel: "Day" });
add(UncertaintyCalcDialog, "Uncertainty·noBias", uKeys,
  { mu: muNoBias, prec: basePrec, trueness: null, unit: "mg/kg", groupLabel: "Day" });
add(UncertaintyCalcDialog, "Uncertainty·between-effect", uKeys,
  { mu: budget(precVaried.sI, muCrmBias, precVaried.gm), prec: precVaried, trueness: trueCrm, refU: crmU, unit: "mg/kg", groupLabel: "Analyst" });
add(UncertaintyCalcDialog, "Uncertainty·nodata", ["uc", "U"], { mu: null, unit: "mg/kg" });

/* Recovery is keyed by row index rather than by a stat name — every row of
   every fixture must build, including the first and last. */
const addRows = (name, fx, limits) =>
  fx.rec.forEach((_, i) => cases.push([`${name}/row${i}`, RecoveryCalcDialog,
    { index: i, rec: fx.rec, levels: fx.levels, unit: "mg/kg", limits }]));
addRows("Recovery·3-level", recThree, recLimits);
addRows("Recovery·1-level", recOne, recLimits);
addRows("Recovery·6-level", recSix, recLimits);
addRows("Recovery·nolimits", recThree, {});
/* F & t Summary rows — keyed by which test, not by stat name. Both the pooled
   and Welch routes, and both verdicts, since the prose branches on each. */
const compDiffers = {
  ...compTwo,
  tt: { ...compTwo.tt, t: 4.2, significant: true },
  f: { ...compTwo.f, F: 12.3, significant: true },
};
const addFt = (name, comp) =>
  ["F", "t"].forEach((r) => cases.push([`${name}/${r}`, FtSummaryCalcDialog,
    { row: r, comp, unit: "mg/kg", labels: compLabels }]));
addFt("F&t·summary·pooled", compTwo);
addFt("F&t·summary·welch", compWelch);
addFt("F&t·summary·differs", compDiffers);
addFt("F&t·summary·nolabels", { ...compTwo });
cases.push(["F&t·summary·nodata/F", FtSummaryCalcDialog, { row: "F", comp: null, unit: "mg/kg" }]);
/* One-sample mode has no summary table — must give the empty state, not throw. */
cases.push(["F&t·summary·onesample/t", FtSummaryCalcDialog, { row: "t", comp: compOne, unit: "mg/kg" }]);
cases.push(["F&t·summary·badrow/z", FtSummaryCalcDialog, { row: "z", comp: compTwo, unit: "mg/kg", labels: compLabels }]);

/* Ruggedness factor rows — the factors from the Ruggedness screenshot. */
const rugNoise = { sr: basePrec.sr, dfw: basePrec.dfw, t: 2.12, nBar: basePrec.N / basePrec.p,
  value: (basePrec.sr * 2.12 * Math.SQRT2) / Math.sqrt(basePrec.N / basePrec.p) };
const mkRobust = (raw) => raw.map(([name, nominal, low, high, resLow, resHigh]) => {
  const effect = resHigh - resLow, mid = (resHigh + resLow) / 2;
  return { name, nominal, low, high, resLow, resHigh, effect,
    effectPct: mid !== 0 ? (effect / mid) * 100 : 0,
    srTest: Math.abs(effect) > rugNoise.value };
});
const rugThree = mkRobust([
  ["Cell temperature (°C)", "23", "18", "28", 17.9, 18.1],
  ["Stirring rate (rpm)", "300", "250", "350", 18.05, 17.95],
  ["Sample size (g)", "5", "3", "7", 18, 18.08],
]);
/* One factor well past the critical difference and outside tolerance, so the
   "must be controlled" / "distinguishable from noise" branches render. */
const rugBig = mkRobust([
  ["pH", "7.0", "6.5", "7.5", 16.2, 19.4],
  ["Flow (mL/min)", "1.0", "0.8", "1.2", 18.0, 18.02],
]);
const rugNoName = mkRobust([["", "1", "0", "2", 18, 18.3]]);
const rugLimits = { robustPctMax: 2 };
const addRug = (name, robust, opts) =>
  robust.forEach((_, i) => cases.push([`${name}/row${i}`, RuggednessCalcDialog,
    { index: i, robust, unit: "mg/kg", ...opts }]));
addRug("Ruggedness·3-factor", rugThree, { limits: rugLimits, noise: rugNoise });
addRug("Ruggedness·significant", rugBig, { limits: rugLimits, noise: rugNoise });
addRug("Ruggedness·noname", rugNoName, { limits: rugLimits, noise: rugNoise });
/* No Precision module yet, so the "vs sr" comparison is unavailable. */
addRug("Ruggedness·noPrec", rugThree, { limits: rugLimits, noise: null });
addRug("Ruggedness·nolimits", rugThree, { limits: {}, noise: rugNoise });
[99, -1].forEach((i) => cases.push([`Ruggedness·badindex/row${i}`, RuggednessCalcDialog,
  { index: i, robust: rugThree, unit: "mg/kg", limits: rugLimits, noise: rugNoise }]));
cases.push(["Ruggedness·nodata/row0", RuggednessCalcDialog, { index: 0, robust: null, unit: "mg/kg" }]);

/* ANOVA table rows — keyed by source of variation rather than by stat name.
   Both the clamped fixture (F < 1) and the real-effect one (F > F crit) are
   covered, since the verdict prose branches on that. */
const addAnova = (name, prec, groupLabel) =>
  ["between", "within"].forEach((r) => cases.push([`${name}/${r}`, AnovaCalcDialog,
    { row: r, prec, unit: "mg/kg", groupLabel }]));
addAnova("ANOVA·clamped", basePrec, "Day");
addAnova("ANOVA·between-effect", { ...precVaried, f: 900, fCrit: 3.48 }, "Analyst");
addAnova("ANOVA·nolabel", basePrec, undefined);
cases.push(["ANOVA·nodata/between", AnovaCalcDialog, { row: "between", prec: null, unit: "mg/kg" }]);
cases.push(["ANOVA·badrow/total", AnovaCalcDialog, { row: "total", prec: basePrec, unit: "mg/kg" }]);

/* Out-of-range and missing indices must give the empty state, not throw. */
[99, -1].forEach((i) => cases.push([`Recovery·badindex/row${i}`, RecoveryCalcDialog,
  { index: i, rec: recThree.rec, levels: recThree.levels, unit: "mg/kg", limits: recLimits }]));
cases.push(["Recovery·nodata/row0", RecoveryCalcDialog, { index: 0, rec: null, levels: null, unit: "mg/kg" }]);

/* Empty / missing data must render the empty state, not throw. */
add(StatCalcDialog, "LOD·nodata", ["mean", "s0"], { lod: null, unit: "mg/kg", kQ: 10, design: {} });
add(LinearityCalcDialog, "Linearity·nodata", ["slope"], { lin: null, unit: "mg/kg" });
add(PrecisionCalcDialog, "Precision·nodata", ["gm", "hSR"], { prec: null, unit: "mg/kg" });
add(PrecisionCalcDialog, "Precision·noHorwitz", ["hPRSD", "hHorRatr"],
  { prec: basePrec, unit: "mg/kg", groupLabel: "Day", limits: {} });

let pass = 0;
const failures = [];
for (const [name, Cmp, props] of cases) {
  try {
    const html = renderToString(React.createElement(Cmp, { open: true, onClose: () => {}, ...props }));
    // Whole words only, so prose is not mistaken for a broken value. By
    // convention the explanation text never uses the bare tokens "NaN" or
    // "undefined" — seeing either means a formatter was handed something bad.
    const bad = html.match(/\b(NaN|undefined)\b/);
    if (bad) {
      failures.push(`${name}: rendered "${bad[1]}" into the output`);
    } else pass++;
  } catch (e) {
    failures.push(`${name}: ${e.message}`);
  }
}
console.log(`${pass}/${cases.length} card modals rendered cleanly`);
if (failures.length) {
  console.log("\nFAILURES:");
  failures.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}

import { useMemo, useState, useEffect } from "react";
import {
  Document, Page, View, Text, Svg, Rect, Line, Circle, Polyline, G,
  StyleSheet, PDFViewer, pdf,
} from "@react-pdf/renderer";
import {
  X, Printer, Download, Loader2, FileText, BarChart3, Table as TableIcon, Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/* ─────────────────────────────────────────────────────────────
   PDF report builder for LabValidate Pro.
   Uses @react-pdf/renderer (the React templating layer built on
   @react-pdf/pdfkit) so the report is a real, selectable/printable
   PDF rather than a screenshot of the page.
   ───────────────────────────────────────────────────────────── */

/* Formatting — kept identical to the app so numbers match the on-screen report. */
const fmt = (v, d = 4) => (v === null || v === undefined || isNaN(v) ? "—" : (+v).toFixed(d));
const sig = (v, d = 4) => (v === null || v === undefined || isNaN(v) ? "—" : (+v).toPrecision(d));
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
};

/* Print-friendly palette (always light; matches the app's brand teal). */
const K = {
  ink: "#14201f", muted: "#5b6b70", faint: "#8a969a", line: "#d8dee0",
  primary: "#0d7c6f", violet: "#7c3aed",
  pass: "#059669", fail: "#dc2626", warn: "#d97706",
  panel: "#f4f7f7", passBg: "#ecfdf5", warnBg: "#fffbeb",
};
const statusMeta = {
  pass: { label: "Pass", color: K.pass }, fail: { label: "Fail", color: K.fail },
  warn: { label: "Review", color: K.warn }, pending: { label: "Pending", color: K.faint },
};

const s = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 46, paddingHorizontal: 40, fontFamily: "Helvetica", fontSize: 9, color: K.ink },
  brandRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  brand: { fontSize: 13, fontFamily: "Helvetica-Bold", color: K.primary },
  brandSub: { fontSize: 7.5, color: K.muted, fontFamily: "Helvetica" },
  rule: { borderBottomWidth: 1.2, borderBottomColor: K.primary, marginTop: 4, marginBottom: 12 },

  banner: { borderWidth: 1, borderRadius: 5, padding: 10, marginBottom: 14 },
  bannerTitle: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  bannerSub: { fontSize: 7.5, color: K.muted, marginTop: 3, lineHeight: 1.35 },

  h2: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 2, marginTop: 6 },
  metaLine: { fontSize: 8, color: K.muted, fontFamily: "Courier", marginBottom: 10 },

  sectionTitle: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: K.primary, marginTop: 14, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 },

  th: { flexDirection: "row", backgroundColor: K.panel, borderTopWidth: 1, borderBottomWidth: 1, borderColor: K.line },
  thc: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: K.muted, paddingVertical: 5, paddingHorizontal: 6, textTransform: "uppercase", letterSpacing: 0.3 },
  tr: { flexDirection: "row", borderBottomWidth: 0.6, borderBottomColor: K.line },
  td: { fontSize: 8.5, paddingVertical: 4.5, paddingHorizontal: 6 },
  tdMono: { fontFamily: "Courier" },

  para: { fontSize: 9, lineHeight: 1.5, marginTop: 10 },
  bold: { fontFamily: "Helvetica-Bold" },
  ital: { fontFamily: "Helvetica-Oblique" },

  signRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 26, gap: 18 },
  signCol: { flex: 1 },
  signLabel: { fontSize: 7, color: K.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 24 },
  signLine: { borderTopWidth: 0.8, borderTopColor: K.faint, paddingTop: 4 },
  signName: { fontSize: 8, color: K.muted },

  chartWrap: { marginTop: 8, marginBottom: 4 },
  chartTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", color: K.muted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.3 },
  chartsRow: { flexDirection: "row", gap: 12 },

  footer: { position: "absolute", bottom: 22, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.6, borderTopColor: K.line, paddingTop: 6 },
  footerTxt: { fontSize: 7, color: K.faint },
});

/* ── Generic table ─────────────────────────────────────────── */
function Table({ columns, rows }) {
  return (
    <View>
      <View style={s.th}>
        {columns.map((c, i) => (
          <Text key={i} style={[s.thc, { width: c.width, textAlign: c.align || "left" }]}>{c.header}</Text>
        ))}
      </View>
      {rows.map((r, ri) => (
        <View key={ri} style={s.tr} wrap={false}>
          {columns.map((c, ci) => {
            const cell = r[ci];
            const val = typeof cell === "object" && cell !== null ? cell.v : cell;
            const color = typeof cell === "object" && cell !== null ? cell.color : undefined;
            return (
              <Text key={ci} style={[s.td, c.mono && s.tdMono, { width: c.width, textAlign: c.align || "left", color }]}>
                {val}
              </Text>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/* ── Chart primitives (drawn from the same data as the app) ──── */
const CW = 238, CH = 150, PAD = { l: 34, r: 10, t: 10, b: 22 };
const scaler = (min, max, a, b) => {
  if (min === max) { min -= 1; max += 1; }
  return (v) => a + ((v - min) / (max - min)) * (b - a);
};
const Axes = ({ xLabel }) => (
  <>
    <Line x1={PAD.l} y1={CH - PAD.b} x2={CW - PAD.r} y2={CH - PAD.b} stroke={K.line} strokeWidth={1} />
    <Line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={CH - PAD.b} stroke={K.line} strokeWidth={1} />
    {xLabel ? <Text x={(PAD.l + CW - PAD.r) / 2} y={CH - 4} style={{ fontSize: 6.5 }} fill={K.muted} textAnchor="middle">{xLabel}</Text> : null}
  </>
);
const tick = (x, y, txt, anchor = "middle") => (
  <Text x={x} y={y} style={{ fontSize: 6 }} fill={K.faint} textAnchor={anchor}>{txt}</Text>
);

function ChartBox({ title, children }) {
  return (
    <View style={s.chartWrap}>
      <Text style={s.chartTitle}>{title}</Text>
      <Svg width={CW} height={CH}>{children}</Svg>
    </View>
  );
}

function CalibrationChart({ lin, unit }) {
  const xs = lin.rows.map((r) => r.conc);
  const ys = lin.rows.flatMap((r) => [r.yObs, r.yPred]);
  const sx = scaler(Math.min(...xs), Math.max(...xs), PAD.l, CW - PAD.r);
  const sy = scaler(Math.min(...ys), Math.max(...ys), CH - PAD.b, PAD.t);
  const fitPts = [...lin.rows].sort((a, b) => a.conc - b.conc).map((r) => `${sx(r.conc)},${sy(r.yPred)}`).join(" ");
  return (
    <ChartBox title={`Calibration curve (${unit || "conc"})`}>
      <Axes xLabel={`Conc (${unit})`} />
      {tick(PAD.l - 2, sy(Math.max(...ys)), sig(Math.max(...ys), 3), "end")}
      {tick(PAD.l - 2, sy(Math.min(...ys)), sig(Math.min(...ys), 3), "end")}
      {tick(sx(Math.min(...xs)), CH - PAD.b + 8, fmt(Math.min(...xs), 2))}
      {tick(sx(Math.max(...xs)), CH - PAD.b + 8, fmt(Math.max(...xs), 2))}
      <Polyline points={fitPts} stroke={K.primary} strokeWidth={1.4} fill="none" />
      {lin.rows.map((r, i) => <Circle key={i} cx={sx(r.conc)} cy={sy(r.yObs)} r={2.4} fill={K.violet} />)}
    </ChartBox>
  );
}

function ResidualChart({ lin, cr }) {
  const xs = lin.rows.map((r) => r.conc);
  const lim = +cr.residPctMax;
  const maxAbs = Math.max(lim * 1.3, ...lin.rows.map((r) => Math.abs(r.residPct)));
  const sx = scaler(Math.min(...xs), Math.max(...xs), PAD.l, CW - PAD.r);
  const sy = scaler(-maxAbs, maxAbs, CH - PAD.b, PAD.t);
  return (
    <ChartBox title="Residual plot (%)">
      <Axes xLabel="Conc" />
      <Line x1={PAD.l} y1={sy(0)} x2={CW - PAD.r} y2={sy(0)} stroke={K.faint} strokeWidth={0.6} />
      <Line x1={PAD.l} y1={sy(lim)} x2={CW - PAD.r} y2={sy(lim)} stroke={K.warn} strokeWidth={0.7} strokeDasharray="3 2" />
      <Line x1={PAD.l} y1={sy(-lim)} x2={CW - PAD.r} y2={sy(-lim)} stroke={K.warn} strokeWidth={0.7} strokeDasharray="3 2" />
      {tick(PAD.l - 2, sy(lim), `+${fmt(lim, 1)}`, "end")}
      {tick(PAD.l - 2, sy(-lim), `-${fmt(lim, 1)}`, "end")}
      {lin.rows.map((r, i) => (
        <Circle key={i} cx={sx(r.conc)} cy={sy(r.residPct)} r={2.4}
          fill={Math.abs(r.residPct) > lim ? K.fail : K.primary} />
      ))}
    </ChartBox>
  );
}

function BarChartSvg({ title, bars, refValue, band, unit, valueFmt = (v) => fmt(v, 1) }) {
  // bars: [{ label, value, color }]
  const vals = bars.map((b) => b.value);
  const lo = Math.min(0, ...vals, band ? band[0] : Infinity);
  const hi = Math.max(...vals, band ? band[1] : -Infinity, refValue ?? -Infinity);
  const pad = (hi - lo) * 0.12 || 1;
  const sy = scaler(lo - pad, hi + pad, CH - PAD.b, PAD.t);
  const n = bars.length;
  const slot = (CW - PAD.r - PAD.l) / n;
  const bw = Math.min(28, slot * 0.6);
  return (
    <ChartBox title={title}>
      <Axes />
      {band ? <Rect x={PAD.l} y={sy(band[1])} width={CW - PAD.r - PAD.l} height={Math.max(0, sy(band[0]) - sy(band[1]))} fill={K.passBg} /> : null}
      <Line x1={PAD.l} y1={sy(0)} x2={CW - PAD.r} y2={sy(0)} stroke={K.line} strokeWidth={0.8} />
      {refValue != null ? <Line x1={PAD.l} y1={sy(refValue)} x2={CW - PAD.r} y2={sy(refValue)} stroke={K.primary} strokeWidth={0.7} strokeDasharray="3 2" /> : null}
      {tick(PAD.l - 2, sy(hi), valueFmt(hi), "end")}
      {tick(PAD.l - 2, sy(lo < 0 ? lo : 0), valueFmt(lo < 0 ? lo : 0), "end")}
      {bars.map((b, i) => {
        const cx = PAD.l + slot * i + slot / 2;
        const y0 = sy(0), y1 = sy(b.value);
        return (
          <G key={i}>
            <Rect x={cx - bw / 2} y={Math.min(y0, y1)} width={bw} height={Math.abs(y1 - y0)} fill={b.color || K.primary} />
            {b.sd ? <Line x1={cx} y1={sy(b.value - b.sd)} x2={cx} y2={sy(b.value + b.sd)} stroke={K.ink} strokeWidth={0.7} /> : null}
            <Text x={cx} y={CH - PAD.b + 8} style={{ fontSize: 6 }} fill={K.muted} textAnchor="middle">{b.label}</Text>
            <Text x={cx} y={Math.min(y0, y1) - 2} style={{ fontSize: 6 }} fill={K.muted} textAnchor="middle">{valueFmt(b.value)}</Text>
          </G>
        );
      })}
    </ChartBox>
  );
}

function HBarChart({ title, bars, limit }) {
  // horizontal bars centred on 0: [{ label, value, color }]
  const vals = bars.map((b) => Math.abs(b.value));
  const maxAbs = Math.max(limit * 1.3, ...vals) || 1;
  const sx = scaler(-maxAbs, maxAbs, PAD.l, CW - PAD.r);
  const n = bars.length;
  const slot = (CH - PAD.t - PAD.b) / n;
  const bh = Math.min(16, slot * 0.55);
  const x0 = sx(0);
  return (
    <ChartBox title={title}>
      <Line x1={x0} y1={PAD.t} x2={x0} y2={CH - PAD.b} stroke={K.line} strokeWidth={0.8} />
      <Line x1={sx(limit)} y1={PAD.t} x2={sx(limit)} y2={CH - PAD.b} stroke={K.warn} strokeWidth={0.7} strokeDasharray="3 2" />
      <Line x1={sx(-limit)} y1={PAD.t} x2={sx(-limit)} y2={CH - PAD.b} stroke={K.warn} strokeWidth={0.7} strokeDasharray="3 2" />
      {tick(sx(limit), CH - PAD.b + 8, `±${fmt(limit, 1)}%`)}
      {bars.map((b, i) => {
        const cy = PAD.t + slot * i + slot / 2;
        const xe = sx(b.value);
        return (
          <G key={i}>
            <Rect x={Math.min(x0, xe)} y={cy - bh / 2} width={Math.abs(xe - x0)} height={bh} fill={b.color || K.primary} />
            <Text x={PAD.l - 2} y={cy + 2} style={{ fontSize: 5.8 }} fill={K.muted} textAnchor="end">{(b.label || "").slice(0, 14)}</Text>
          </G>
        );
      })}
    </ChartBox>
  );
}

/* ── Detailed section content builders ─────────────────────── */
function DetailSection({ id, view, data }) {
  const { study, lin, lod, prec, trueness, comp, rec, robust, mu, unit, cr } = data;
  const wantTable = view === "table" || view === "both";
  const wantChart = view === "chart" || view === "both";

  const titleMap = {
    selectivity: "Selectivity", linearity: "Linearity & Range", lodloq: "LOD / LOQ",
    trueness: "Trueness / Bias", precision: "Precision", comparison: "F & t Tests",
    recovery: "Recovery", robustness: "Ruggedness", uncertainty: "Measurement Uncertainty",
  };

  let table = null, charts = null;

  if (id === "selectivity") {
    const list = study.selectivity.interferents.filter((i) => i.name);
    table = (
      <>
        <Table
          columns={[
            { header: "Interferent / matrix effect", width: "40%" },
            { header: "Level tested", width: "26%" },
            { header: "Effect %", width: "17%", mono: true, align: "right" },
            { header: "Acceptable", width: "17%", align: "center" },
          ]}
          rows={list.map((i) => [
            i.name, i.level || "—",
            i.effectPct === "" || i.effectPct == null ? "—" : fmt(i.effectPct, 2),
            { v: i.acceptable ? "Yes" : "No", color: i.acceptable ? K.pass : K.fail },
          ])}
        />
        {study.selectivity.notes ? <Text style={s.para}>{study.selectivity.notes}</Text> : null}
      </>
    );
  }

  if (id === "linearity" && lin) {
    table = (
      <Table
        columns={[
          { header: "Conc", width: "15%", mono: true }, { header: "Mean y", width: "16%", mono: true, align: "right" },
          { header: "Predicted", width: "16%", mono: true, align: "right" }, { header: "Residual", width: "15%", mono: true, align: "right" },
          { header: "Resid %", width: "13%", mono: true, align: "right" }, { header: "Resp. factor", width: "13%", mono: true, align: "right" },
          { header: "Rep RSD %", width: "12%", mono: true, align: "right" },
        ]}
        rows={lin.rows.map((r) => [
          fmt(r.conc, 3), sig(r.yObs), sig(r.yPred), sig(r.resid, 3),
          { v: fmt(r.residPct, 2), color: Math.abs(r.residPct) > +cr.residPctMax ? K.fail : undefined },
          r.rf !== null ? sig(r.rf) : "—", r.repRSD !== null ? fmt(r.repRSD, 2) : "—",
        ])}
      />
    );
    charts = (
      <View style={s.chartsRow}>
        <CalibrationChart lin={lin} unit={unit} />
        <ResidualChart lin={lin} cr={cr} />
      </View>
    );
  }

  if (id === "lodloq" && lod) {
    let rows;
    if (lod.approach === "usepa") {
      rows = [
        lod.idl && ["IDL (instrument)", `${sig(lod.idl.value)} ${unit}`, `k=${lod.idl.k}, n=${lod.idl.n}, SD=${sig(lod.idl.sd)}`],
        lod.mdlSpiked && ["MDL — spiked", `${sig(lod.mdlSpiked.value)} ${unit}`, `n=${lod.mdlSpiked.n}, t=${fmt(lod.mdlSpiked.t, 3)}`],
        lod.mdlBlank && ["MDL — blank", `${sig(lod.mdlBlank.value)} ${unit}`, `n=${lod.mdlBlank.n}, mean=${sig(lod.mdlBlank.mean)}`],
        ["MDL (reported)", `${sig(lod.mdl)} ${unit}`, `governed by ${lod.governed} estimate`],
      ].filter(Boolean);
    } else if (lod.approach === "calibration") {
      rows = [
        ["LOD = 3.3·Sy/x / b", `${sig(lod.lod)} ${unit}`, `Sy/x=${sig(lod.syx)}, slope=${sig(lod.slope)}`],
        ["LOQ = 10·Sy/x / b", `${sig(lod.loq)} ${unit}`, "calibration approach"],
      ];
    } else {
      rows = [
        ["LOD = 3·s0'", `${sig(lod.lod)} ${unit}`, `n=${lod.nReps}, s0=${sig(lod.s0)}`],
        ["LOQ = 10·s0'", `${sig(lod.loq)} ${unit}`, `mean=${sig(lod.mean)}`],
      ];
    }
    table = (
      <Table
        columns={[{ header: "Parameter", width: "34%" }, { header: "Value", width: "28%", mono: true }, { header: "Basis", width: "38%", mono: true }]}
        rows={rows}
      />
    );
  }

  if (id === "trueness" && trueness) {
    const rows = trueness.mode === "crm"
      ? [
          ["Mean measured", `${sig(trueness.mean)} ${unit}`], ["Reference (CRM)", `${sig(trueness.mean - trueness.bias)} ${unit}`],
          ["Bias", `${fmt(trueness.bias, 4)} ${unit} (${fmt(trueness.biasPct, 2)} %)`],
          ["Recovery", `${fmt(trueness.recovery, 1)} %`],
          ["t (vs reference)", `${fmt(trueness.t, 3)} (crit ${fmt(trueness.tCrit, 3)})`],
          ["Significance", { v: trueness.significant ? "Bias significant" : "Not significant", color: trueness.significant ? K.fail : K.pass }],
        ]
      : [
          ["Spike recovery", `${fmt(trueness.recovery, 1)} %`], ["Bias", `${fmt(trueness.biasPct, 2)} %`],
          ["t statistic", `${fmt(trueness.t, 3)} (crit ${fmt(trueness.tCrit, 3)})`],
          ["Significance", { v: trueness.significant ? "Bias significant" : "Not significant", color: trueness.significant ? K.fail : K.pass }],
        ];
    table = (
      <Table columns={[{ header: "Parameter", width: "45%" }, { header: "Value", width: "55%", mono: true }]} rows={rows} />
    );
  }

  if (id === "precision" && prec) {
    table = (
      <Table
        columns={[
          { header: "Source", width: "34%" }, { header: "SS", width: "17%", mono: true, align: "right" },
          { header: "df", width: "11%", mono: true, align: "right" }, { header: "MS", width: "18%", mono: true, align: "right" },
          { header: "F", width: "10%", mono: true, align: "right" }, { header: "F crit", width: "10%", mono: true, align: "right" },
        ]}
        rows={[
          ["Between-group", sig(prec.ssb), String(prec.dfb), sig(prec.msb), fmt(prec.f, 2), fmt(prec.fCrit, 2)],
          ["Within-group", sig(prec.ssw), String(prec.dfw), sig(prec.msw), "", ""],
          [{ v: "RSDr / RSDI", color: K.muted }, { v: `${fmt(prec.rsdR, 2)} %`, color: K.ink }, "", { v: `${fmt(prec.rsdI, 2)} %`, color: K.ink }, "", ""],
        ]}
      />
    );
    const bars = prec.groups.map((g, i) => ({ label: `G${i + 1}`, value: mean(g), sd: sd(g), color: K.primary }));
    charts = <BarChartSvg title="Group means ± SD" bars={bars} refValue={prec.gm} unit={unit} valueFmt={(v) => sig(v, 3)} />;
  }

  if (id === "comparison" && comp) {
    const rows = comp.mode === "twoSample"
      ? [
          ["F-test (variances)", `F = ${fmt(comp.f.F, 2)} (crit ${fmt(comp.f.fCrit, 2)})`, { v: comp.f.significant ? "Variances differ" : "Comparable", color: comp.f.significant ? K.warn : K.pass }],
          [`t-test (${comp.pooled ? "pooled" : "Welch"})`, `t = ${fmt(comp.tt.t, 2)} (crit ${fmt(comp.tt.tCrit, 2)})`, { v: comp.tt.significant ? "Means differ" : "No difference", color: comp.tt.significant ? K.warn : K.pass }],
        ]
      : [
          ["t-test vs reference", `t = ${fmt(comp.t, 2)} (crit ${fmt(comp.tCrit, 2)})`, { v: comp.significant ? "Differs" : "Consistent", color: comp.significant ? K.warn : K.pass }],
        ];
    table = (
      <Table columns={[{ header: "Test", width: "34%" }, { header: "Statistic", width: "38%", mono: true }, { header: "Conclusion", width: "28%" }]} rows={rows} />
    );
  }

  if (id === "recovery" && rec.length) {
    table = (
      <Table
        columns={[
          { header: "Conc", width: "22%", mono: true }, { header: "n", width: "10%", mono: true, align: "right" },
          { header: "Mean", width: "22%", mono: true, align: "right" }, { header: "RSD %", width: "18%", mono: true, align: "right" },
          { header: "Recovery %", width: "28%", mono: true, align: "right" },
        ]}
        rows={rec.map((r) => [
          fmt(r.conc, 3), String(r.n), sig(r.mean), fmt(r.rsd, 2),
          { v: fmt(r.recovery, 1), color: r.recovery >= +cr.recMin && r.recovery <= +cr.recMax ? K.pass : K.fail },
        ])}
      />
    );
    const bars = rec.map((r) => ({
      label: fmt(r.conc, 2), value: r.recovery,
      color: r.recovery >= +cr.recMin && r.recovery <= +cr.recMax ? K.primary : K.fail,
    }));
    charts = <BarChartSvg title="Recovery by level (%)" bars={bars} refValue={100} band={[+cr.recMin, +cr.recMax]} valueFmt={(v) => fmt(v, 0)} />;
  }

  if (id === "robustness" && robust.length) {
    table = (
      <Table
        columns={[
          { header: "Factor", width: "38%" }, { header: "Effect", width: "20%", mono: true, align: "right" },
          { header: "Effect %", width: "20%", mono: true, align: "right" }, { header: "Status", width: "22%", align: "center" },
        ]}
        rows={robust.map((r) => [
          r.name || "—", sig(r.effect, 3), fmt(r.effectPct, 2),
          { v: Math.abs(r.effectPct) <= +cr.robustPctMax ? "OK" : "Review", color: Math.abs(r.effectPct) <= +cr.robustPctMax ? K.pass : K.warn },
        ])}
      />
    );
    const bars = robust.map((r) => ({
      label: r.name, value: r.effectPct,
      color: Math.abs(r.effectPct) <= +cr.robustPctMax ? K.primary : K.warn,
    }));
    charts = <HBarChart title="Effect magnitude (%)" bars={bars} limit={+cr.robustPctMax} />;
  }

  if (id === "uncertainty" && mu) {
    table = (
      <Table
        columns={[{ header: "Component", width: "40%" }, { header: "u", width: "30%", mono: true, align: "right" }, { header: "u² share", width: "30%", mono: true, align: "right" }]}
        rows={[
          ["Precision u(P)", sig(mu.uPrec), fmt((mu.uPrec ** 2 / mu.uc ** 2) * 100, 1) + " %"],
          ["Bias u(bias)", mu.uBias !== null ? sig(mu.uBias) : "—", mu.uBias !== null ? fmt((mu.uBias ** 2 / mu.uc ** 2) * 100, 1) + " %" : "—"],
          [{ v: "Combined uc", color: K.ink }, { v: sig(mu.uc), color: K.ink }, "100 %"],
          [{ v: "Expanded U (k=2)", color: K.primary }, { v: `${sig(mu.U)} (${fmt(mu.UPct, 1)} %)`, color: K.primary }, ""],
        ]}
      />
    );
  }

  if (!table && !charts) return null;

  return (
    <View break={false} wrap>
      <Text style={s.sectionTitle}>{titleMap[id]}</Text>
      {wantChart && charts}
      {wantTable && table}
    </View>
  );
}

/* ── The document ──────────────────────────────────────────── */
export function ReportDocument({ data, config }) {
  const { study, unit, isVerification, summaryRows, fit } = data;
  const info = study.info;
  const metaLine = [info.id, info.analyte, info.matrix, info.technique, info.range && `Range: ${info.range}`].filter(Boolean).join("  ·  ");

  return (
    <Document title={`${info.title || "Method validation"} — report`} author={info.analyst || "LabValidate Pro"}>
      <Page size="A4" style={s.page} wrap>
        {/* Header */}
        <View style={s.brandRow} fixed>
          <Text style={s.brand}>LabValidate <Text style={{ color: K.ink }}>Pro</Text></Text>
          <Text style={s.brandSub}>EURACHEM 3rd Ed. 2025  ·  ISO/IEC 17025:2017</Text>
        </View>
        <View style={s.rule} fixed />

        {/* Fitness banner */}
        {config.banner && (
          <View style={[s.banner, { borderColor: fit ? K.pass : K.warn, backgroundColor: fit ? K.passBg : K.warnBg }]}>
            <Text style={[s.bannerTitle, { color: fit ? K.pass : K.warn }]}>
              {fit ? "METHOD IS FIT FOR ITS INTENDED PURPOSE" : "REVIEW REQUIRED — not all criteria met or completed"}
            </Text>
            <Text style={s.bannerSub}>
              Evaluated per Eurachem "The Fitness for Purpose of Analytical Methods" 3rd Ed. (2025), Planning &amp; Blanks supplements, and ISO/IEC 17025:2017 §7.2.2.
            </Text>
          </View>
        )}

        {/* Title + meta */}
        <Text style={s.h2}>
          {isVerification ? "Method Verification" : "Method Validation"} Summary — {info.title || "[method title]"}
        </Text>
        <Text style={s.metaLine}>{metaLine || "Complete the Study Plan module"}</Text>

        {/* Summary table */}
        {config.summary && (
          <>
            <Text style={s.sectionTitle}>Performance summary</Text>
            <Table
              columns={[
                { header: "Performance characteristic", width: "34%" },
                { header: "Result", width: "26%", mono: true },
                { header: "Criterion", width: "26%" },
                { header: "Status", width: "14%", align: "center" },
              ]}
              rows={summaryRows.map((r) => {
                const m = statusMeta[r[1]] || statusMeta.pending;
                return [r[0], r[2], r[3], { v: m.label, color: m.color }];
              })}
            />
          </>
        )}

        {/* Detailed sections */}
        {config.order.map((id) => {
          const sec = config.sections[id];
          if (!sec || !sec.on) return null;
          return <DetailSection key={id} id={id} view={sec.view} data={data} />;
        })}

        {/* Conclusion */}
        {config.conclusion && (
          <Text style={s.para}>
            The method <Text style={s.bold}>{info.title || "[title]"}</Text> for the determination of{" "}
            <Text style={s.bold}>{info.analyte || "[analyte]"}</Text> in <Text style={s.bold}>{info.matrix || "[matrix]"}</Text> by{" "}
            {info.technique || "[technique]"} has been {isVerification ? "verified" : "validated"} against the analytical requirement:{" "}
            <Text style={s.ital}>{info.requirement || "[not defined]"}</Text>.{" "}
            {fit
              ? "All evaluated performance characteristics meet the stated acceptance criteria; the method is deemed fit for its intended purpose within the stated scope."
              : "One or more performance characteristics are pending or outside the acceptance criteria; the method is not yet demonstrated fit for purpose."}
          </Text>
        )}

        {/* Signatures */}
        {config.signatures && (
          <View style={s.signRow} wrap={false}>
            {[["Performed by", info.analyst], ["Reviewed by", info.reviewer], ["Approved by", ""]].map(([label, name], i) => (
              <View key={i} style={s.signCol}>
                <Text style={s.signLabel}>{label}</Text>
                <View style={s.signLine}>
                  <Text style={s.signName}>Name: {name || "_______________"}</Text>
                  <Text style={[s.signName, { marginTop: 3 }]}>Date: _______________</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={s.footer} fixed>
          <Text style={s.footerTxt}>{info.title || "Method validation report"}</Text>
          <Text style={s.footerTxt} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

/* ── Build the summary rows (mirrors the app's ReportModule) ─── */
function buildSummaryRows(d) {
  const { study, lin, lod, prec, trueness, comp, rec, robust, mu, status, cr, unit } = d;
  const rows = [
    ["Selectivity", status.selectivity, `${study.selectivity.interferents.filter((i) => i.name).length} interferents assessed`, "No unacceptable interference"],
    ["Linearity (R²)", status.linearity, lin ? fmt(lin.r2, 5) : "—", `≥ ${cr.r2Min}`],
    ["Max residual", status.linearity, lin ? fmt(lin.maxResidPct, 2) + " %" : "—", `≤ ${cr.residPctMax} %`],
    ...(lod && lod.approach === "usepa"
      ? [
          ["IDL (USEPA)", status.lodloq, lod.idl ? `${sig(lod.idl.value)} ${unit}` : "—", "Determined (instrument)"],
          ["MDL (USEPA 40 CFR 136)", status.lodloq, lod.mdl != null ? `${sig(lod.mdl)} ${unit}` : "—", "Determined (whole method)"],
        ]
      : [
          ["LOD", status.lodloq, lod ? `${sig(lod.lod)} ${unit}` : "—", "Determined"],
          ["LOQ", status.lodloq, lod ? `${sig(lod.loq)} ${unit}` : "—", "Determined & verified"],
        ]),
    ["Bias", status.trueness, trueness ? fmt(trueness.biasPct, 2) + " %" : "—", "Not significant (t-test, 95 %)"],
    ["RSDr (repeatability)", status.precision, prec ? fmt(prec.rsdR, 2) + " %" : "—", `≤ ${cr.rsdRMax} %`],
    ["RSDI (intermediate)", status.precision, prec ? fmt(prec.rsdI, 2) + " %" : "—", `≤ ${cr.rsdIMax} %`],
    ...(prec?.horwitz?.horRatr != null
      ? [["HorRat", status.precision, `${fmt(prec.horwitz.horRatr, 2)}${prec.horwitz.horRatR != null ? ` / ${fmt(prec.horwitz.horRatR, 2)}` : ""}`, "0.5–2.0"]]
      : []),
    ...(comp?.mode === "twoSample"
      ? [
          ["F-test (variances)", status.comparison, `F = ${fmt(comp.f.F, 2)} (crit ${fmt(comp.f.fCrit, 2)})`, comp.f.significant ? "Variances differ" : "Variances comparable"],
          [`t-test (${comp.pooled ? "pooled" : "Welch"})`, status.comparison, `t = ${fmt(comp.tt.t, 2)} (crit ${fmt(comp.tt.tCrit, 2)})`, comp.tt.significant ? "Means differ (95 %)" : "No significant difference"],
        ]
      : comp?.mode === "oneSample"
      ? [["t-test vs reference", status.comparison, `t = ${fmt(comp.t, 2)} (crit ${fmt(comp.tCrit, 2)})`, comp.significant ? "Differs from reference" : "Consistent with reference"]]
      : []),
    ["Recovery", status.recovery, rec.length ? rec.map((r) => fmt(r.recovery, 1)).join(" / ") + " %" : "—", `${cr.recMin}–${cr.recMax} %`],
    ["Ruggedness", status.robustness, robust.length ? robust.length + " factors" : "—", `Effects ≤ ${cr.robustPctMax} %`],
    ["Uncertainty U", status.uncertainty, mu ? `${sig(mu.U)} ${unit} (${fmt(mu.UPct, 1)} %)` : "—", "Estimated (k = 2)"],
  ];
  return rows;
}

/* ── Section availability (only offer what has data) ─────────── */
function availability(d) {
  return {
    selectivity: d.study.selectivity.interferents.some((i) => i.name),
    linearity: !!d.lin, lodloq: !!d.lod, trueness: !!d.trueness,
    precision: !!d.prec, comparison: !!d.comp, recovery: d.rec.length > 0,
    robustness: d.robust.length > 0, uncertainty: !!d.mu,
  };
}
const SECTION_META = [
  { id: "selectivity", label: "Selectivity", chart: false },
  { id: "linearity", label: "Linearity & Range", chart: true },
  { id: "lodloq", label: "LOD / LOQ", chart: false },
  { id: "trueness", label: "Trueness / Bias", chart: false },
  { id: "precision", label: "Precision", chart: true },
  { id: "comparison", label: "F & t Tests", chart: false },
  { id: "recovery", label: "Recovery", chart: true },
  { id: "robustness", label: "Ruggedness", chart: true },
  { id: "uncertainty", label: "Uncertainty", chart: false },
];

/* ── The dialog ────────────────────────────────────────────── */
export function PdfReportDialog({ open, onClose, data }) {
  const prepared = useMemo(() => {
    if (!data) return null;
    return { ...data, summaryRows: buildSummaryRows(data), fit: data.corePass && data.coreDone === 5 };
  }, [data]);

  const avail = useMemo(() => (data ? availability(data) : {}), [data]);

  const [config, setConfig] = useState(null);
  const [busy, setBusy] = useState(false);

  // Initialise config when the dialog opens.
  useEffect(() => {
    if (!open || !data) return;
    const sections = {};
    SECTION_META.forEach((m) => {
      sections[m.id] = { on: !!avail[m.id], view: m.chart ? "both" : "table" };
    });
    setConfig({
      banner: true, summary: true, conclusion: true, signatures: true,
      order: SECTION_META.map((m) => m.id),
      sections,
    });
  }, [open, data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !prepared || !config) return null;

  const setCore = (key) => setConfig((c) => ({ ...c, [key]: !c[key] }));
  const toggleSection = (id) => setConfig((c) => ({ ...c, sections: { ...c.sections, [id]: { ...c.sections[id], on: !c.sections[id].on } } }));
  const setView = (id, view) => setConfig((c) => ({ ...c, sections: { ...c.sections, [id]: { ...c.sections[id], on: true, view } } }));

  const fileName = `${prepared.study.info.id || "validation"}-report.pdf`;
  const docEl = <ReportDocument data={prepared} config={config} />;

  const download = async () => {
    setBusy(true);
    try {
      const blob = await pdf(docEl).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = fileName; a.click();
      URL.revokeObjectURL(url);
    } finally { setBusy(false); }
  };

  const print = async () => {
    setBusy(true);
    try {
      const blob = await pdf(docEl).toBlob();
      const url = URL.createObjectURL(blob);
      const frame = document.createElement("iframe");
      frame.style.position = "fixed"; frame.style.right = "0"; frame.style.bottom = "0";
      frame.style.width = "0"; frame.style.height = "0"; frame.style.border = "0";
      frame.src = url;
      frame.onload = () => { try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch { /* popup/print blocked */ } };
      document.body.appendChild(frame);
      // Clean up after the print dialog has had time to open.
      setTimeout(() => { document.body.removeChild(frame); URL.revokeObjectURL(url); }, 60000);
    } finally { setBusy(false); }
  };

  const coreItems = [
    { key: "banner", label: "Fitness-for-purpose banner" },
    { key: "summary", label: "Performance summary table" },
    { key: "conclusion", label: "Conclusion statement" },
    { key: "signatures", label: "Signature block" },
  ];

  return (
    <div className="lvp-no-print fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-5" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <div className="text-sm font-semibold">Build report — choose what to include</div>
          </div>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {/* Left: section picker */}
          <div className="w-full shrink-0 overflow-y-auto border-b border-border p-4 md:w-[320px] md:border-b-0 md:border-r">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Report core</div>
            <div className="space-y-1.5">
              {coreItems.map((it) => (
                <label key={it.key} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-muted">
                  <input type="checkbox" checked={config[it.key]} onChange={() => setCore(it.key)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
                  <span>{it.label}</span>
                </label>
              ))}
            </div>

            <div className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Detailed sections</div>
            <div className="space-y-1.5">
              {SECTION_META.map((m) => {
                const isAvail = !!avail[m.id];
                const sec = config.sections[m.id];
                return (
                  <div key={m.id} className={`rounded-lg border px-2.5 py-2 ${sec.on ? "border-primary/40 bg-primary/5" : "border-border"} ${!isAvail ? "opacity-40" : ""}`}>
                    <label className={`flex items-center gap-2 text-[13px] ${isAvail ? "cursor-pointer" : "cursor-not-allowed"}`}>
                      <input type="checkbox" disabled={!isAvail} checked={sec.on} onChange={() => toggleSection(m.id)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
                      <span className="flex-1">{m.label}</span>
                      {!isAvail && <span className="text-[10px] text-muted-foreground">no data</span>}
                    </label>
                    {m.chart && sec.on && (
                      <div className="mt-2 flex gap-1 pl-6">
                        {[
                          { v: "table", label: "Table", icon: TableIcon },
                          { v: "chart", label: "Graph", icon: BarChart3 },
                          { v: "both", label: "Both", icon: Layers },
                        ].map((opt) => {
                          const active = sec.view === opt.v;
                          return (
                            <button key={opt.v} type="button" onClick={() => setView(m.id, opt.v)}
                              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors ${
                                active ? "border-primary bg-primary/15 text-primary font-medium" : "border-border text-muted-foreground hover:bg-muted"}`}>
                              <opt.icon className="h-3 w-3" />{opt.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: live preview */}
          <div className="min-h-0 flex-1 bg-muted/40 p-3">
            <PDFViewer key={JSON.stringify(config)} showToolbar={false} style={{ width: "100%", height: "100%", border: "none", borderRadius: 8, background: "white" }}>
              {docEl}
            </PDFViewer>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
          <div className="text-[11px] text-muted-foreground">Preview updates as you change selections · generated with @react-pdf</div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button variant="outline" size="sm" onClick={print} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Printer className="h-4 w-4 mr-1.5" />}Print
            </Button>
            <Button size="sm" onClick={download} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />}Download PDF
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

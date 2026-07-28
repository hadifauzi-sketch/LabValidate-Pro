import { useMemo, useState, useEffect } from "react";
import {
  Document, Page, View, Text as RawText, Image, Svg, Rect, Line, Circle, Polyline, Polygon, G,
  StyleSheet, PDFViewer, pdf,
} from "@react-pdf/renderer";
import {
  X, Printer, Download, Loader2, FileText, BarChart3, Table as TableIcon, Layers, ImagePlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/* ─────────────────────────────────────────────────────────────
   Universal-font text safety.
   The report is drawn with the PDF base-14 fonts (Helvetica / Courier).
   Those are mandated by the PDF spec to exist in every viewer, so the
   file renders identically on any computer/browser with no embedded
   font and no network fetch — the most portable choice there is. Their
   catch is that they only cover the WinAnsi character set, so anything
   outside it (Greek mu in "µg/L", ≤ / ≥, the x̄ combining bar…) prints as
   a broken box. winAnsi() maps every such glyph to a WinAnsi-safe form —
   a look-alike where one exists (μ → micro sign µ) or plain ASCII
   (≤ → "<=") — and the Text wrapper below runs it over ALL text, both the
   template's own labels and user-entered data (units, analyte, matrix,
   the acceptance-requirement sentence), so nothing can slip through. */
const CHAR_MAP = {
  "μ": "µ", // μ Greek small mu  → µ micro sign (identical glyph, WinAnsi)
  "≤": "<=",     // ≤ less-than-or-equal
  "≥": ">=",     // ≥ greater-than-or-equal
  "≪": "<<",     // ≪ much-less-than
  "≫": ">>",     // ≫ much-greater-than
  "≠": "!=",     // ≠ not equal
  "≈": "~",      // ≈ approximately
  "≡": "=",      // ≡ identical to
  "−": "-",      // − minus sign → hyphen-minus
  "⁄": "/",      // ⁄ fraction slash
  "√": "sqrt",   // √ square root
  "∞": "inf",    // ∞ infinity
  "∑": "sum",    // ∑ n-ary summation
  "∏": "prod",   // ∏ n-ary product
  "∂": "d",      // ∂ partial differential
  "Δ": "delta", "α": "alpha", "β": "beta", "γ": "gamma",
  "δ": "delta", "ε": "epsilon", "θ": "theta", "λ": "lambda",
  "π": "pi", "σ": "sigma", "τ": "tau", "φ": "phi",
  "ω": "omega", "Ω": "ohm",
};
const winAnsi = (input) => {
  if (input == null) return input;
  let out = "";
  for (const ch of String(input).normalize("NFC")) out += CHAR_MAP[ch] ?? ch;
  // Drop any leftover combining marks / overlines the base fonts can't place
  // (e.g. x̄ = x + U+0304). Precomposed accents like "é" survived NFC above.
  return out.replace(/[̀-ͯ‾]/g, "");
};
const sanitizeChildren = (c) => {
  if (typeof c === "string") return winAnsi(c);
  if (typeof c === "number") return winAnsi(String(c));
  if (Array.isArray(c)) return c.map(sanitizeChildren);
  return c; // React elements (incl. nested Text) self-sanitize; null/false pass through
};
/* Drop-in replacement for @react-pdf's <Text>: same props, but every string it
   renders is made WinAnsi-safe first. Used for page text and SVG chart labels. */
function Text({ children, ...props }) {
  return <RawText {...props}>{sanitizeChildren(children)}</RawText>;
}

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

/* Log-gamma (Lanczos) + F-distribution density — mirrors the app so the PDF
   draws the same F-test reference curve. */
const lgamma = (z) => {
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < 9; i++) x += c[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
};
const fPdf = (x, d1, d2) => {
  if (x <= 0) return 0;
  const lnB = lgamma(d1 / 2) + lgamma(d2 / 2) - lgamma((d1 + d2) / 2);
  const lnNum = (d1 / 2) * Math.log(d1 / d2) + (d1 / 2 - 1) * Math.log(x)
    - ((d1 + d2) / 2) * Math.log(1 + (d1 / d2) * x);
  return Math.exp(lnNum - lnB);
};
/* Two-tailed 95 % Student-t critical value (interpolated) — matches the app;
   used for the ruggedness repeatability critical difference. */
const tCrit95 = (df) => {
  const T = [[1, 12.706], [2, 4.303], [3, 3.182], [4, 2.776], [5, 2.571], [6, 2.447], [7, 2.365], [8, 2.306], [9, 2.262], [10, 2.228], [12, 2.179], [14, 2.145], [16, 2.120], [18, 2.101], [20, 2.086], [25, 2.060], [30, 2.042], [40, 2.021], [60, 2.000], [120, 1.980], [1e9, 1.960]];
  if (df <= 1) return 12.706;
  for (let i = 0; i < T.length - 1; i++) {
    const [d1, t1] = T[i], [d2, t2] = T[i + 1];
    if (df === d1) return t1;
    if (df > d1 && df <= d2) return t1 + ((df - d1) / (d2 - d1)) * (t2 - t1);
  }
  return 1.96;
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
  brandLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, paddingRight: 10 },
  brandRight: { alignItems: "flex-end" },
  brand: { fontSize: 13, fontFamily: "Helvetica-Bold", color: K.primary },
  brandTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", color: K.ink, marginTop: 1 },
  brandSub: { fontSize: 7.5, color: K.muted, fontFamily: "Helvetica" },
  docControl: { fontSize: 7.5, color: K.muted, fontFamily: "Courier", marginTop: 2 },
  logo: { height: 30, maxWidth: 140, objectFit: "contain" },
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
  signLabel: { fontSize: 7, color: K.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 },
  signName: { fontSize: 8, color: K.muted },
  signField: { fontSize: 8, color: K.muted, borderBottomWidth: 0.8, borderBottomColor: K.faint, marginTop: 12, paddingBottom: 3 },
  signSignature: { fontSize: 8, color: K.muted, borderBottomWidth: 0.8, borderBottomColor: K.faint, marginTop: 14, paddingBottom: 3 },

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
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  // 95 % confidence band of the fitted line, on a fine grid.
  const hasBand = Number.isFinite(lin.syx) && Number.isFinite(lin.sxx) && lin.sxx > 0 && lin.n > 2;
  const t = hasBand ? tCrit95(lin.n - 2) : 0;
  const seAt = (x) => lin.syx * Math.sqrt(1 / lin.n + (x - lin.mx) ** 2 / lin.sxx);
  const G = 40, grid = [];
  for (let i = 0; i <= G; i++) { const x = xMin + ((xMax - xMin) * i) / G; const fit = lin.slope * x + lin.intercept; const half = hasBand ? t * seAt(x) : 0; grid.push({ x, fit, lo: fit - half, hi: fit + half }); }
  const ys = [...lin.rows.flatMap((r) => [r.yObs, r.yPred]), ...grid.flatMap((g) => [g.lo, g.hi])];
  const sx = scaler(xMin, xMax, PAD.l, CW - PAD.r);
  const sy = scaler(Math.min(...ys), Math.max(...ys), CH - PAD.b, PAD.t);
  const fitPts = grid.map((g) => `${sx(g.x)},${sy(g.fit)}`).join(" ");
  const bandPoly = grid.map((g) => `${sx(g.x)},${sy(g.hi)}`).join(" ") + " " + [...grid].reverse().map((g) => `${sx(g.x)},${sy(g.lo)}`).join(" ");
  return (
    <ChartBox title={`Calibration · 95% band (${unit || "conc"})`}>
      <Axes xLabel={`Conc (${unit})`} />
      {tick(PAD.l - 2, sy(Math.max(...ys)), sig(Math.max(...ys), 3), "end")}
      {tick(PAD.l - 2, sy(Math.min(...ys)), sig(Math.min(...ys), 3), "end")}
      {tick(sx(xMin), CH - PAD.b + 8, fmt(xMin, 2))}
      {tick(sx(xMax), CH - PAD.b + 8, fmt(xMax, 2))}
      {hasBand ? <Polygon points={bandPoly} fill={K.primary} fillOpacity={0.13} stroke="none" /> : null}
      <Polyline points={fitPts} stroke={K.primary} strokeWidth={1.4} fill="none" />
      {lin.rows.map((r, i) => <Circle key={i} cx={sx(r.conc)} cy={sy(r.yObs)} r={2.4} fill={K.violet} />)}
    </ChartBox>
  );
}

/* Response-factor (sensitivity) plot: signal/conc vs conc — flat within the
   band ⇒ constant sensitivity ⇒ linear; a trend means R² is masking curvature. */
function RfChart({ lin, cr }) {
  const rows = lin.rows.filter((r) => r.rf !== null);
  if (!rows.length) return null;
  const meanRF = rows.reduce((sm, r) => sm + r.rf, 0) / rows.length;
  const tol = meanRF * (+cr.residPctMax) / 100;
  const xs = rows.map((r) => r.conc), rfs = rows.map((r) => r.rf);
  const yLo = Math.min(meanRF - tol, ...rfs), yHi = Math.max(meanRF + tol, ...rfs);
  const pad = (yHi - yLo) * 0.15 || Math.abs(meanRF) * 0.05 || 1;
  const sx = scaler(Math.min(...xs), Math.max(...xs), PAD.l, CW - PAD.r);
  const sy = scaler(yLo - pad, yHi + pad, CH - PAD.b, PAD.t);
  return (
    <ChartBox title="Response factor (sensitivity)">
      <Axes xLabel="Conc" />
      <Rect x={PAD.l} y={sy(meanRF + tol)} width={CW - PAD.r - PAD.l} height={Math.max(0, sy(meanRF - tol) - sy(meanRF + tol))} fill={K.primary} fillOpacity={0.08} />
      <Line x1={PAD.l} y1={sy(meanRF)} x2={CW - PAD.r} y2={sy(meanRF)} stroke={K.pass} strokeWidth={0.7} strokeDasharray="3 2" />
      {tick(PAD.l - 2, sy(meanRF), sig(meanRF, 3), "end")}
      {rows.map((r, i) => <Circle key={i} cx={sx(r.conc)} cy={sy(r.rf)} r={2.4} fill={Math.abs(r.rf - meanRF) <= tol ? K.primary : K.warn} />)}
    </ChartBox>
  );
}

/* Back-calculated accuracy: each level read back off the curve, % deviation
   from nominal — the analyst-facing counterpart to the residual plot. */
function AccuracyChart({ lin, cr }) {
  const lim = +cr.residPctMax;
  const rows = lin.rows.map((r) => {
    const back = lin.slope !== 0 ? (r.yObs - lin.intercept) / lin.slope : null;
    return { conc: r.conc, devPct: back !== null && r.conc !== 0 ? ((back - r.conc) / r.conc) * 100 : null };
  }).filter((r) => r.devPct !== null);
  if (!rows.length) return null;
  const xs = rows.map((r) => r.conc);
  const maxAbs = Math.max(lim * 1.3, ...rows.map((r) => Math.abs(r.devPct)));
  const sx = scaler(Math.min(...xs), Math.max(...xs), PAD.l, CW - PAD.r);
  const sy = scaler(-maxAbs, maxAbs, CH - PAD.b, PAD.t);
  return (
    <ChartBox title="Back-calculated accuracy (%)">
      <Axes xLabel="Conc" />
      <Line x1={PAD.l} y1={sy(0)} x2={CW - PAD.r} y2={sy(0)} stroke={K.faint} strokeWidth={0.6} />
      <Line x1={PAD.l} y1={sy(lim)} x2={CW - PAD.r} y2={sy(lim)} stroke={K.warn} strokeWidth={0.7} strokeDasharray="3 2" />
      <Line x1={PAD.l} y1={sy(-lim)} x2={CW - PAD.r} y2={sy(-lim)} stroke={K.warn} strokeWidth={0.7} strokeDasharray="3 2" />
      {tick(PAD.l - 2, sy(lim), `+${fmt(lim, 1)}`, "end")}
      {tick(PAD.l - 2, sy(-lim), `-${fmt(lim, 1)}`, "end")}
      {rows.map((r, i) => <Circle key={i} cx={sx(r.conc)} cy={sy(r.devPct)} r={2.4} fill={Math.abs(r.devPct) > lim ? K.fail : K.primary} />)}
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
  // Wide left gutter so factor names (e.g. "Pyrolysis temperature (°C)") aren't clipped.
  const LGUT = 96;
  const vals = bars.map((b) => Math.abs(b.value));
  const maxAbs = Math.max(limit * 1.3, ...vals) || 1;
  const sx = scaler(-maxAbs, maxAbs, LGUT, CW - PAD.r);
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
            <Text x={2} y={cy + 2} style={{ fontSize: 5.8 }} fill={K.muted} textAnchor="start">{(b.label || "").slice(0, 26)}</Text>
          </G>
        );
      })}
    </ChartBox>
  );
}

/* F-test variance distribution: density curve for (df1, df2), the upper-tail
   rejection region beyond F crit, and where the observed F statistic lands. */
function FDistCurve({ comp }) {
  const { df1, df2, F, fCrit, significant } = comp.f;
  if (![df1, df2, fCrit].every(Number.isFinite) || !(fCrit > 0)) return null;
  const capped = !Number.isFinite(F) || F > fCrit * 3;
  const Fx = capped ? fCrit * 3 : F;
  const xMax = Math.max(Fx, fCrit, 3) * 1.4;
  const N = 120;
  const x0 = xMax / N;
  const raw = [];
  for (let i = 0; i <= N; i++) { const x = x0 + ((xMax - x0) * i) / N; raw.push({ x, y: fPdf(x, df1, df2) }); }
  const norm = Math.max(...raw.map((r) => r.y).filter(Number.isFinite)) || 1;
  const sx = scaler(0, xMax, PAD.l, CW - PAD.r);
  const sy = scaler(0, 1.12, CH - PAD.b, PAD.t);
  const ny = (y) => Math.min(y / norm, 1.12);
  const pts = raw.map((r) => `${sx(r.x)},${sy(ny(r.y))}`).join(" ");
  const tail = raw.filter((r) => r.x >= fCrit);
  const poly = tail.length
    ? `${sx(fCrit)},${sy(0)} ` + tail.map((r) => `${sx(r.x)},${sy(ny(r.y))}`).join(" ") + ` ${sx(tail[tail.length - 1].x)},${sy(0)}`
    : "";
  const fCol = significant ? K.fail : K.pass;
  return (
    <ChartBox title={`F-test distribution (df ${df1}, ${df2})`}>
      <Axes xLabel="F value" />
      {poly ? <Polygon points={poly} fill={K.fail} fillOpacity={0.13} stroke="none" /> : null}
      <Polyline points={pts} stroke={K.primary} strokeWidth={1.4} fill="none" />
      <Line x1={sx(fCrit)} y1={PAD.t} x2={sx(fCrit)} y2={CH - PAD.b} stroke={K.warn} strokeWidth={0.8} strokeDasharray="3 2" />
      <Line x1={sx(Fx)} y1={PAD.t} x2={sx(Fx)} y2={CH - PAD.b} stroke={fCol} strokeWidth={0.9} strokeDasharray="3 2" />
      {tick(sx(fCrit), PAD.t + 4, `Fc ${fmt(fCrit, 2)}`)}
      {tick(sx(Fx), CH - PAD.b - 3, `${capped ? "F≫ " : "F "}${fmt(F, 2)}`)}
    </ChartBox>
  );
}

/* Strip plot: every replicate of A (teal) and B (violet) with mean ± SD marks. */
function SpreadChart({ comp, labelA, labelB }) {
  const a = comp.a, b = comp.b;
  const all = [...a, ...b];
  const lo = Math.min(...all), hi = Math.max(...all), pad = (hi - lo) * 0.08 || 1;
  const sx = scaler(lo - pad, hi + pad, PAD.l + 42, CW - PAD.r);
  const yA = PAD.t + 34, yB = CH - PAD.b - 30;
  const jit = (i, n) => (n <= 1 ? 0 : ((i / (n - 1)) - 0.5) * 12);
  const m1 = mean(a), m2 = mean(b), s1 = sd(a), s2 = sd(b);
  return (
    <ChartBox title="Data spread (each replicate)">
      <Text x={2} y={yA + 2} style={{ fontSize: 6 }} fill={K.muted}>{(labelA || "A").slice(0, 12)}</Text>
      <Text x={2} y={yB + 2} style={{ fontSize: 6 }} fill={K.muted}>{(labelB || "B").slice(0, 12)}</Text>
      {a.map((v, i) => <Circle key={"a" + i} cx={sx(v)} cy={yA + jit(i, a.length)} r={1.9} fill={K.primary} />)}
      {b.map((v, i) => <Circle key={"b" + i} cx={sx(v)} cy={yB + jit(i, b.length)} r={1.9} fill={K.violet} />)}
      <Line x1={sx(m1 - s1)} y1={yA} x2={sx(m1 + s1)} y2={yA} stroke={K.warn} strokeWidth={0.8} />
      <Rect x={sx(m1) - 2.2} y={yA - 2.2} width={4.4} height={4.4} fill={K.warn} />
      <Line x1={sx(m2 - s2)} y1={yB} x2={sx(m2 + s2)} y2={yB} stroke={K.warn} strokeWidth={0.8} />
      <Rect x={sx(m2) - 2.2} y={yB - 2.2} width={4.4} height={4.4} fill={K.warn} />
      {tick(sx(lo), CH - PAD.b + 8, sig(lo, 3))}
      {tick(sx(hi), CH - PAD.b + 8, sig(hi, 3))}
    </ChartBox>
  );
}

/* Difference in means with its 95 % CI; crossing the dashed zero line ⇒ n.s. */
function DiffChart({ comp }) {
  const diff = comp.tt.diff, ci = comp.tt.tCrit * comp.tt.se;
  const lo = Math.min(0, diff - ci), hi = Math.max(0, diff + ci);
  const pad = (hi - lo) * 0.2 || Math.abs(diff) || 1;
  const sx = scaler(lo - pad, hi + pad, PAD.l, CW - PAD.r);
  const cy = (PAD.t + CH - PAD.b) / 2;
  const col = comp.tt.significant ? K.warn : K.pass;
  return (
    <ChartBox title="Difference in means ± 95% CI">
      <Axes />
      <Line x1={sx(0)} y1={PAD.t} x2={sx(0)} y2={CH - PAD.b} stroke={K.pass} strokeWidth={0.8} strokeDasharray="3 2" />
      <Line x1={sx(diff - ci)} y1={cy} x2={sx(diff + ci)} y2={cy} stroke={col} strokeWidth={1} />
      <Line x1={sx(diff - ci)} y1={cy - 4} x2={sx(diff - ci)} y2={cy + 4} stroke={col} strokeWidth={1} />
      <Line x1={sx(diff + ci)} y1={cy - 4} x2={sx(diff + ci)} y2={cy + 4} stroke={col} strokeWidth={1} />
      <Circle cx={sx(diff)} cy={cy} r={2.6} fill={col} />
      {tick(sx(0), PAD.t + 4, "0")}
      {tick(sx(diff), cy - 8, sig(diff, 3))}
      {tick(sx(lo - pad), CH - PAD.b + 8, sig(lo - pad, 2))}
      {tick(sx(hi + pad), CH - PAD.b + 8, sig(hi + pad, 2))}
    </ChartBox>
  );
}

/* One-sample: replicates vs the reference value, with the mean's 95 % CI. */
function OneSampleChart({ comp, label }) {
  const a = comp.a;
  const ci = comp.tCrit * comp.se;
  const xs = [...a, comp.ref, comp.mean - ci, comp.mean + ci];
  const lo = Math.min(...xs), hi = Math.max(...xs), pad = (hi - lo) * 0.15 || 1;
  const sx = scaler(lo - pad, hi + pad, PAD.l + 20, CW - PAD.r);
  const cy = (PAD.t + CH - PAD.b) / 2;
  const col = comp.significant ? K.warn : K.pass;
  return (
    <ChartBox title="Data vs reference value">
      <Line x1={PAD.l + 20} y1={CH - PAD.b} x2={CW - PAD.r} y2={CH - PAD.b} stroke={K.line} strokeWidth={1} />
      <Text x={2} y={cy + 2} style={{ fontSize: 6 }} fill={K.muted}>{(label || "Data").slice(0, 10)}</Text>
      <Line x1={sx(comp.ref)} y1={PAD.t} x2={sx(comp.ref)} y2={CH - PAD.b} stroke={K.violet} strokeWidth={0.8} strokeDasharray="3 2" />
      {tick(sx(comp.ref), PAD.t + 4, `ref ${sig(comp.ref, 3)}`)}
      {a.map((v, i) => <Circle key={i} cx={sx(v)} cy={cy + ((i % 3) - 1) * 3} r={1.9} fill={K.primary} />)}
      <Line x1={sx(comp.mean - ci)} y1={cy} x2={sx(comp.mean + ci)} y2={cy} stroke={col} strokeWidth={1} />
      <Line x1={sx(comp.mean - ci)} y1={cy - 4} x2={sx(comp.mean - ci)} y2={cy + 4} stroke={col} strokeWidth={1} />
      <Line x1={sx(comp.mean + ci)} y1={cy - 4} x2={sx(comp.mean + ci)} y2={cy + 4} stroke={col} strokeWidth={1} />
      <Rect x={sx(comp.mean) - 2.4} y={cy - 2.4} width={4.8} height={4.8} fill={col} />
      {tick(sx(lo - pad), CH - PAD.b + 8, sig(lo - pad, 2))}
      {tick(sx(hi + pad), CH - PAD.b + 8, sig(hi + pad, 2))}
    </ChartBox>
  );
}

/* Ruggedness sensitivity (tornado): the result span low → high per factor,
   sorted by effect size, with the mean of all results marked. */
function TornadoChart({ robust, cr }) {
  const rob = +cr.robustPctMax;
  const items = [...robust]
    .map((r) => ({ name: r.name, lo: Math.min(+r.resLow, +r.resHigh), hi: Math.max(+r.resLow, +r.resHigh), effect: r.effect, ok: Math.abs(r.effectPct) <= rob }))
    .sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));
  const results = robust.flatMap((r) => [+r.resLow, +r.resHigh]).filter(Number.isFinite);
  if (!results.length) return null;
  const gm = results.reduce((a, b) => a + b, 0) / results.length;
  const lo = Math.min(...results), hi = Math.max(...results), pad = (hi - lo) * 0.1 || 1;
  const sx = scaler(lo - pad, hi + pad, 96, CW - PAD.r);
  const n = items.length;
  const slot = (CH - PAD.t - PAD.b) / n;
  const bh = Math.min(14, slot * 0.5);
  return (
    <ChartBox title="Sensitivity — result span (low → high)">
      <Line x1={sx(gm)} y1={PAD.t} x2={sx(gm)} y2={CH - PAD.b} stroke={K.primary} strokeWidth={0.7} strokeDasharray="3 2" />
      {tick(sx(gm), PAD.t + 4, "mean")}
      {items.map((b, i) => {
        const cy = PAD.t + slot * i + slot / 2;
        const x1 = sx(b.lo), x2 = sx(b.hi);
        return (
          <G key={i}>
            <Rect x={Math.min(x1, x2)} y={cy - bh / 2} width={Math.max(1.5, Math.abs(x2 - x1))} height={bh} fill={b.ok ? K.primary : K.warn} />
            <Text x={2} y={cy + 2} style={{ fontSize: 5.8 }} fill={K.muted} textAnchor="start">{(b.name || "").slice(0, 26)}</Text>
          </G>
        );
      })}
      {tick(sx(lo), CH - PAD.b + 8, sig(lo, 3))}
      {tick(sx(hi), CH - PAD.b + 8, sig(hi, 3))}
    </ChartBox>
  );
}

/* Ruggedness significance: |effect| per factor vs the repeatability critical
   difference (needs the Precision module). Bars past the line are significant. */
function SigChart({ robust, prec }) {
  if (!prec) return null;
  const cd = prec.sr * tCrit95(prec.dfw) * Math.SQRT2 / Math.sqrt(prec.N / prec.p);
  const items = [...robust]
    .map((r) => ({ name: r.name, absEffect: Math.abs(r.effect), sig: r.srTest }))
    .sort((a, b) => b.absEffect - a.absEffect);
  const maxV = Math.max(cd, ...items.map((i) => i.absEffect)) || 1;
  const sx = scaler(0, maxV * 1.12, 96, CW - PAD.r);
  const n = items.length;
  const slot = (CH - PAD.t - PAD.b) / n;
  const bh = Math.min(14, slot * 0.5);
  const x0 = sx(0);
  return (
    <ChartBox title="|Effect| vs repeatability noise">
      <Line x1={x0} y1={PAD.t} x2={x0} y2={CH - PAD.b} stroke={K.line} strokeWidth={0.8} />
      <Line x1={sx(cd)} y1={PAD.t} x2={sx(cd)} y2={CH - PAD.b} stroke={K.warn} strokeWidth={0.7} strokeDasharray="3 2" />
      {tick(sx(cd), PAD.t + 4, `CD ${sig(cd, 2)}`)}
      {items.map((b, i) => {
        const cy = PAD.t + slot * i + slot / 2;
        return (
          <G key={i}>
            <Rect x={x0} y={cy - bh / 2} width={Math.max(1, sx(b.absEffect) - x0)} height={bh} fill={b.sig ? K.warn : K.primary} />
            <Text x={2} y={cy + 2} style={{ fontSize: 5.8 }} fill={K.muted} textAnchor="start">{(b.name || "").slice(0, 26)}</Text>
          </G>
        );
      })}
    </ChartBox>
  );
}

/* LOD/LOQ distribution: blank / LOD / LOQ bells of equal width (s'0) with the
   decision limit LC and its false-positive (α) / false-negative (β) tails.
   Mirrors the app; applies to the s0 and calibration approaches. */
function LodDistChart({ lod, unit }) {
  if (!lod || lod.lod == null || lod.loq == null) return null;
  const sigma = lod.s0p && lod.s0p > 0 ? lod.s0p : lod.lod > 0 ? lod.lod / 3 : 0;
  if (!(sigma > 0) || !Number.isFinite(lod.loq)) return null;
  const mu = Number.isFinite(lod.mean) ? lod.mean : 0;
  const lodC = mu + lod.lod, loqC = mu + lod.loq, lc = mu + lod.lod / 2;
  const xMin = mu - 4 * sigma, xMax = loqC + 4 * sigma;
  const N = 90;
  const g = (x, c) => Math.exp(-0.5 * ((x - c) / sigma) ** 2);
  const sx = scaler(xMin, xMax, PAD.l, CW - PAD.r);
  const sy = scaler(0, 1.14, CH - PAD.b, PAD.t);
  const xAt = (i) => xMin + ((xMax - xMin) * i) / N;
  const curve = (c) => { const p = []; for (let i = 0; i <= N; i++) p.push(`${sx(xAt(i))},${sy(g(xAt(i), c))}`); return p.join(" "); };
  const aPts = []; for (let i = 0; i <= N; i++) if (xAt(i) >= lc) aPts.push(xAt(i));
  const bPts = []; for (let i = 0; i <= N; i++) if (xAt(i) <= lc) bPts.push(xAt(i));
  const aPoly = aPts.length ? `${sx(lc)},${sy(0)} ` + aPts.map((x) => `${sx(x)},${sy(g(x, mu))}`).join(" ") + ` ${sx(aPts[aPts.length - 1])},${sy(0)}` : "";
  const bPoly = bPts.length ? `${sx(bPts[0])},${sy(0)} ` + bPts.map((x) => `${sx(x)},${sy(g(x, lodC))}`).join(" ") + ` ${sx(lc)},${sy(0)}` : "";
  return (
    <ChartBox title={`LOD / LOQ vs blank noise (${unit || ""})`}>
      <Axes xLabel="Measured value" />
      {aPoly ? <Polygon points={aPoly} fill={K.fail} fillOpacity={0.38} stroke="none" /> : null}
      {bPoly ? <Polygon points={bPoly} fill={K.warn} fillOpacity={0.38} stroke="none" /> : null}
      <Polyline points={curve(mu)} stroke={K.muted} strokeWidth={1.2} fill="none" />
      <Polyline points={curve(lodC)} stroke={K.fail} strokeWidth={1.2} fill="none" />
      <Polyline points={curve(loqC)} stroke={K.primary} strokeWidth={1.4} fill="none" />
      <Line x1={sx(lc)} y1={PAD.t} x2={sx(lc)} y2={CH - PAD.b} stroke={K.warn} strokeWidth={0.7} strokeDasharray="3 2" />
      {tick(sx(mu), CH - PAD.b + 8, "blank")}
      {tick(sx(lc), PAD.t + 4, "LC")}
      {tick(sx(lodC), PAD.t + 13, `LOD ${sig(lod.lod, 2)}`)}
      {tick(sx(loqC), CH - PAD.b - 3, `LOQ ${sig(lod.loq, 2)}`)}
    </ChartBox>
  );
}

/* Trueness (CRM): measurement-spread bell around the mean, the true value, the
   bias gap between them, and the CRM's own expanded-uncertainty band. */
function TruenessCrmChart({ trueness, crmU, unit }) {
  const mu = trueness.mean, sigma = trueness.sd, refVal = trueness.mean - trueness.bias;
  if (![mu, sigma, refVal].every(Number.isFinite) || !(sigma > 0)) return null;
  const xMin = Math.min(refVal, mu - 3.6 * sigma) - 0.5 * sigma;
  const xMax = Math.max(refVal, mu + 3.6 * sigma) + 0.5 * sigma;
  const N = 90;
  const g = (x) => Math.exp(-0.5 * ((x - mu) / sigma) ** 2);
  const sx = scaler(xMin, xMax, PAD.l, CW - PAD.r);
  const sy = scaler(0, 1.14, CH - PAD.b, PAD.t);
  const pts = []; for (let i = 0; i <= N; i++) { const x = xMin + ((xMax - xMin) * i) / N; pts.push(`${sx(x)},${sy(g(x))}`); }
  const refU = +crmU, top = PAD.t, boxH = CH - PAD.b - PAD.t;
  return (
    <ChartBox title={`Measurement spread vs true value (${unit || ""})`}>
      <Axes xLabel="Value" />
      {Number.isFinite(refU) && refU > 0 ? <Rect x={sx(refVal - refU)} y={top} width={Math.max(1, sx(refVal + refU) - sx(refVal - refU))} height={boxH} fill={K.fail} fillOpacity={0.07} /> : null}
      <Rect x={Math.min(sx(refVal), sx(mu))} y={top} width={Math.max(1, Math.abs(sx(mu) - sx(refVal)))} height={boxH} fill={K.pass} fillOpacity={0.09} />
      <Polyline points={pts.join(" ")} stroke={K.primary} strokeWidth={1.5} fill="none" />
      <Line x1={sx(refVal)} y1={top} x2={sx(refVal)} y2={CH - PAD.b} stroke={K.fail} strokeWidth={0.9} strokeDasharray="3 2" />
      <Line x1={sx(mu)} y1={top} x2={sx(mu)} y2={CH - PAD.b} stroke={K.pass} strokeWidth={0.9} strokeDasharray="3 2" />
      {tick(sx(refVal), PAD.t + 4, `true ${sig(refVal, 3)}`)}
      {tick(sx(mu), CH - PAD.b - 3, `mean ${sig(mu, 3)}`)}
    </ChartBox>
  );
}

/* Trueness (spike): recovery with its 95 % CI against the 100 % target and the
   acceptance window. CI crossing 100 % ⇒ no significant bias. */
function TruenessSpikeChart({ trueness, recMin, recMax }) {
  const R = trueness.recovery, ci = (trueness.tCrit || 2) * (trueness.sdRec || 0);
  const lo = Math.min(recMin, R - ci, 100), hi = Math.max(recMax, R + ci, 100);
  const pad = (hi - lo) * 0.12 || 5;
  const sx = scaler(lo - pad, hi + pad, PAD.l, CW - PAD.r);
  const cy = (PAD.t + CH - PAD.b) / 2;
  const col = trueness.significant ? K.warn : K.pass;
  return (
    <ChartBox title="Spike recovery ± 95% CI">
      <Axes xLabel="Recovery (%)" />
      {Number.isFinite(recMin) && Number.isFinite(recMax) ? <Rect x={sx(recMin)} y={PAD.t} width={Math.max(1, sx(recMax) - sx(recMin))} height={CH - PAD.b - PAD.t} fill={K.passBg} /> : null}
      <Line x1={sx(100)} y1={PAD.t} x2={sx(100)} y2={CH - PAD.b} stroke={K.pass} strokeWidth={0.8} strokeDasharray="3 2" />
      {tick(sx(100), PAD.t + 4, "100%")}
      <Line x1={sx(R - ci)} y1={cy} x2={sx(R + ci)} y2={cy} stroke={col} strokeWidth={1} />
      <Line x1={sx(R - ci)} y1={cy - 4} x2={sx(R - ci)} y2={cy + 4} stroke={col} strokeWidth={1} />
      <Line x1={sx(R + ci)} y1={cy - 4} x2={sx(R + ci)} y2={cy + 4} stroke={col} strokeWidth={1} />
      <Circle cx={sx(R)} cy={cy} r={2.6} fill={col} />
      {tick(sx(R), cy - 8, `${fmt(R, 1)}%`)}
      {tick(sx(lo - pad), CH - PAD.b + 8, fmt(lo - pad, 0))}
      {tick(sx(hi + pad), CH - PAD.b + 8, fmt(hi + pad, 0))}
    </ChartBox>
  );
}

/* Precision individual-value plot: every replicate grouped by run/day, with
   group means (± SD), grand mean, and the ±sr / ±sI precision bands. */
function PrecStripChart({ prec, label }) {
  const groups = prec.groups;
  if (!groups || !groups.length) return null;
  const all = groups.flat();
  const yLo = Math.min(...all, prec.gm - prec.sI), yHi = Math.max(...all, prec.gm + prec.sI);
  const pad = (yHi - yLo) * 0.1 || 1;
  const sy = scaler(yLo - pad, yHi + pad, CH - PAD.b, PAD.t);
  const p = groups.length;
  const slotW = (CW - PAD.r - PAD.l) / p;
  const cx = (gi) => PAD.l + slotW * gi + slotW / 2;
  const jit = (i, n) => (n <= 1 ? 0 : ((i / (n - 1)) - 0.5) * Math.min(slotW * 0.5, 26));
  const bandRect = (half, fill, op) => <Rect x={PAD.l} y={sy(prec.gm + half)} width={CW - PAD.r - PAD.l} height={Math.max(0, sy(prec.gm - half) - sy(prec.gm + half))} fill={fill} fillOpacity={op} />;
  return (
    <ChartBox title={`Individual values by ${label.toLowerCase()}`}>
      <Axes xLabel={label} />
      {bandRect(prec.sI, K.primary, 0.06)}
      {bandRect(prec.sr, K.pass, 0.10)}
      <Line x1={PAD.l} y1={sy(prec.gm)} x2={CW - PAD.r} y2={sy(prec.gm)} stroke={K.primary} strokeWidth={0.7} strokeDasharray="3 2" />
      {tick(PAD.l - 2, sy(prec.gm), sig(prec.gm, 3), "end")}
      {groups.map((g, gi) => (
        <G key={gi}>
          {g.map((v, i) => <Circle key={i} cx={cx(gi) + jit(i, g.length)} cy={sy(v)} r={1.8} fill={K.violet} />)}
          <Rect x={cx(gi) - 2.2} y={sy(mean(g)) - 2.2} width={4.4} height={4.4} fill={K.warn} />
          <Text x={cx(gi)} y={CH - PAD.b + 8} style={{ fontSize: 6 }} fill={K.muted} textAnchor="middle">{`${label[0]}${gi + 1}`}</Text>
        </G>
      ))}
    </ChartBox>
  );
}

/* Variance components: total variance sI² split into within-group repeatability
   (sr²) and between-group (s²b), as one stacked bar with % labels. */
function VarCompChart({ prec }) {
  const varW = prec.sr ** 2, varB = prec.sBetween ** 2, varT = varW + varB || 1;
  const sy = scaler(0, varT * 1.12, CH - PAD.b, PAD.t);
  const bw = 52, bx = PAD.l + (CW - PAD.r - PAD.l) / 2 - bw / 2 - 14;
  const y0 = sy(0), yW = sy(varW), yTop = sy(varT);
  return (
    <ChartBox title="Variance components">
      <Axes />
      {tick(PAD.l - 2, y0, "0", "end")}
      {tick(PAD.l - 2, yTop, sig(varT, 2), "end")}
      <Rect x={bx} y={yW} width={bw} height={Math.max(0, y0 - yW)} fill={K.primary} />
      <Rect x={bx} y={yTop} width={bw} height={Math.max(0, yW - yTop)} fill={K.violet} />
      <Text x={bx + bw + 5} y={(y0 + yW) / 2 + 2} style={{ fontSize: 6 }} fill={K.primary}>{`sr²  ${fmt((varW / varT) * 100, 0)}%`}</Text>
      <Text x={bx + bw + 5} y={(yW + yTop) / 2 + 2} style={{ fontSize: 6 }} fill={K.violet}>{`s²b  ${fmt((varB / varT) * 100, 0)}%`}</Text>
    </ChartBox>
  );
}

/* Precision vs acceptance limits: measured RSDr / RSDI (green/red) beside their
   grey limit bars. */
function RsdLimitChart({ prec, cr }) {
  const rL = +cr.rsdRMax, iL = +cr.rsdIMax;
  const items = [
    { name: "RSDr", measured: prec.rsdR, limit: Number.isFinite(rL) ? rL : null },
    { name: "RSDI", measured: prec.rsdI, limit: Number.isFinite(iL) ? iL : null },
  ];
  const hi = Math.max(...items.flatMap((d) => [d.measured, d.limit || 0])) * 1.15 || 1;
  const sy = scaler(0, hi, CH - PAD.b, PAD.t);
  const n = items.length, slot = (CW - PAD.r - PAD.l) / n, bw = Math.min(20, slot * 0.3), y0 = sy(0);
  return (
    <ChartBox title="Precision vs acceptance limits">
      <Axes />
      <Line x1={PAD.l} y1={y0} x2={CW - PAD.r} y2={y0} stroke={K.line} strokeWidth={0.8} />
      {tick(PAD.l - 2, sy(hi), `${fmt(hi, 0)}%`, "end")}
      {items.map((d, i) => {
        const c = PAD.l + slot * i + slot / 2;
        const ok = d.limit == null || d.measured <= d.limit;
        return (
          <G key={i}>
            {d.limit != null ? <Rect x={c - bw - 2} y={sy(d.limit)} width={bw} height={Math.max(0, y0 - sy(d.limit))} fill={K.line} /> : null}
            <Rect x={c + 2} y={sy(d.measured)} width={bw} height={Math.max(0, y0 - sy(d.measured))} fill={ok ? K.primary : K.fail} />
            <Text x={c} y={CH - PAD.b + 8} style={{ fontSize: 6.5 }} fill={K.muted} textAnchor="middle">{d.name}</Text>
            <Text x={c + 2 + bw / 2} y={sy(d.measured) - 2} style={{ fontSize: 6 }} fill={K.muted} textAnchor="middle">{fmt(d.measured, 1)}</Text>
          </G>
        );
      })}
    </ChartBox>
  );
}

/* Uncertainty budget: each component's share of the combined variance uc²,
   largest first — shows whether precision or bias dominates. */
function UncertaintyBudgetChart({ mu }) {
  const comps = [
    { name: "Precision u(P)", u: mu.uPrec, share: mu.uc > 0 ? (mu.uPrec ** 2 / mu.uc ** 2) * 100 : 0 },
    ...(mu.uBias !== null ? [{ name: "Bias u(bias)", u: mu.uBias, share: mu.uc > 0 ? (mu.uBias ** 2 / mu.uc ** 2) * 100 : 0 }] : []),
  ].sort((a, b) => b.share - a.share);
  const LGUT = 84;
  const sx = scaler(0, 100, LGUT, CW - PAD.r);
  const n = comps.length, slot = (CH - PAD.t - PAD.b) / n, bh = Math.min(18, slot * 0.5), x0 = sx(0);
  return (
    <ChartBox title="Uncertainty budget (% of variance)">
      {[25, 50, 75, 100].map((g, i) => <Line key={i} x1={sx(g)} y1={PAD.t} x2={sx(g)} y2={CH - PAD.b} stroke={K.line} strokeWidth={0.4} strokeDasharray="2 3" />)}
      <Line x1={x0} y1={PAD.t} x2={x0} y2={CH - PAD.b} stroke={K.line} strokeWidth={0.8} />
      {[0, 50, 100].map((g, i) => <Text key={i} x={sx(g)} y={CH - PAD.b + 8} style={{ fontSize: 6 }} fill={K.faint} textAnchor="middle">{g}%</Text>)}
      {comps.map((d, i) => {
        const cy = PAD.t + slot * i + slot / 2;
        return (
          <G key={i}>
            <Rect x={x0} y={cy - bh / 2} width={Math.max(1, sx(d.share) - x0)} height={bh} fill={i === 0 ? K.primary : K.violet} />
            <Text x={2} y={cy + 2} style={{ fontSize: 6 }} fill={K.muted} textAnchor="start">{d.name.slice(0, 15)}</Text>
            <Text x={sx(d.share) + 3} y={cy + 2} style={{ fontSize: 6 }} fill={K.muted} textAnchor="start">{fmt(d.share, 0)}%</Text>
          </G>
        );
      })}
    </ChartBox>
  );
}

/* Reported result x̄ with its expanded-uncertainty interval (± U, k = 2) and the
   inner ± uc (k = 1) standard-uncertainty band. */
function ResultUChart({ mu, gm, unit }) {
  if (!Number.isFinite(gm)) return null;
  const U = mu.U, uc = mu.uc, lo = gm - U, hi = gm + U;
  const pad = (hi - lo) * 0.25 || Math.abs(gm) * 0.05 || 1;
  const sx = scaler(lo - pad, hi + pad, PAD.l, CW - PAD.r);
  const cy = (PAD.t + CH - PAD.b) / 2;
  return (
    <ChartBox title={`Reported result ± U (k=2) (${unit || ""})`}>
      <Axes />
      <Rect x={sx(gm - uc)} y={PAD.t} width={Math.max(1, sx(gm + uc) - sx(gm - uc))} height={CH - PAD.b - PAD.t} fill={K.primary} fillOpacity={0.12} />
      <Line x1={sx(gm)} y1={PAD.t} x2={sx(gm)} y2={CH - PAD.b} stroke={K.pass} strokeWidth={0.8} strokeDasharray="3 2" />
      <Line x1={sx(lo)} y1={cy} x2={sx(hi)} y2={cy} stroke={K.primary} strokeWidth={1.2} />
      <Line x1={sx(lo)} y1={cy - 5} x2={sx(lo)} y2={cy + 5} stroke={K.primary} strokeWidth={1.2} />
      <Line x1={sx(hi)} y1={cy - 5} x2={sx(hi)} y2={cy + 5} stroke={K.primary} strokeWidth={1.2} />
      <Circle cx={sx(gm)} cy={cy} r={2.8} fill={K.primary} />
      <Text x={sx(gm)} y={cy - 9} style={{ fontSize: 6.5 }} fill={K.ink} textAnchor="middle">{sig(gm, 4)}</Text>
      <Text x={(sx(lo) + sx(hi)) / 2} y={cy + 14} style={{ fontSize: 6 }} fill={K.muted} textAnchor="middle">{`±U ${sig(U, 2)} (${fmt(mu.UPct, 0)}%)`}</Text>
      {tick(sx(lo), CH - PAD.b + 8, sig(lo, 3))}
      {tick(sx(hi), CH - PAD.b + 8, sig(hi, 3))}
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
      <>
        <View style={s.chartsRow}>
          <CalibrationChart lin={lin} unit={unit} />
          <ResidualChart lin={lin} cr={cr} />
        </View>
        <View style={s.chartsRow}>
          <RfChart lin={lin} cr={cr} />
          <AccuracyChart lin={lin} cr={cr} />
        </View>
      </>
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
    charts = <LodDistChart lod={lod} unit={unit} />;
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
    charts = trueness.mode === "crm"
      ? <TruenessCrmChart trueness={trueness} crmU={study.trueness.crmU} unit={unit} />
      : <TruenessSpikeChart trueness={trueness} recMin={+cr.recMin} recMax={+cr.recMax} />;
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
    const plabel = study.precision.label;
    charts = (
      <>
        <View style={s.chartsRow}>
          <BarChartSvg title="Group means ± SD" bars={bars} refValue={prec.gm} unit={unit} valueFmt={(v) => sig(v, 3)} />
          <PrecStripChart prec={prec} label={plabel} />
        </View>
        <View style={s.chartsRow}>
          <VarCompChart prec={prec} />
          <RsdLimitChart prec={prec} cr={cr} />
        </View>
      </>
    );
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
    charts = comp.mode === "twoSample" ? (
      <>
        <FDistCurve comp={comp} />
        <View style={s.chartsRow}>
          <SpreadChart comp={comp} labelA={study.comparison.labelA} labelB={study.comparison.labelB} />
          <DiffChart comp={comp} />
        </View>
      </>
    ) : (
      <OneSampleChart comp={comp} label={study.comparison.labelA} />
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
    charts = (
      <>
        <View style={s.chartsRow}>
          <HBarChart title="Effect magnitude (%)" bars={bars} limit={+cr.robustPctMax} />
          <TornadoChart robust={robust} cr={cr} />
        </View>
        {prec ? <SigChart robust={robust} prec={prec} /> : null}
      </>
    );
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
    charts = (
      <View style={s.chartsRow}>
        <UncertaintyBudgetChart mu={mu} />
        <ResultUChart mu={mu} gm={prec ? prec.gm : NaN} unit={unit} />
      </View>
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
  const header = config.header || {};
  const metaLine = [info.id, info.analyte, info.matrix, info.technique, info.range && `Range: ${info.range}`].filter(Boolean).join("  ·  ");

  return (
    <Document title={`${info.title || "Method validation"} — report`} author={info.analyst || "LabValidate Pro"}>
      <Page size="A4" style={s.page} wrap>
        {/* Header */}
        <View style={s.brandRow} fixed>
          <View style={s.brandLeft}>
            {header.showLogo && header.logo ? <Image src={header.logo} style={s.logo} /> : null}
            {(header.showBrand || header.title) ? (
              <View>
                {header.showBrand ? <Text style={s.brand}>LabValidate <Text style={{ color: K.ink }}>Pro</Text></Text> : null}
                {header.title ? <Text style={s.brandTitle}>{header.title}</Text> : null}
              </View>
            ) : null}
          </View>
          <View style={s.brandRight}>
            <Text style={s.brandSub}>EURACHEM 3rd Ed. 2025  ·  ISO/IEC 17025:2017</Text>
            {header.showDocControl && header.docControl ? <Text style={s.docControl}>{header.docControl}</Text> : null}
          </View>
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
            {[
              ["Performed by", info.analyst],
              ["Reviewed by", info.reviewer === "QA Manager" ? "" : info.reviewer],
              ["Approved by", ""],
            ].map(([label, name], i) => (
              <View key={i} style={s.signCol}>
                <Text style={s.signLabel}>{label}</Text>
                <View>
                  <Text style={s.signField}>Name:{name ? ` ${name}` : ""}</Text>
                  <Text style={s.signField}>Position:</Text>
                  <Text style={s.signField}>Signature:</Text>
                  <Text style={s.signField}>Date:</Text>
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
  { id: "lodloq", label: "LOD / LOQ", chart: true },
  { id: "trueness", label: "Trueness / Bias", chart: true },
  { id: "precision", label: "Precision", chart: true },
  { id: "comparison", label: "F & t Tests", chart: true },
  { id: "recovery", label: "Recovery", chart: true },
  { id: "robustness", label: "Ruggedness", chart: true },
  { id: "uncertainty", label: "Uncertainty", chart: true },
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
  // Debounced snapshot of `config` that drives the (expensive) live preview.
  const [preview, setPreview] = useState({ config: null, ver: 0 });

  // Initialise config when the dialog opens.
  useEffect(() => {
    if (!open || !data) return;
    const sections = {};
    SECTION_META.forEach((m) => {
      sections[m.id] = { on: !!avail[m.id], view: m.chart ? "both" : "table" };
    });
    const cfg = {
      banner: true, summary: true, conclusion: true, signatures: true,
      header: { showBrand: true, title: "", logo: null, showLogo: true, docControl: "", showDocControl: true },
      order: SECTION_META.map((m) => m.id),
      sections,
    };
    setConfig(cfg);
    setPreview({ config: cfg, ver: 0 });
  }, [open, data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rendering the full PDF (many SVG charts, multiple pages) is costly, so
  // coalesce rapid toggles/typing into a single rebuild ~350 ms after the last
  // change instead of regenerating the document on every keystroke or click.
  useEffect(() => {
    if (!config) return;
    const t = setTimeout(() => setPreview((p) => (p.config === config ? p : { config, ver: p.ver + 1 })), 350);
    return () => clearTimeout(t);
  }, [config]);

  if (!open || !prepared || !config) return null;

  const setCore = (key) => setConfig((c) => ({ ...c, [key]: !c[key] }));
  const setHeader = (patch) => setConfig((c) => ({ ...c, header: { ...c.header, ...patch } }));
  const toggleSection = (id) => setConfig((c) => ({ ...c, sections: { ...c.sections, [id]: { ...c.sections[id], on: !c.sections[id].on } } }));
  const setView = (id, view) => setConfig((c) => ({ ...c, sections: { ...c.sections, [id]: { ...c.sections[id], on: true, view } } }));

  const onLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setHeader({ logo: reader.result, showLogo: true });
    reader.readAsDataURL(file);
    e.target.value = ""; // allow re-selecting the same file
  };

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

            <div className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Header &amp; branding</div>
            <div className="space-y-2">
              {/* Show the LabValidate Pro name */}
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-muted">
                <input type="checkbox" checked={config.header.showBrand} onChange={() => setHeader({ showBrand: !config.header.showBrand })} className="h-4 w-4 accent-[hsl(var(--primary))]" />
                <span>Show &ldquo;LabValidate Pro&rdquo; name</span>
              </label>

              {/* Custom header title / company name */}
              <div className="px-2">
                <label className="mb-1 block text-[11px] text-muted-foreground">Header title / company name</label>
                <input type="text" value={config.header.title} onChange={(e) => setHeader({ title: e.target.value })}
                  placeholder="e.g. Acme Analytical Laboratory"
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[12px] outline-none focus:border-primary" />
              </div>

              {/* Company logo upload */}
              <div className="px-2">
                <label className="mb-1 block text-[11px] text-muted-foreground">Company logo</label>
                {config.header.logo ? (
                  <div className="flex items-center gap-2">
                    <div className="flex h-10 w-20 items-center justify-center overflow-hidden rounded-md border border-border bg-white p-1">
                      <img src={config.header.logo} alt="logo preview" className="max-h-full max-w-full object-contain" />
                    </div>
                    <label className="flex cursor-pointer items-center gap-1.5 text-[12px]">
                      <input type="checkbox" checked={config.header.showLogo} onChange={() => setHeader({ showLogo: !config.header.showLogo })} className="h-3.5 w-3.5 accent-[hsl(var(--primary))]" />
                      Show
                    </label>
                    <button type="button" onClick={() => setHeader({ logo: null })} className="text-[11px] text-muted-foreground underline hover:text-destructive">Remove</button>
                  </div>
                ) : (
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-1.5 text-[12px] text-muted-foreground hover:border-primary hover:text-primary">
                    <ImagePlus className="h-3.5 w-3.5" />
                    Upload image
                    <input type="file" accept="image/*" onChange={onLogoUpload} className="hidden" />
                  </label>
                )}
              </div>

              {/* Document control / serial number */}
              <div className="px-2">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">Document control / serial no.</span>
                  <label className="flex cursor-pointer items-center gap-1 text-[11px] text-muted-foreground">
                    <input type="checkbox" checked={config.header.showDocControl} onChange={() => setHeader({ showDocControl: !config.header.showDocControl })} className="h-3.5 w-3.5 accent-[hsl(var(--primary))]" />
                    On
                  </label>
                </div>
                <input type="text" value={config.header.docControl} onChange={(e) => setHeader({ docControl: e.target.value })}
                  placeholder="e.g. DOC-VAL-001 Rev.2"
                  disabled={!config.header.showDocControl}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[12px] outline-none focus:border-primary disabled:opacity-50" />
              </div>
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
            <PDFViewer key={preview.ver} showToolbar={false} style={{ width: "100%", height: "100%", border: "none", borderRadius: 8, background: "white" }}>
              <ReportDocument data={prepared} config={preview.config || config} />
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

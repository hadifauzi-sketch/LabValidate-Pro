import { useState, useMemo, useRef, useEffect, lazy, Suspense, createContext, useContext } from "react";
import {
  FlaskConical, FileText, CheckCircle2, AlertTriangle, XCircle, Plus, Minus, Trash2,
  Download, Upload, Sun, Moon, Printer, Target, Layers, Shield, Activity,
  Beaker, Ruler, Crosshair, Repeat, GitCompareArrows, Sigma, ClipboardList,
  CircleDashed, ChevronRight, ChevronUp, ChevronDown, Info, Calendar as CalendarIcon,
  Library, Save, X, FolderOpen, FilePlus,
  Settings, LogIn, LogOut, LayoutDashboard, Cloud, Loader2, ArrowLeft, UserCircle2,
  MessageSquare, Clock,
} from "lucide-react";
import { auth, cloud } from "@/lib/apiClient";
import { AuthDialog } from "@/components/AuthDialog";
import { SettingsMenu } from "@/components/SettingsMenu";
import { TermsDialog, TERMS_VERSION } from "@/components/TermsDialog";
import { WorkspaceDashboard } from "@/components/WorkspaceDashboard";
// Lazy — every dialog below renders only on demand, so each fetches its own
// chunk the first time it is opened rather than riding along in the main bundle.
// AuthDialog, TermsDialog and the SettingsMenu stay eager: they are the first
// screen a signed-out visitor sees.
const AccountDialog = lazy(() => import("@/components/AccountDialog").then((m) => ({ default: m.AccountDialog })));
const AboutDialog = lazy(() => import("@/components/AboutDialog").then((m) => ({ default: m.AboutDialog })));
const TutorialDialog = lazy(() => import("@/components/TutorialDialog").then((m) => ({ default: m.TutorialDialog })));
const FeedbackDialog = lazy(() => import("@/components/FeedbackDialog").then((m) => ({ default: m.FeedbackDialog })));
const ReportDialog = lazy(() => import("@/components/ReportDialog").then((m) => ({ default: m.ReportDialog })));
const AdminDialog = lazy(() => import("@/components/AdminDialog").then((m) => ({ default: m.AdminDialog })));
const PendingGate = lazy(() => import("@/components/PendingGate").then((m) => ({ default: m.PendingGate })));
// Lazy — react-pdf is heavy, so it only loads when the Print/PDF dialog is opened.
const PdfReportDialog = lazy(() => import("@/components/PdfReportDialog").then((m) => ({ default: m.PdfReportDialog })));
// Lazy — recharts + d3 are the biggest slice of the main bundle, and nothing is
// plotted until a module with a chart is opened. ChartFrame hands the recharts
// primitives to the chart below it, so each chart stays where it is written.
const ChartKit = lazy(() => import("@/components/ChartKit"));
const ChartFrame = ({ children }) => (
  <Suspense fallback={<div className="h-full w-full animate-pulse rounded-md bg-muted/30" />}>
    <ChartKit>{children}</ChartKit>
  </Suspense>
);
import { format as formatDate, parseISO, isValid as isValidDate } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { Calendar } from "@/components/ui/calendar";

/* ════════════════════════════════════════════════════════════════
   STATISTICS ENGINE — Eurachem "Fitness for Purpose" 3rd Ed. (2025)
   ════════════════════════════════════════════════════════════════ */
const num = (v) => (v === "" || v === null || isNaN(v) ? null : +v);
const clean = (arr) => arr.map(num).filter((v) => v !== null);

const S = {
  mean: (a) => a.reduce((x, y) => x + y, 0) / a.length,
  variance: (a) => {
    const m = S.mean(a);
    return a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1);
  },
  sd: (a) => Math.sqrt(S.variance(a)),
  rsd: (a) => (S.sd(a) / S.mean(a)) * 100,
  se: (a) => S.sd(a) / Math.sqrt(a.length),

  linReg(x, y) {
    const n = x.length;
    const mx = S.mean(x), my = S.mean(y);
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) {
      sxy += (x[i] - mx) * (y[i] - my);
      sxx += (x[i] - mx) ** 2;
      syy += (y[i] - my) ** 2;
    }
    const slope = sxy / sxx;
    const intercept = my - slope * mx;
    const r = sxy / Math.sqrt(sxx * syy);
    const residuals = x.map((xi, i) => y[i] - (slope * xi + intercept));
    const ssr = residuals.reduce((s, e) => s + e ** 2, 0);
    const syx = n > 2 ? Math.sqrt(ssr / (n - 2)) : 0;
    const sSlope = syx / Math.sqrt(sxx);
    const sIntercept = syx * Math.sqrt(1 / n + mx ** 2 / sxx);
    return { n, slope, intercept, r, r2: r * r, residuals, syx, sSlope, sIntercept, sxx, mx };
  },

  // Two-tailed Student t, 95 % — interpolated table
  tCrit95(df) {
    const T = [[1,12.706],[2,4.303],[3,3.182],[4,2.776],[5,2.571],[6,2.447],[7,2.365],[8,2.306],[9,2.262],[10,2.228],[12,2.179],[14,2.145],[16,2.120],[18,2.101],[20,2.086],[25,2.060],[30,2.042],[40,2.021],[60,2.000],[120,1.980],[1e9,1.960]];
    if (df <= 1) return 12.706;
    for (let i = 0; i < T.length - 1; i++) {
      const [d1, t1] = T[i], [d2, t2] = T[i + 1];
      if (df === d1) return t1;
      if (df > d1 && df <= d2) return t1 + ((df - d1) / (d2 - d1)) * (t2 - t1);
    }
    return 1.96;
  },

  // One-sided Student t, 99 % (α = 0.01) — used by USEPA 40 CFR 136 App. B MDL. Interpolated table.
  tCrit99one(df) {
    const T = [[1,31.821],[2,6.965],[3,4.541],[4,3.747],[5,3.365],[6,3.143],[7,2.998],[8,2.896],[9,2.821],[10,2.764],[11,2.718],[12,2.681],[13,2.650],[14,2.624],[15,2.602],[16,2.583],[18,2.552],[20,2.528],[25,2.485],[30,2.457],[40,2.423],[60,2.390],[120,2.358],[1e9,2.326]];
    if (df <= 1) return 31.821;
    for (let i = 0; i < T.length - 1; i++) {
      const [d1, t1] = T[i], [d2, t2] = T[i + 1];
      if (df === d1) return t1;
      if (df > d1 && df <= d2) return t1 + ((df - d1) / (d2 - d1)) * (t2 - t1);
    }
    return 2.326;
  },

  // F critical, α = 0.05 (one-tailed) — nearest lookup for ANOVA / F-test
  fCrit95(df1, df2) {
    const cols = [1, 2, 3, 4, 5, 6, 8, 10, 20];
    const rows = {
      2: [18.51,19.00,19.16,19.25,19.30,19.33,19.37,19.40,19.45],
      4: [7.71,6.94,6.59,6.39,6.26,6.16,6.04,5.96,5.80],
      6: [5.99,5.14,4.76,4.53,4.39,4.28,4.15,4.06,3.87],
      8: [5.32,4.46,4.07,3.84,3.69,3.58,3.44,3.35,3.15],
      10: [4.96,4.10,3.71,3.48,3.33,3.22,3.07,2.98,2.77],
      12: [4.75,3.89,3.49,3.26,3.11,3.00,2.85,2.75,2.54],
      15: [4.54,3.68,3.29,3.06,2.90,2.79,2.64,2.54,2.33],
      20: [4.35,3.49,3.10,2.87,2.71,2.60,2.45,2.35,2.12],
      30: [4.17,3.32,2.92,2.69,2.53,2.42,2.27,2.16,1.93],
      60: [4.00,3.15,2.76,2.53,2.37,2.25,2.10,1.99,1.75],
    };
    const c = cols.reduce((b, v) => (Math.abs(v - df1) < Math.abs(b - df1) ? v : b), cols[0]);
    const rk = Object.keys(rows).map(Number).reduce((b, v) => (Math.abs(v - df2) < Math.abs(b - df2) ? v : b), 2);
    return rows[rk][cols.indexOf(c)];
  },

  // F critical, upper 2.5 % points (α = 0.025) — used as the two-tailed 95 % variance-comparison test. Nearest lookup.
  fCrit975(df1, df2) {
    const cols = [1, 2, 3, 4, 5, 6, 8, 10, 20];
    const rows = {
      2: [38.51,39.00,39.17,39.25,39.30,39.33,39.37,39.40,39.45],
      4: [12.22,10.65,9.98,9.60,9.36,9.20,8.98,8.84,8.56],
      6: [8.81,7.26,6.60,6.23,5.99,5.82,5.60,5.46,5.17],
      8: [7.57,6.06,5.42,5.05,4.82,4.65,4.43,4.30,4.00],
      10: [6.94,5.46,4.83,4.47,4.24,4.07,3.85,3.72,3.42],
      12: [6.55,5.10,4.47,4.12,3.89,3.73,3.51,3.37,3.07],
      15: [6.20,4.77,4.15,3.80,3.58,3.41,3.20,3.06,2.76],
      20: [5.87,4.46,3.86,3.51,3.29,3.13,2.91,2.77,2.46],
      30: [5.57,4.18,3.59,3.25,3.03,2.87,2.65,2.51,2.20],
      60: [5.29,3.93,3.34,3.01,2.79,2.63,2.41,2.27,1.94],
    };
    const c = cols.reduce((b, v) => (Math.abs(v - df1) < Math.abs(b - df1) ? v : b), cols[0]);
    const rk = Object.keys(rows).map(Number).reduce((b, v) => (Math.abs(v - df2) < Math.abs(b - df2) ? v : b), 2);
    return rows[rk][cols.indexOf(c)];
  },

  tTest(a, ref) {
    const m = S.mean(a), se = S.se(a), df = a.length - 1;
    const t = Math.abs((m - ref) / se);
    const tc = S.tCrit95(df);
    return { t, df, tCrit: tc, significant: t > tc, mean: m, se };
  },

  // Two-sample F-test for equality of variances (two-tailed, 95 %). F = larger s² / smaller s².
  fTest(a, b) {
    const va = S.variance(a), vb = S.variance(b);
    const aLarger = va >= vb;
    const larger = aLarger ? va : vb, smaller = aLarger ? vb : va;
    const df1 = (aLarger ? a.length : b.length) - 1;   // df of the larger variance (numerator)
    const df2 = (aLarger ? b.length : a.length) - 1;   // df of the smaller variance (denominator)
    const F = smaller > 0 ? larger / smaller : Infinity;
    const fCrit = S.fCrit975(df1, df2);
    return { va, vb, sa: Math.sqrt(va), sb: Math.sqrt(vb), F, df1, df2, fCrit, significant: F > fCrit, aLarger };
  },

  // Two-sample (independent) Student t-test, two-tailed 95 %. pooled = equal-variance; else Welch–Satterthwaite.
  tTest2(a, b, pooled) {
    const n1 = a.length, n2 = b.length;
    const m1 = S.mean(a), m2 = S.mean(b);
    const v1 = S.variance(a), v2 = S.variance(b);
    const diff = m1 - m2;
    if (pooled) {
      const sp2 = ((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2);
      const sp = Math.sqrt(sp2);
      const se = sp * Math.sqrt(1 / n1 + 1 / n2);
      const df = n1 + n2 - 2;
      const t = se > 0 ? Math.abs(diff) / se : Infinity;
      const tCrit = S.tCrit95(df);
      return { pooled: true, n1, n2, m1, m2, v1, v2, diff, sp2, sp, se, df, t, tCrit, significant: t > tCrit };
    }
    const se = Math.sqrt(v1 / n1 + v2 / n2);
    const df = se > 0 ? (v1 / n1 + v2 / n2) ** 2 / ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1)) : 1;
    const t = se > 0 ? Math.abs(diff) / se : Infinity;
    const tCrit = S.tCrit95(df);
    return { pooled: false, n1, n2, m1, m2, v1, v2, diff, se, df, t, tCrit, significant: t > tCrit };
  },

  anova1(groups) {
    const all = groups.flat();
    const N = all.length, p = groups.length;
    const gm = S.mean(all);
    let ssb = 0, ssw = 0;
    groups.forEach((g) => {
      const m = S.mean(g);
      ssb += g.length * (m - gm) ** 2;
      g.forEach((v) => (ssw += (v - m) ** 2));
    });
    const dfb = p - 1, dfw = N - p;
    const msb = ssb / dfb, msw = ssw / dfw;
    const f = msb / msw;
    const nBar = N / p;
    const sr = Math.sqrt(msw);
    const sBetween = msb > msw ? Math.sqrt((msb - msw) / nBar) : 0;
    const sI = Math.sqrt(sr ** 2 + sBetween ** 2);
    return { N, p, gm, ssb, ssw, dfb, dfw, msb, msw, f, fCrit: S.fCrit95(dfb, dfw), sr, sBetween, sI };
  },

  grubbs(a) {
    if (a.length < 3) return null;
    const m = S.mean(a), s = S.sd(a);
    if (s === 0) return { G: 0, crit: 99, outlierIdx: -1 };
    let G = 0, idx = -1;
    a.forEach((v, i) => {
      const g = Math.abs(v - m) / s;
      if (g > G) { G = g; idx = i; }
    });
    const tab = { 3:1.153,4:1.463,5:1.672,6:1.822,7:1.938,8:2.032,9:2.110,10:2.176,12:2.285,15:2.409,20:2.557,30:2.745 };
    const ks = Object.keys(tab).map(Number);
    let crit = tab[30];
    for (const k of ks) if (a.length <= k) { crit = tab[k]; break; }
    return { G, crit, outlierIdx: G > crit ? idx : -1, outlierVal: a[idx] };
  },
};

const fmt = (v, d = 4) => (v === null || v === undefined || isNaN(v) ? "—" : (+v).toFixed(d));
const fmtSig = (v, d = 4) => (v === null || v === undefined || isNaN(v) ? "—" : (+v).toPrecision(d));

/* ════════════════════════════════════════════════════════════════
   THEME — shadcn CSS variable system, light + dark
   ════════════════════════════════════════════════════════════════ */
const THEME_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

.lvp-root {
  --background: 60 9% 98%;
  --foreground: 200 15% 12%;
  --card: 0 0% 100%;
  --card-foreground: 200 15% 12%;
  --popover: 0 0% 100%;
  --popover-foreground: 200 15% 12%;
  --primary: 174 84% 24%;
  --primary-foreground: 0 0% 100%;
  --secondary: 173 30% 94%;
  --secondary-foreground: 174 60% 18%;
  --muted: 60 5% 94%;
  --muted-foreground: 200 8% 42%;
  --accent: 173 40% 92%;
  --accent-foreground: 174 60% 18%;
  --destructive: 0 72% 45%;
  --destructive-foreground: 0 0% 100%;
  --border: 200 12% 88%;
  --input: 200 12% 86%;
  --ring: 174 84% 30%;
  --radius: 0.55rem;
  font-family: 'Space Grotesk', system-ui, sans-serif;
  background: hsl(var(--background));
  color: hsl(var(--foreground));
}
.lvp-root.dark {
  --background: 195 22% 8%;
  --foreground: 180 12% 90%;
  --card: 196 22% 11%;
  --card-foreground: 180 12% 90%;
  --popover: 196 22% 11%;
  --popover-foreground: 180 12% 90%;
  --primary: 172 66% 45%;
  --primary-foreground: 196 30% 8%;
  --secondary: 195 18% 16%;
  --secondary-foreground: 172 40% 80%;
  --muted: 195 16% 15%;
  --muted-foreground: 190 8% 58%;
  --accent: 174 30% 18%;
  --accent-foreground: 172 50% 78%;
  --destructive: 0 62% 52%;
  --destructive-foreground: 0 0% 98%;
  --border: 195 15% 20%;
  --input: 195 15% 22%;
  --ring: 172 66% 45%;
}
.lvp-root .font-data, .lvp-root table, .lvp-root input[type=number] {
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
}
/* Global dark tokens so Radix portals (Select / Popover / Calendar mount on <body>, outside .lvp-root) stay themed */
.dark {
  --background: 195 22% 8%; --foreground: 180 12% 90%;
  --card: 196 22% 11%; --card-foreground: 180 12% 90%;
  --popover: 196 22% 11%; --popover-foreground: 180 12% 90%;
  --primary: 172 66% 45%; --primary-foreground: 196 30% 8%;
  --secondary: 195 18% 16%; --secondary-foreground: 172 40% 80%;
  --muted: 195 16% 15%; --muted-foreground: 190 8% 58%;
  --accent: 174 30% 18%; --accent-foreground: 172 50% 78%;
  --destructive: 0 62% 52%; --destructive-foreground: 0 0% 98%;
  --border: 195 15% 20%; --input: 195 15% 22%; --ring: 172 66% 45%;
}
/* Remove native number spinners everywhere — themed steppers are supplied by NumberInput */
input[type=number]::-webkit-outer-spin-button,
input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
input[type=number] { -moz-appearance: textfield; appearance: textfield; }
/* Portaled Radix content inherits the app font + monospace helper */
[data-radix-popper-content-wrapper] { font-family: 'Space Grotesk', system-ui, sans-serif; }
[data-radix-popper-content-wrapper] .font-data { font-family: 'IBM Plex Mono', ui-monospace, monospace; }
.lvp-root ::-webkit-scrollbar { width: 8px; height: 8px; }
.lvp-root ::-webkit-scrollbar-thumb { background: hsl(var(--border)); border-radius: 4px; }
@media print {
  .lvp-no-print { display: none !important; }
  .lvp-print-area { display: block !important; max-width: 100% !important; }
  .lvp-root { background: #fff !important; }
}
`;

const chartTheme = (dark) => ({
  grid: dark ? "hsl(195 15% 20%)" : "hsl(200 12% 88%)",
  axis: dark ? "hsl(190 8% 58%)" : "hsl(200 8% 42%)",
  primary: dark ? "hsl(172 66% 50%)" : "hsl(174 84% 27%)",
  ok: dark ? "#34d399" : "#059669",
  warn: dark ? "#fbbf24" : "#d97706",
  bad: dark ? "#f87171" : "#dc2626",
  violet: dark ? "#a78bfa" : "#7c3aed",
  tooltip: {
    background: dark ? "hsl(196 22% 13%)" : "#fff",
    border: `1px solid ${dark ? "hsl(195 15% 22%)" : "hsl(200 12% 86%)"}`,
    borderRadius: 8, fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
    color: dark ? "hsl(180 12% 90%)" : "hsl(200 15% 12%)",
  },
  // Recharts colours each tooltip row from the series colour by default, which
  // is unreadable on the dark card — force high-contrast text explicitly.
  tooltipItem: { color: dark ? "hsl(180 12% 90%)" : "hsl(200 15% 12%)" },
  tooltipLabel: { color: dark ? "hsl(185 10% 70%)" : "hsl(200 12% 35%)", fontWeight: 600, marginBottom: 2 },
});

/* ════════════════════════════════════════════════════════════════
   SMALL SHARED COMPONENTS
   ════════════════════════════════════════════════════════════════ */
const StatusBadge = ({ s }) => {
  if (s === "pass") return <Badge className="bg-emerald-600/15 text-emerald-600 border border-emerald-600/30 hover:bg-emerald-600/15 gap-1"><CheckCircle2 className="h-3 w-3" />Pass</Badge>;
  if (s === "fail") return <Badge className="bg-red-600/15 text-red-500 border border-red-600/30 hover:bg-red-600/15 gap-1"><XCircle className="h-3 w-3" />Fail</Badge>;
  if (s === "warn") return <Badge className="bg-amber-500/15 text-amber-600 border border-amber-500/30 hover:bg-amber-500/15 gap-1"><AlertTriangle className="h-3 w-3" />Review</Badge>;
  return <Badge variant="outline" className="text-muted-foreground gap-1"><CircleDashed className="h-3 w-3" />Pending</Badge>;
};

/* Themed shadcn tooltip wrapper — replaces native `title` hints. Pass the
   trigger (usually a Button) as the single child; `label` is the tooltip text. */
const Hint = ({ label, side = "bottom", className = "", children }) => (
  <Tooltip>
    <TooltipTrigger asChild>{children}</TooltipTrigger>
    <TooltipContent side={side} className={className}>{label}</TooltipContent>
  </Tooltip>
);

const Stat = ({ label, value, unit, status }) => (
  <div className={`rounded-lg border px-3.5 py-2.5 bg-card min-w-[110px] ${
    status === "pass" ? "border-emerald-600/40" : status === "fail" ? "border-red-600/40" : "border-border"}`}>
    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
    <div className={`font-data text-base font-semibold mt-0.5 ${
      status === "pass" ? "text-emerald-600" : status === "fail" ? "text-red-500" : "text-foreground"}`}>
      {value}{unit && <span className="text-[11px] text-muted-foreground ml-1 font-normal">{unit}</span>}
    </div>
  </div>
);

const FieldLabel = ({ children }) => (
  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{children}</Label>
);

const NSelect = ({ label, value, onChange, options, className = "" }) => (
  <div className={`flex flex-col gap-1.5 ${className}`}>
    {label && <FieldLabel>{label}</FieldLabel>}
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 bg-card text-foreground">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  </div>
);

/** Number input with themed stepper chevrons (native browser spinners are hidden via CSS). */
const NumberInput = ({ value, onChange, step = "any", className = "", ...props }) => {
  const stepNum = step === "any" || step == null ? 1 : Number(step) || 1;
  const emit = (v) => onChange && onChange({ target: { value: v === "" ? "" : String(v) } });
  const bump = (dir) => {
    const cur = value === "" || value === null || value === undefined || isNaN(value) ? 0 : Number(value);
    emit(+(cur + dir * stepNum).toPrecision(12));
  };
  return (
    <div className="relative">
      <Input type="number" value={value} step={step} onChange={onChange}
        className={`h-9 bg-card pr-7 ${className}`} {...props} />
      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col gap-px">
        <button type="button" tabIndex={-1} aria-label="Increment" onClick={() => bump(1)}
          className="flex h-3.5 w-5 items-center justify-center rounded-t-[3px] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors">
          <ChevronUp className="h-3 w-3" />
        </button>
        <button type="button" tabIndex={-1} aria-label="Decrement" onClick={() => bump(-1)}
          className="flex h-3.5 w-5 items-center justify-center rounded-b-[3px] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors">
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
};

/** shadcn Popover + Calendar date picker. Value/onChange use ISO yyyy-MM-dd strings (event-shaped). */
const DatePicker = ({ value, onChange, className = "" }) => {
  const [open, setOpen] = useState(false);
  const selected = value ? parseISO(value) : undefined;
  const valid = selected && isValidDate(selected);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline"
          className={`h-9 w-full justify-start gap-2 bg-card font-normal ${valid ? "" : "text-muted-foreground"} ${className}`}>
          <CalendarIcon className="h-4 w-4 opacity-70" />
          {valid ? formatDate(selected, "d MMM yyyy") : "Pick a date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={valid ? selected : undefined} defaultMonth={valid ? selected : undefined}
          onSelect={(dt) => { onChange && onChange({ target: { value: dt ? formatDate(dt, "yyyy-MM-dd") : "" } }); setOpen(false); }} />
      </PopoverContent>
    </Popover>
  );
};

const Field = ({ label, className = "", type, ...props }) => (
  <div className={`flex flex-col gap-1.5 ${className}`}>
    {label && <FieldLabel>{label}</FieldLabel>}
    {type === "number"
      ? <NumberInput {...props} />
      : type === "date"
      ? <DatePicker value={props.value} onChange={props.onChange} />
      : <Input type={type} className="h-9 bg-card" {...props} />}
  </div>
);

/* Confirmation helper, supplied by the App. Default just runs the action (no
   provider = no confirm), so RepGrid keeps working in isolation / tests. */
const ConfirmContext = createContext((_message, onConfirm) => onConfirm?.());

/** Chip-style editable numeric replicate list */
const RepGrid = ({ values, onChange, label, outlierIdx = -1 }) => {
  const askDelete = useContext(ConfirmContext);
  return (
  <div>
    {label && <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">{label}</div>}
    <div className="flex flex-wrap gap-1.5 items-center">
      {values.map((v, i) => (
        <div key={i} className="relative group">
          <input type="number" step="any" value={v}
            onChange={(e) => { const nv = [...values]; nv[i] = e.target.value === "" ? "" : +e.target.value; onChange(nv); }}
            className={`w-[84px] h-8 rounded-md border bg-card px-2 text-[13px] font-data text-foreground focus:outline-none focus:ring-2 focus:ring-ring ${
              i === outlierIdx ? "border-red-500 text-red-500" : "border-input"}`} />
          <button onClick={() => {
              const del = () => onChange(values.filter((_, k) => k !== i));
              // An empty cell holds no data — remove it straight away; only confirm when a value would be lost.
              if (v === "" || v === null || v === undefined) { del(); return; }
              askDelete(`The replicate value ${v} will be removed.`, del, "Delete this value?");
            }}
            className="absolute -top-1.5 -right-1.5 hidden group-hover:flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[9px]">×</button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="h-8 px-2.5" onClick={() => onChange([...values, ""])}>
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  </div>
  );
};

const DataTable = ({ headers, rows }) => (
  <div className="overflow-x-auto rounded-lg border border-border">
    <table className="w-full text-[12px] border-collapse">
      <thead>
        <tr className="bg-muted">
          {headers.map((h, i) => (
            <th key={i} className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold whitespace-nowrap border-b border-border">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri} className={ri % 2 ? "bg-muted/40" : ""}>
            {r.map((c, ci) => <td key={ci} className="px-3 py-1.5 border-b border-border/40 whitespace-nowrap">{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const GuideNote = ({ children }) => (
  <div className="flex gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
    <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
    <div>{children}</div>
  </div>
);

/** Collapsible "show the working" panel. steps = [{ label, formula, note }] */
const WorkSteps = ({ steps, title = "Show calculation steps" }) => {
  const [open, setOpen] = useState(false);
  const list = (steps || []).filter(Boolean);
  if (!list.length) return null;
  return (
    <div className="rounded-lg border border-border bg-muted/20">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3.5 py-2.5 text-[12px] font-medium text-foreground hover:bg-muted/40 rounded-lg">
        <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
        <Sigma className="h-3.5 w-3.5 text-primary shrink-0" />
        {title}
      </button>
      {open && (
        <ol className="px-4 pb-4 pt-1 space-y-2.5">
          {list.map((st, i) => (
            <li key={i} className="text-[12px]">
              {st.label && <div className="text-muted-foreground mb-1">{st.label}</div>}
              {st.formula && (
                <div className="font-data text-[12px] text-foreground bg-card border border-border rounded-md px-2.5 py-1.5 overflow-x-auto whitespace-pre-wrap break-words">
                  {st.formula}
                </div>
              )}
              {st.note && <div className="text-[11px] text-muted-foreground mt-1">{st.note}</div>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

/* Standard-normal CDF (Abramowitz & Stegun 7.1.26) — used to label the α/β
   error probabilities on the LOD/LOQ distribution chart. */
const normCdf = (z) => {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
};

/* Log-gamma (Lanczos, g = 7) — needed for the Beta normaliser of the F density. */
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

/* F-distribution probability density at x for (d1, d2) degrees of freedom.
   Drawn as the reference curve behind the F-test statistic. */
const fPdf = (x, d1, d2) => {
  if (x <= 0) return 0;
  const lnB = lgamma(d1 / 2) + lgamma(d2 / 2) - lgamma((d1 + d2) / 2);
  const lnNum = (d1 / 2) * Math.log(d1 / d2) + (d1 / 2 - 1) * Math.log(x)
    - ((d1 + d2) / 2) * Math.log(1 + (d1 / d2) * x);
  return Math.exp(lnNum - lnB);
};

/* Two-line marker for the LOD/LOQ distribution chart: the name (LOD, LOQ …)
   over its concentration value, drawn just above the plotting area. */
const CurveMarkerLabel = ({ viewBox, name, value, color }) => {
  if (!viewBox) return null;
  const { x, y } = viewBox;
  return (
    <g pointerEvents="none">
      <text x={x} y={y - 13} textAnchor="middle" fill={color} fontSize={10} fontWeight={600}>{name}</text>
      <text x={x} y={y - 2} textAnchor="middle" fill={color} fillOpacity={0.8} fontSize={9}
        fontFamily="'IBM Plex Mono', monospace">{value}</text>
    </g>
  );
};

/* Hover tooltip: the measured value plus each distribution's relative height
   (as a % of its own peak) at that point — so the crossover at LC is visible. */
const DistTooltip = ({ active, payload, label, C, unit }) => {
  if (!active || !payload || !payload.length) return null;
  const rows = [
    { key: "blank", name: "Blank", color: C.axis },
    { key: "atLod", name: "At LOD", color: C.bad },
    { key: "atLoq", name: "At LOQ", color: C.primary },
  ];
  const valOf = (k) => { const p = payload.find((r) => r.dataKey === k); return p ? p.value : null; };
  return (
    <div style={{ ...C.tooltip, padding: "6px 9px", minWidth: 128 }}>
      <div style={{ ...C.tooltipLabel }}>{fmtSig(label, 4)} {unit}</div>
      {rows.map((r) => {
        const v = valOf(r.key);
        return (
          <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 6, ...C.tooltipItem }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: r.color, display: "inline-block", flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{r.name}</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{v == null ? "—" : (v * 100).toFixed(0) + " %"}</span>
          </div>
        );
      })}
    </div>
  );
};

/* Conceptual normal-distribution view of LOD/LOQ, mirroring the classic
   Eurachem/IUPAC detection-limit figure: the blank's noise, a sample at the
   LOD and a sample at the LOQ are drawn as bell curves of equal width (s′₀).
   The decision limit LC sits midway between the blank and the LOD, so the
   false-positive (α) and false-negative (β) tails are equal. Works for every
   non-USEPA approach — s′₀ is taken directly when available, otherwise it is
   recovered from LOD/3 (the calibration route). */
const LodDistributionChart = ({ lod, kQ, unit, C }) => {
  if (!lod || lod.lod == null || lod.loq == null) return null;
  const sigma = lod.s0p && lod.s0p > 0 ? lod.s0p : lod.lod > 0 ? lod.lod / 3 : 0;
  if (!(sigma > 0) || !isFinite(lod.loq)) return null;
  const mu = Number.isFinite(lod.mean) ? lod.mean : 0;      // blank centre
  const lodC = mu + lod.lod;                                // LOD curve centre = μ + 3·s′₀
  const loqC = mu + lod.loq;                                // LOQ curve centre = μ + k_Q·s′₀
  const lc = mu + lod.lod / 2;                              // decision limit (α = β)
  const alpha = 1 - normCdf((lc - mu) / sigma);             // ≈ 6.7 % for the 3s rule

  const xMin = mu - 4 * sigma;
  const xMax = loqC + 4 * sigma;
  const N = 260;
  const g = (x, c) => Math.exp(-0.5 * ((x - c) / sigma) ** 2); // peak-normalised bell
  const data = [];
  for (let i = 0; i <= N; i++) {
    const x = xMin + ((xMax - xMin) * i) / N;
    const blank = g(x, mu);
    data.push({
      x,
      blank,
      atLod: g(x, lodC),
      atLoq: g(x, loqC),
      alpha: x >= lc ? blank : null,          // blank tail beyond LC → false positive
      beta: x <= lc ? g(x, lodC) : null,      // LOD tail below LC → false negative
    });
  }
  const tickF = (v) => fmtSig(v, 2);
  const pct = (p) => (p * 100 >= 1 ? (p * 100).toFixed(1) : (p * 100).toPrecision(2)) + " %";
  const Dot = ({ color, filled = false, label }) => (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={filled ? { background: color, opacity: 0.55 } : { border: `2px solid ${color}` }} />
      {label}
    </span>
  );
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">
          Distribution view — how LOD &amp; LOQ sit above the blank noise
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="h-[300px]">
          <ChartFrame>{({ ResponsiveContainer, ComposedChart, LineChart, ScatterChart, BarChart, Line, Area, Bar, Scatter, Cell, XAxis, YAxis, CartesianGrid, RTooltip, ReferenceLine, ReferenceArea, ErrorBar }) => (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 34, right: 18, bottom: 18, left: 4 }}>
              <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="x" type="number" domain={[xMin, xMax]} tickFormatter={tickF}
                tick={{ fontSize: 10, fill: C.axis }} stroke={C.grid} allowDecimals
                label={{ value: `Measured value (${unit})`, position: "insideBottom", offset: -8, fontSize: 10, fill: C.axis }} />
              <YAxis hide domain={[0, 1.18]} />
              <RTooltip content={<DistTooltip C={C} unit={unit} />}
                cursor={{ stroke: C.axis, strokeDasharray: "3 3" }} isAnimationActive={false} />
              {/* shaded decision tails */}
              <Area dataKey="alpha" stroke="none" fill={C.bad} fillOpacity={0.5} connectNulls={false} isAnimationActive={false} />
              <Area dataKey="beta" stroke="none" fill={C.warn} fillOpacity={0.45} connectNulls={false} isAnimationActive={false} />
              {/* three distributions */}
              <Area dataKey="blank" stroke={C.axis} strokeWidth={2} fill={C.axis} fillOpacity={0.06} isAnimationActive={false} />
              <Area dataKey="atLod" stroke={C.bad} strokeWidth={2} fill="none" isAnimationActive={false} />
              <Area dataKey="atLoq" stroke={C.primary} strokeWidth={2.2} fill="none" isAnimationActive={false} />
              {/* markers — name over concentration value */}
              <ReferenceLine x={mu} stroke={C.axis} strokeDasharray="2 2"
                label={<CurveMarkerLabel name="Blank" value={fmtSig(mu, 3)} color={C.axis} />} />
              <ReferenceLine x={lc} stroke={C.warn} strokeDasharray="4 3"
                label={<CurveMarkerLabel name="LC" value={fmtSig(lc, 3)} color={C.warn} />} />
              <ReferenceLine x={lodC} stroke={C.bad} strokeWidth={1.5}
                label={<CurveMarkerLabel name="LOD" value={fmtSig(lodC, 3)} color={C.bad} />} />
              <ReferenceLine x={loqC} stroke={C.primary} strokeWidth={1.5}
                label={<CurveMarkerLabel name="LOQ" value={fmtSig(loqC, 3)} color={C.primary} />} />
            </ComposedChart>
          </ResponsiveContainer>
          )}</ChartFrame>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
          <Dot color={C.axis} label="Blank (noise), width s′₀" />
          <Dot color={C.bad} label="Sample at LOD = μ + 3·s′₀" />
          <Dot color={C.primary} label={`Sample at LOQ = μ + ${fmtSig(kQ, 2)}·s′₀`} />
          <Dot color={C.bad} filled label={<>α (false positive) ≈ {pct(alpha)}</>} />
          <Dot color={C.warn} filled label={<>β (false negative) ≈ {pct(alpha)}</>} />
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Each curve is the spread of repeat measurements. The decision limit <b>LC</b> sits midway, so a blank rarely reads
          above it (<b>α</b>) and a true sample at the <b>LOD</b> rarely reads below it (<b>β</b>) — that is what &ldquo;3·s′₀&rdquo;
          buys you. At the <b>LOQ</b> the curve has pulled clear of the noise: the relative scatter falls to ≈ {pct(1 / (Number(kQ) || 10))}
          {" "}(s′₀ ÷ LOQ = 1 ÷ {fmtSig(kQ, 2)}), low enough to report a number rather than just &ldquo;detected&rdquo;.
        </p>
      </CardContent>
    </Card>
  );
};

/* Hover tooltip for the trueness / recovery charts: measured value, relative
   frequency and the signed deviation from the reference (true value or 100 %). */
const TruenessTooltip = ({ active, payload, label, C, unit, refVal, refName = "vs true" }) => {
  if (!active || !payload || !payload.length) return null;
  const yp = payload.find((p) => p.dataKey === "y");
  const y = yp ? yp.value : null;
  const dev = Number.isFinite(refVal) ? label - refVal : null;
  return (
    <div style={{ ...C.tooltip, padding: "6px 9px", minWidth: 140 }}>
      <div style={{ ...C.tooltipLabel }}>{fmtSig(label, 4)} {unit}</div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, ...C.tooltipItem }}>
        <span>Frequency</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{y == null ? "—" : (y * 100).toFixed(0) + " %"}</span>
      </div>
      {dev != null && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, ...C.tooltipItem }}>
          <span>{refName}</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{(dev >= 0 ? "+" : "") + fmtSig(dev, 3)} {unit}</span>
        </div>
      )}
    </div>
  );
};

/* Trueness/bias distribution — mirrors the classic accuracy figure: the blue
   curve is the spread of repeat measurements (random error → precision, ±2σ);
   the gap between its centre μ and the red true/reference value is the bias
   (systematic error → trueness). Accuracy is the two combined. A faint red
   band marks the CRM's own expanded uncertainty around the reference. */
const TruenessDistributionChart = ({ mean, sd, refVal, refU, bias, unit, C }) => {
  if (![mean, sd, refVal].every(Number.isFinite) || !(sd > 0)) return null;
  const mu = mean, sigma = sd;
  const xMin = Math.min(refVal, mu - 3.6 * sigma) - 0.5 * sigma;
  const xMax = Math.max(refVal, mu + 3.6 * sigma) + 0.5 * sigma;
  const span = xMax - xMin;
  const N = 280;
  const g = (x) => Math.exp(-0.5 * ((x - mu) / sigma) ** 2);
  const data = [];
  for (let i = 0; i <= N; i++) {
    const x = xMin + (span * i) / N;
    const y = g(x);
    data.push({ x, y, band: x >= mu - 2 * sigma && x <= mu + 2 * sigma ? y : null });
  }
  const showBias = Math.abs(mu - refVal) > span * 0.012;
  const coincide = Math.abs(mu - refVal) < span * 0.045;
  const withinU = Number.isFinite(refU) && refU > 0 ? Math.abs(bias) <= refU : null;
  const biasPct = refVal !== 0 ? (bias / refVal) * 100 : null;
  const sigLines = [mu - 2 * sigma, mu - sigma, mu + sigma, mu + 2 * sigma];
  const Dot = ({ color, filled, label: lbl }) => (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={filled ? { background: color, opacity: 0.5 } : { border: `2px solid ${color}` }} />
      {lbl}
    </span>
  );
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">
          Distribution view — measurement spread vs the true value
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="h-[300px]">
          <ChartFrame>{({ ResponsiveContainer, ComposedChart, LineChart, ScatterChart, BarChart, Line, Area, Bar, Scatter, Cell, XAxis, YAxis, CartesianGrid, RTooltip, ReferenceLine, ReferenceArea, ErrorBar }) => (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 34, right: 18, bottom: 18, left: 4 }}>
              <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="x" type="number" domain={[xMin, xMax]} tickFormatter={(v) => fmtSig(v, 2)}
                tick={{ fontSize: 10, fill: C.axis }} stroke={C.grid} allowDecimals
                label={{ value: `Measurement value (${unit})`, position: "insideBottom", offset: -8, fontSize: 10, fill: C.axis }} />
              <YAxis hide domain={[0, 1.18]} />
              <RTooltip content={<TruenessTooltip C={C} unit={unit} refVal={refVal} />}
                cursor={{ stroke: C.axis, strokeDasharray: "3 3" }} isAnimationActive={false} />
              {/* CRM expanded-uncertainty band around the reference */}
              {Number.isFinite(refU) && refU > 0 && (
                <ReferenceArea x1={refVal - refU} x2={refVal + refU} y1={0} y2={1.18} fill={C.bad} fillOpacity={0.07} stroke="none" />
              )}
              {/* bias gap (systematic error) */}
              {showBias && (
                <ReferenceArea x1={Math.min(refVal, mu)} x2={Math.max(refVal, mu)} y1={0} y2={1.18}
                  fill={C.ok} fillOpacity={0.1} stroke="none"
                  label={{ value: "Bias", position: "top", fill: C.ok, fontSize: 10, fontWeight: 600 }} />
              )}
              {/* ±2σ precision band + measurement curve */}
              <Area dataKey="band" stroke="none" fill={C.primary} fillOpacity={0.14} connectNulls={false} isAnimationActive={false} />
              <Area dataKey="y" stroke={C.primary} strokeWidth={2.2} fill="none" isAnimationActive={false} />
              {/* ±σ / ±2σ grid */}
              {sigLines.map((sx, i) => <ReferenceLine key={i} x={sx} stroke={C.grid} strokeDasharray="2 3" />)}
              {/* markers */}
              <ReferenceLine x={refVal} stroke={C.bad} strokeDasharray="5 3" strokeWidth={1.5}
                label={coincide ? undefined : <CurveMarkerLabel name="True value" value={fmtSig(refVal, 3)} color={C.bad} />} />
              <ReferenceLine x={mu} stroke={C.ok} strokeDasharray="5 3" strokeWidth={1.5}
                label={<CurveMarkerLabel name={coincide ? "μ ≈ true" : "μ (mean)"} value={fmtSig(mu, 3)} color={C.ok} />} />
            </ComposedChart>
          </ResponsiveContainer>
          )}</ChartFrame>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
          <Dot color={C.primary} label="Measurements (spread = ±2σ)" />
          <Dot color={C.bad} label="True / reference value" />
          <Dot color={C.ok} filled label="Bias (systematic error)" />
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          The blue curve is the spread of repeat measurements — its width (<b>±2σ</b>) is the <b>random error</b>, i.e. <b>precision</b>.
          The gap between its centre <b>μ</b> and the <b>true value</b> is the <b>bias</b> (systematic error) → <b>trueness</b>;
          the two together make up <b>accuracy</b>. Here bias = {fmtSig(bias, 3)} {unit}
          {biasPct != null && <> ({fmt(biasPct, 2)} %)</>}
          {withinU != null && <>, {withinU ? "within" : "outside"} the CRM&rsquo;s expanded uncertainty (±{fmtSig(refU, 3)} {unit})</>}.
        </p>
      </CardContent>
    </Card>
  );
};

/* Spike-recovery distribution — the recovery estimate as a bell curve around
   the measured %, its confidence interval (± t·u) shaded, the 100 % target and
   the method acceptance window. If the target 100 % falls inside the CI the
   recovery is not significantly different from 100 %; if it falls inside the
   acceptance window the method passes. */
const RecoveryDistributionChart = ({ recovery, sdRec, tCrit, significant, recMin, recMax, C }) => {
  if (!Number.isFinite(recovery) || !Number.isFinite(sdRec) || !(sdRec > 0)) return null;
  const R = recovery, sigma = sdRec, target = 100;
  const ci = Number.isFinite(tCrit) && tCrit > 0 ? tCrit * sigma : 2 * sigma;
  const hasWin = Number.isFinite(recMin) && Number.isFinite(recMax) && recMax > recMin;
  const lo = Math.min(R - 3.6 * sigma, target, hasWin ? recMin : Infinity);
  const hi = Math.max(R + 3.6 * sigma, target, hasWin ? recMax : -Infinity);
  const span = hi - lo || 1;
  const xMin = lo - span * 0.05;
  const xMax = hi + span * 0.05;
  const N = 280;
  const g = (x) => Math.exp(-0.5 * ((x - R) / sigma) ** 2);
  const data = [];
  for (let i = 0; i <= N; i++) {
    const x = xMin + ((xMax - xMin) * i) / N;
    const y = g(x);
    data.push({ x, y, ci: x >= R - ci && x <= R + ci ? y : null });
  }
  const coincide = Math.abs(R - target) < (xMax - xMin) * 0.045;
  const inWindow = hasWin ? R >= recMin && R <= recMax : null;
  const Dot = ({ color, filled, label: lbl }) => (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={filled ? { background: color, opacity: 0.5 } : { border: `2px solid ${color}` }} />
      {lbl}
    </span>
  );
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">
          Distribution view — recovery vs the 100 % target
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="h-[300px]">
          <ChartFrame>{({ ResponsiveContainer, ComposedChart, LineChart, ScatterChart, BarChart, Line, Area, Bar, Scatter, Cell, XAxis, YAxis, CartesianGrid, RTooltip, ReferenceLine, ReferenceArea, ErrorBar }) => (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 34, right: 18, bottom: 18, left: 4 }}>
              <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="x" type="number" domain={[xMin, xMax]} tickFormatter={(v) => fmt(v, 0)}
                tick={{ fontSize: 10, fill: C.axis }} stroke={C.grid} allowDecimals
                label={{ value: "Recovery (%)", position: "insideBottom", offset: -8, fontSize: 10, fill: C.axis }} />
              <YAxis hide domain={[0, 1.18]} />
              <RTooltip content={<TruenessTooltip C={C} unit="%" refVal={target} refName="vs 100 %" />}
                cursor={{ stroke: C.axis, strokeDasharray: "3 3" }} isAnimationActive={false} />
              {/* method acceptance window */}
              {hasWin && (
                <ReferenceArea x1={recMin} x2={recMax} y1={0} y2={1.18} fill={C.ok} fillOpacity={0.06} stroke="none" />
              )}
              {/* confidence interval (± t·u) + recovery curve */}
              <Area dataKey="ci" stroke="none" fill={C.primary} fillOpacity={0.14} connectNulls={false} isAnimationActive={false} />
              <Area dataKey="y" stroke={C.primary} strokeWidth={2.2} fill="none" isAnimationActive={false} />
              {/* acceptance limits */}
              {hasWin && <>
                <ReferenceLine x={recMin} stroke={C.warn} strokeDasharray="4 3"
                  label={<CurveMarkerLabel name="Lower" value={`${fmt(recMin, 0)} %`} color={C.warn} />} />
                <ReferenceLine x={recMax} stroke={C.warn} strokeDasharray="4 3"
                  label={<CurveMarkerLabel name="Upper" value={`${fmt(recMax, 0)} %`} color={C.warn} />} />
              </>}
              {/* 100 % target + measured recovery */}
              <ReferenceLine x={target} stroke={C.ok} strokeDasharray="5 3" strokeWidth={1.5}
                label={coincide ? undefined : <CurveMarkerLabel name="Target" value="100 %" color={C.ok} />} />
              <ReferenceLine x={R} stroke={C.violet} strokeDasharray="5 3" strokeWidth={1.5}
                label={<CurveMarkerLabel name={coincide ? "R ≈ 100 %" : "Recovery"} value={`${fmt(R, 1)} %`} color={C.violet} />} />
            </ComposedChart>
          </ResponsiveContainer>
          )}</ChartFrame>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
          <Dot color={C.primary} label="Recovery estimate (± t·u shaded)" />
          <Dot color={C.violet} label={`Measured recovery ${fmt(R, 1)} %`} />
          <Dot color={C.ok} label="100 % target" />
          {hasWin && <Dot color={C.ok} filled label={`Acceptance window ${fmt(recMin, 0)}–${fmt(recMax, 0)} %`} />}
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          The blue curve is how well the recovery is known; the shaded band is its <b>{Number.isFinite(tCrit) ? "95 % confidence interval" : "spread"}</b> (± t·u).
          The <b>100 % target</b> falls <b>{significant ? "outside" : "inside"}</b> that band, so the recovery is <b>{significant ? "significantly different from" : "not significantly different from"}</b> 100 %.
          {inWindow != null && <> The measured {fmt(R, 1)} % also sits <b>{inWindow ? "inside" : "outside"}</b> the {fmt(recMin, 0)}–{fmt(recMax, 0)} % acceptance window.</>}
        </p>
      </CardContent>
    </Card>
  );
};

/* F-distribution reference curve for the variance F-test: the density for
   (df1, df2), the upper-tail rejection region beyond F crit, and where the
   observed F statistic falls. F inside the shaded tail → variances differ. */
const FDistributionChart = ({ df1, df2, F, fCrit, significant, C }) => {
  if (![df1, df2, fCrit].every(Number.isFinite) || !(fCrit > 0)) return null;
  const capped = !Number.isFinite(F) || F > fCrit * 3;      // keep the axis readable if F is huge
  const Fx = capped ? fCrit * 3 : F;
  const xMax = Math.max(Fx, fCrit, 3) * 1.4;
  const Npt = 240;
  const x0 = xMax / Npt;                                     // skip the x = 0 singularity
  const raw = [];
  for (let i = 0; i <= Npt; i++) {
    const x = x0 + ((xMax - x0) * i) / Npt;
    raw.push({ x, y: fPdf(x, df1, df2) });
  }
  const norm = Math.max(...raw.map((r) => r.y).filter(Number.isFinite)) || 1;
  const data = raw.map((r) => {
    const y = Math.min(r.y / norm, 1.12);
    return { x: r.x, y, reject: r.x >= fCrit ? y : null };
  });
  const Dot = ({ color, filled, label: lbl }) => (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={filled ? { background: color, opacity: 0.5 } : { border: `2px solid ${color}` }} />
      {lbl}
    </span>
  );
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">F-test — variance distribution (df {df1}, {df2})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="h-[260px]">
          <ChartFrame>{({ ResponsiveContainer, ComposedChart, LineChart, ScatterChart, BarChart, Line, Area, Bar, Scatter, Cell, XAxis, YAxis, CartesianGrid, RTooltip, ReferenceLine, ReferenceArea, ErrorBar }) => (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 30, right: 18, bottom: 18, left: 4 }}>
              <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="x" type="number" domain={[0, xMax]} tickFormatter={(v) => fmt(v, 1)}
                tick={{ fontSize: 10, fill: C.axis }} stroke={C.grid} allowDecimals
                label={{ value: "F value", position: "insideBottom", offset: -8, fontSize: 10, fill: C.axis }} />
              <YAxis hide domain={[0, 1.18]} />
              <RTooltip contentStyle={C.tooltip} itemStyle={C.tooltipItem} labelStyle={C.tooltipLabel}
                formatter={(v, n) => [fmt(v, 3), n === "reject" ? "rejection tail" : "density"]}
                labelFormatter={(l) => `F = ${fmt(l, 2)}`} isAnimationActive={false} />
              <Area dataKey="reject" stroke="none" fill={C.bad} fillOpacity={0.35} connectNulls={false} isAnimationActive={false} />
              <Area dataKey="y" stroke={C.primary} strokeWidth={2.2} fill="none" isAnimationActive={false} />
              <ReferenceLine x={fCrit} stroke={C.warn} strokeDasharray="5 3" strokeWidth={1.5}
                label={<CurveMarkerLabel name="F crit" value={fmt(fCrit, 2)} color={C.warn} />} />
              <ReferenceLine x={Fx} stroke={significant ? C.bad : C.ok} strokeDasharray="5 3" strokeWidth={1.5}
                label={<CurveMarkerLabel name={capped ? "F (≫)" : "F"} value={fmt(F, 2)} color={significant ? C.bad : C.ok} />} />
            </ComposedChart>
          </ResponsiveContainer>
          )}</ChartFrame>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
          <Dot color={C.primary} label={`F density (df ${df1}, ${df2})`} />
          <Dot color={C.bad} filled label="Rejection tail (α = 0.025)" />
          <Dot color={C.warn} label={`F crit = ${fmt(fCrit, 2)}`} />
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          The curve is the expected spread of the variance ratio when the two variances are truly equal. The red tail beyond
          {" "}<b>F crit = {fmt(fCrit, 2)}</b> is the 2.5 % upper rejection region (two-tailed 95 %). The observed
          {" "}<b>F = {fmt(F, 2)}</b> falls <b>{significant ? "inside" : "outside"}</b> it → the variances
          {" "}<b>{significant ? "differ significantly" : "are comparable"}</b>, which selects the {significant ? "Welch" : "pooled"} t-test.
        </p>
      </CardContent>
    </Card>
  );
};

const CriteriaRow = ({ label, value, onChange, unit }) => (
  <div className="flex items-center gap-2 text-[12px]">
    <span className="text-muted-foreground w-44 shrink-0">{label}</span>
    <Input type="number" step="any" value={value} onChange={(e) => onChange(e.target.value === "" ? "" : +e.target.value)}
      className="h-7 w-24 bg-card font-data text-[12px]" />
    {unit && <span className="text-muted-foreground">{unit}</span>}
  </div>
);

/* ════════════════════════════════════════════════════════════════
   DEFAULT STUDY STATE
   ════════════════════════════════════════════════════════════════ */
const defaultStudy = () => ({
  info: {
    title: "", id: "", version: "1.0", analyst: "ChM. Ts. Hadi Fauzi, MRSC", reviewer: "",
    date: new Date().toISOString().slice(0, 10), lab: "",
    type: "validation", status: "Draft", standard: "",
    analyte: "", matrix: "", technique: "", unit: "mg/kg", range: "",
    requirement: "", intendedUse: "",
  },
  criteria: {
    r2Min: 0.995, residPctMax: 5, rsdRMax: 5, rsdIMax: 8,
    recMin: 80, recMax: 120, robustPctMax: 2, kQ: 10,
  },
  selectivity: {
    notes: "",
    interferents: [
      { name: "", level: "", effectPct: "", acceptable: true },
    ],
  },
  linearity: {
    points: [
      { conc: 0.005, reps: [0.0102, 0.0100, 0.0101] },
      { conc: 0.01, reps: [0.0201, 0.0199, 0.0200] },
      { conc: 0.025, reps: [0.0500, 0.0503, 0.0498] },
      { conc: 0.05, reps: [0.1001, 0.0998, 0.1003] },
      { conc: 0.075, reps: [0.1506, 0.1494, 0.1500] },
      { conc: 0.1, reps: [0.2008, 0.1996, 0.2004] },
    ],
  },
  lodloq: {
    approach: "blank",         // blank | fortified | calibration
    blankType: "reagent",      // reagent | matrix (Blanks supplement)
    blankCorrected: true,
    n: 1, nb: 10,
    reps: [0.0007, 0.0008, 0.0006, 0.0007, 0.0006, 0.0009, 0.0007, 0.0006, 0.0008, 0.0007],
    slopeFromCal: true, manualSlope: "",
    // USEPA 40 CFR 136 App. B (MDL) + instrument detection limit (IDL)
    idlK: 3, spikeLevel: 0.005,
    idlReps: [0.0018, 0.0022, 0.0015, 0.0020, 0.0019, 0.0024, 0.0017],
    mdlSpiked: [0.0048, 0.0052, 0.0046, 0.0051, 0.0049, 0.0053, 0.0047],
    mdlBlank: [],
  },
  precision: {
    label: "Day",
    groups: [
      [0.0502, 0.0498, 0.0504], [0.0497, 0.0501, 0.0499], [0.0503, 0.0499, 0.0501], [0.0498, 0.0496, 0.0502],
      [0.0501, 0.0504, 0.0499], [0.0497, 0.0502, 0.0500], [0.0499, 0.0501, 0.0503], [0.0504, 0.0500, 0.0498],
    ],
    // Inter-laboratory reproducibility (Eurachem §6.6): from a collaborative trial / PT, benchmarked via Horwitz
    massFraction: 5e-8,   // 0.05 mg/kg as a dimensionless mass fraction, for the Horwitz prediction
    sRMeasured: "",       // reproducibility SD from an interlaboratory study or PT (optional)
  },
  trueness: {
    mode: "crm",
    crmRef: 0.05, crmU: 0.001,
    crmReps: [0.0498, 0.0501, 0.0504, 0.0499, 0.0502, 0.0496, 0.0500, 0.0498, 0.0502, 0.05],
    spikeMethod: "apha",   // apha (SSR−SR)/SA  |  volume  (Vspl·Cspl + Vspk·Cspk)/(Vspl+Vspk)
    spikeAmount: 0.04,
    unspiked: [0.0100, 0.0102, 0.0098, 0.0101, 0.0099],
    spiked: [0.0502, 0.0498, 0.0500, 0.0504, 0.0497],
    // Volume/mixing method: spike a Vspk of standard (conc cSpk) into Vspl of sample
    vSpl: 100, vSpk: 1, cSpk: 4.04,
  },
  recovery: {
    levels: [
      { conc: 0.01, reps: [0.0096, 0.0098, 0.0100, 0.0097, 0.0101] },
      { conc: 0.05, reps: [0.0492, 0.0501, 0.0498, 0.0503, 0.0495] },
      { conc: 0.09, reps: [0.0885, 0.0892, 0.0901, 0.0898, 0.0889] },
    ],
  },
  robustness: {
    factors: [
      { name: "Pyrolysis temperature (°C)", nominal: "800", low: "750", high: "850", resLow: 0.0496, resHigh: 0.0502 },
      { name: "Atomization temperature (°C)", nominal: "2300", low: "2200", high: "2400", resLow: 0.0498, resHigh: 0.0503 },
      { name: "Injection volume (µL)", nominal: "20", low: "18", high: "22", resLow: 0.0497, resHigh: 0.0501 },
    ],
  },
  // F-test (variances) & t-test (means) — method / operator / batch comparison
  comparison: {
    mode: "twoSample",              // twoSample (F + t) | oneSample (t vs reference value)
    labelA: "Reference method",
    labelB: "New method",
    dataA: [0.0502, 0.0498, 0.0505, 0.0500, 0.0497, 0.0503],
    dataB: [0.0509, 0.0512, 0.0506, 0.0511, 0.0504],
    refValue: 0.05,                 // certified / target value for the one-sample t-test
    srcA: "0", srcB: "1",           // which Precision groups feed A / B when prefilling
  },
});

/* A fresh, empty study for "New" — every data field cleared, keeping only
   the acceptance-criteria thresholds and the analyst name (configuration,
   not study data). Empty rows are left so the analyst can type straight in. */
const blankStudy = () => {
  const today = new Date().toISOString().slice(0, 10);
  const empty = (n) => Array.from({ length: n }, () => "");
  const rows = (n, make) => Array.from({ length: n }, make);
  return {
    info: {
      title: "", id: "", version: "1.0", analyst: "ChM. Ts. Hadi Fauzi, MRSC", reviewer: "",
      date: today, lab: "", type: "validation", status: "Draft", standard: "",
      analyte: "", matrix: "", technique: "", unit: "mg/kg", range: "",
      requirement: "", intendedUse: "",
    },
    criteria: { r2Min: 0.995, residPctMax: 5, rsdRMax: 5, rsdIMax: 8, recMin: 80, recMax: 120, robustPctMax: 2, kQ: 10 },
    selectivity: { notes: "", interferents: [{ name: "", level: "", effectPct: "", acceptable: true }] },
    linearity: { points: rows(5, () => ({ conc: "", reps: ["", "", ""] })) },
    lodloq: {
      approach: "blank", blankType: "reagent", blankCorrected: true, n: 1, nb: 10,
      reps: empty(10), slopeFromCal: true, manualSlope: "",
      idlK: 3, spikeLevel: "", idlReps: empty(7), mdlSpiked: empty(7), mdlBlank: [],
    },
    precision: { label: "Day", groups: rows(8, () => ["", "", ""]), massFraction: "", sRMeasured: "" },
    trueness: {
      mode: "crm", crmRef: "", crmU: "", crmReps: empty(10),
      spikeMethod: "apha", spikeAmount: "", unspiked: empty(5), spiked: empty(5),
      vSpl: "", vSpk: "", cSpk: "",
    },
    recovery: { levels: rows(3, () => ({ conc: "", reps: empty(5) })) },
    robustness: { factors: rows(3, () => ({ name: "", nominal: "", low: "", high: "", resLow: "", resHigh: "" })) },
    comparison: { mode: "twoSample", labelA: "", labelB: "", dataA: ["", "", ""], dataB: ["", "", ""], refValue: "", srcA: "0", srcB: "1" },
  };
};

/* ────────────────────────────────────────────────────────────────
   BUILT-IN EXAMPLES — complete, worked studies a new user can load to
   see how each module is filled in. Values are chosen so they do not
   collide with the legacy auto-migration patterns in mergeStudy().
   ──────────────────────────────────────────────────────────────── */
const buildExample = (info, mods) => {
  const s = defaultStudy();
  s.info = { ...s.info, ...info };
  return { ...s, ...mods };
};

const EXAMPLES = [
  {
    id: "ex-cu-gfaas",
    name: "Copper in insulating oil — GFAAS (full validation)",
    blurb: "Complete validation: linearity, LOD/LOQ, trueness vs CRM, ANOVA precision, recovery, ruggedness, uncertainty, and an F/t comparison vs ICP-OES.",
    study: buildExample(
      {
        title: "Determination of dissolved copper in electrical insulating oil by GFAAS",
        id: "SOP-GFAAS-CU-001", standard: "ASTM D3635-13(2021); sampling ASTM D923-15(2023)",
        analyte: "Dissolved copper (Cu)", matrix: "Petroleum-origin electrical insulating oil",
        technique: "Graphite furnace AAS (GFAAS)", unit: "mg/kg", range: "0.005–0.100 mg/kg",
        type: "validation", reviewer: "QA Manager",
        requirement: "LOQ ≤ 0.01 mg/kg; RSD ≤ 10 % near LOQ; recovery 90–110 %",
        intendedUse: "Monitor dissolved copper in new and in-service insulating oil for oil-condition and oxidation assessment.",
      },
      {
        comparison: {
          mode: "twoSample", labelA: "GFAAS (this method)", labelB: "ICP-OES (reference)",
          dataA: [0.0502, 0.0498, 0.0505, 0.0500, 0.0497, 0.0503], dataB: [0.0509, 0.0512, 0.0506, 0.0511, 0.0504],
          refValue: 0.05, srcA: "0", srcB: "1",
        },
      },
    ),
  },
  {
    id: "ex-h2o-kf",
    name: "Water in insulating oil — Karl Fischer, IEC 60814 (full validation)",
    blurb: "Complete validation of coulometric Karl Fischer titration: linearity, LOD/LOQ, ANOVA precision, trueness vs a 18 ± 2 ppm water CRM, recovery, ruggedness, and an F/t comparison vs the reference laboratory.",
    study: buildExample(
      {
        title: "Determination of water content in insulating oil by coulometric Karl Fischer titration",
        id: "SOP-KF-H2O-001", standard: "IEC 60814:1997",
        analyte: "Water content (H₂O)", matrix: "Petroleum-origin electrical insulating oil",
        technique: "Coulometric Karl Fischer titration", unit: "mg/kg", range: "5–50 mg/kg",
        type: "validation", reviewer: "QA Manager",
        requirement: "LOQ ≤ 5 mg/kg; RSD ≤ 5 %; bias within ±10 % of CRM; recovery 90–110 %",
        intendedUse: "Monitor water content in new and in-service insulating oil to assess insulation condition and dielectric integrity.",
      },
      {
        linearity: { points: [
          { conc: 5, reps: [5.02, 4.98, 5.01] },
          { conc: 10, reps: [10.03, 9.98, 10.00] },
          { conc: 18, reps: [18.05, 17.96, 18.00] },
          { conc: 25, reps: [25.02, 24.97, 25.01] },
          { conc: 35, reps: [35.04, 34.95, 35.00] },
          { conc: 50, reps: [50.06, 49.92, 50.00] },
        ] },
        lodloq: {
          approach: "blank", blankType: "reagent", blankCorrected: true, n: 1, nb: 10,
          reps: [1.2, 0.9, 1.5, 1.1, 1.0, 1.4, 1.3, 0.8, 1.2, 1.1],
          slopeFromCal: true, manualSlope: "", idlK: 3, spikeLevel: 5,
          idlReps: [0.42, 0.51, 0.38, 0.47, 0.44, 0.55, 0.40], mdlSpiked: [4.9, 5.1, 4.8, 5.05, 4.95, 5.12, 4.88], mdlBlank: [],
        },
        precision: {
          label: "Day", massFraction: 1.8e-5, sRMeasured: "",
          groups: [
            [18.1, 17.9, 18.0], [18.2, 18.0, 17.9], [17.9, 18.1, 18.0], [18.0, 17.8, 18.2],
            [18.1, 18.0, 17.9], [17.8, 18.1, 18.0], [18.0, 18.2, 17.9], [18.1, 17.9, 18.1],
          ],
        },
        trueness: {
          mode: "crm", crmRef: 18, crmU: 2,
          crmReps: [17.9, 18.1, 18.3, 17.8, 18.2, 17.7, 18.0, 17.9, 18.2, 18.0],
          spikeMethod: "apha", spikeAmount: 15, unspiked: [3.0, 3.1, 2.9, 3.05, 2.95], spiked: [18.0, 18.1, 17.9, 18.2, 17.85],
          vSpl: 100, vSpk: 1, cSpk: 1500,
        },
        recovery: { levels: [
          { conc: 10, reps: [9.6, 9.8, 10.0, 9.7, 10.1] },
          { conc: 18, reps: [17.7, 18.1, 17.9, 18.2, 17.6] },
          { conc: 35, reps: [34.4, 34.9, 35.2, 34.6, 35.0] },
        ] },
        robustness: { factors: [
          { name: "Cell temperature (°C)", nominal: "23", low: "18", high: "28", resLow: 17.9, resHigh: 18.1 },
          { name: "Stirring rate (rpm)", nominal: "300", low: "250", high: "350", resLow: 18.05, resHigh: 17.95 },
          { name: "Sample size (g)", nominal: "5", low: "3", high: "7", resLow: 18.00, resHigh: 18.08 },
        ] },
        comparison: {
          mode: "twoSample", labelA: "Reference laboratory", labelB: "Our laboratory",
          dataA: [18.1, 17.9, 18.0, 18.2, 17.8, 18.0], dataB: [18.0, 18.2, 17.9, 18.1, 17.85],
          refValue: 18, srcA: "0", srcB: "1",
        },
      },
    ),
  },
  {
    id: "ex-pb-icpms",
    name: "Lead in drinking water — ICP-MS (method verification)",
    blurb: "Verification of a standard method: confirms the lab meets published precision, bias (vs CRM) and recovery, then compares results with the reference laboratory.",
    study: buildExample(
      {
        title: "Verification of lead in drinking water by ICP-MS",
        id: "MV-ICPMS-Pb-2026", standard: "ISO 17294-2:2023 / US EPA 200.8",
        analyte: "Lead (Pb)", matrix: "Drinking water", technique: "ICP-MS",
        unit: "µg/L", range: "1–50 µg/L", type: "verification", reviewer: "QA Manager",
        requirement: "LOQ ≤ 1 µg/L; RSD ≤ 5 %; bias within ±10 % of CRM; recovery 90–110 %",
        intendedUse: "Confirm the laboratory can achieve the published performance of the standard method for regulatory lead testing.",
      },
      {
        linearity: { points: [
          { conc: 1, reps: [1012, 995, 1003] },
          { conc: 2, reps: [2005, 1998, 2011] },
          { conc: 5, reps: [5008, 4992, 5001] },
          { conc: 10, reps: [9990, 10012, 9998] },
          { conc: 25, reps: [24980, 25015, 25002] },
          { conc: 50, reps: [50120, 49890, 50010] },
        ] },
        lodloq: {
          approach: "blank", blankType: "reagent", blankCorrected: true, n: 1, nb: 10,
          reps: [0.05, 0.04, 0.06, 0.05, 0.03, 0.05, 0.04, 0.06, 0.05, 0.04],
          slopeFromCal: true, manualSlope: "", idlK: 3, spikeLevel: 1,
          idlReps: [0.36, 0.44, 0.30, 0.40, 0.38, 0.48, 0.34], mdlSpiked: [0.95, 1.05, 0.92, 1.02, 0.98, 1.06, 0.94], mdlBlank: [],
        },
        precision: {
          label: "Day", massFraction: 1e-8, sRMeasured: "",
          groups: [
            [10.1, 9.9, 10.0], [10.2, 10.0, 9.9], [9.9, 10.1, 10.0], [10.0, 9.8, 10.2],
            [10.1, 10.0, 9.9], [9.8, 10.1, 10.0], [10.0, 10.2, 9.9], [10.1, 9.9, 10.1],
          ],
        },
        trueness: {
          mode: "crm", crmRef: 9.8, crmU: 0.15,
          crmReps: [9.75, 9.82, 9.88, 9.78, 9.85, 9.72, 9.81, 9.77, 9.83, 9.80],
          spikeMethod: "apha", spikeAmount: 8, unspiked: [1.9, 2.0, 1.85, 1.95, 2.05], spiked: [9.8, 9.9, 9.7, 10.0, 9.85],
          vSpl: 100, vSpk: 1, cSpk: 800,
        },
        recovery: { levels: [
          { conc: 2, reps: [1.92, 1.98, 2.01, 1.95, 2.03] },
          { conc: 10, reps: [9.85, 10.05, 9.95, 10.10, 9.90] },
          { conc: 40, reps: [39.2, 40.1, 39.8, 40.3, 39.5] },
        ] },
        robustness: { factors: [
          { name: "RF power (W)", nominal: "1550", low: "1500", high: "1600", resLow: 10.05, resHigh: 9.98 },
          { name: "Nebuliser gas (L/min)", nominal: "1.00", low: "0.95", high: "1.05", resLow: 9.96, resHigh: 10.08 },
          { name: "Dwell time (ms)", nominal: "100", low: "80", high: "120", resLow: 10.00, resHigh: 10.03 },
        ] },
        comparison: {
          mode: "twoSample", labelA: "Reference laboratory", labelB: "Our laboratory",
          dataA: [10.1, 9.9, 10.0, 10.2, 9.8], dataB: [10.0, 10.2, 9.9, 10.1, 10.3],
          refValue: 10, srcA: "0", srcB: "1",
        },
      },
    ),
  },
  {
    id: "ex-fe-faas",
    name: "Iron in surface water — new method vs reference (F & t comparison)",
    blurb: "Focused on the F & t tests: demonstrates a faster in-house FAAS procedure is statistically equivalent to the accredited reference method (comparable variance, no bias).",
    study: buildExample(
      {
        title: "Equivalence of a rapid in-house FAAS method vs the reference method for iron in surface water",
        id: "MC-FAAS-Fe-2026", standard: "APHA 3111 B (reference method)",
        analyte: "Iron (Fe)", matrix: "Surface water", technique: "Flame AAS (FAAS)",
        unit: "mg/L", range: "0.05–1.0 mg/L", type: "verification", reviewer: "QA Manager",
        requirement: "No significant difference in means (t-test) and comparable precision (F-test) vs the reference method at 95 %.",
        intendedUse: "Demonstrate a faster in-house FAAS procedure gives results statistically equivalent to the accredited reference method.",
      },
      {
        linearity: { points: [
          { conc: 0.05, reps: [0.0102, 0.0100, 0.0101] },
          { conc: 0.10, reps: [0.0201, 0.0199, 0.0200] },
          { conc: 0.25, reps: [0.0500, 0.0503, 0.0498] },
          { conc: 0.50, reps: [0.1001, 0.0998, 0.1003] },
          { conc: 0.75, reps: [0.1506, 0.1494, 0.1500] },
          { conc: 1.00, reps: [0.2008, 0.1996, 0.2004] },
        ] },
        lodloq: {
          approach: "blank", blankType: "reagent", blankCorrected: true, n: 1, nb: 10,
          reps: [0.0032, 0.0028, 0.0035, 0.0030, 0.0029, 0.0034, 0.0031, 0.0027, 0.0033, 0.0030],
          slopeFromCal: true, manualSlope: "", idlK: 3, spikeLevel: 0.05,
          idlReps: [0.018, 0.022, 0.015, 0.020, 0.019, 0.024, 0.017], mdlSpiked: [0.048, 0.052, 0.046, 0.051, 0.049, 0.053, 0.047], mdlBlank: [],
        },
        precision: {
          label: "Analyst", massFraction: 5e-7, sRMeasured: "",
          groups: [
            [0.502, 0.498, 0.504], [0.497, 0.501, 0.499], [0.503, 0.499, 0.501], [0.498, 0.496, 0.502],
            [0.501, 0.504, 0.499], [0.497, 0.502, 0.500], [0.499, 0.501, 0.503], [0.504, 0.500, 0.498],
          ],
        },
        trueness: {
          mode: "crm", crmRef: 0.5, crmU: 0.01,
          crmReps: [0.498, 0.501, 0.504, 0.499, 0.502, 0.496, 0.500, 0.498, 0.502, 0.500],
          spikeMethod: "apha", spikeAmount: 0.4, unspiked: [0.10, 0.102, 0.098, 0.101, 0.099], spiked: [0.50, 0.498, 0.50, 0.504, 0.497],
          vSpl: 100, vSpk: 1, cSpk: 40,
        },
        recovery: { levels: [
          { conc: 0.10, reps: [0.096, 0.098, 0.100, 0.097, 0.101] },
          { conc: 0.50, reps: [0.492, 0.501, 0.498, 0.503, 0.495] },
          { conc: 0.90, reps: [0.885, 0.892, 0.901, 0.898, 0.889] },
        ] },
        robustness: { factors: [
          { name: "Fuel/oxidant ratio", nominal: "1.0", low: "0.9", high: "1.1", resLow: 0.499, resHigh: 0.502 },
          { name: "Burner height (mm)", nominal: "7", low: "6", high: "8", resLow: 0.501, resHigh: 0.498 },
          { name: "Aspiration rate (mL/min)", nominal: "5.0", low: "4.5", high: "5.5", resLow: 0.500, resHigh: 0.503 },
        ] },
        comparison: {
          mode: "twoSample", labelA: "Reference method", labelB: "New rapid method",
          dataA: [0.51, 0.49, 0.50, 0.52, 0.48, 0.50], dataB: [0.50, 0.52, 0.49, 0.51, 0.50],
          refValue: 0.5, srcA: "0", srcB: "1",
        },
      },
    ),
  },
];

const LINKEDIN_URL = "https://www.linkedin.com/in/chm-hadi-fauzi";
const STORAGE_KEY = "labvalidate-pro.workspace.v1";
const TOS_KEY = "labvalidate-pro.tos-accepted";   // stores the accepted TERMS_VERSION

const mergeStudy = (savedStudy) => {
  const base = defaultStudy();
  if (!savedStudy || typeof savedStudy !== "object") return base;
  const same = (actual, legacy) => JSON.stringify(actual) === JSON.stringify(legacy);
  const merged = Object.fromEntries(
    Object.entries(base).map(([key, value]) => [
      key,
      value && typeof value === "object" && !Array.isArray(value)
        ? { ...value, ...(savedStudy[key] || {}) }
        : savedStudy[key] ?? value,
    ]),
  );

  // Migrate only recognisable v1 demo values; preserve anything the analyst has changed.
  const info = savedStudy.info || {};
  const identityIsBlank = ["title", "id", "standard", "analyte", "matrix", "technique", "range", "requirement", "intendedUse"]
    .every((key) => !info[key]);
  if (identityIsBlank && (!info.unit || info.unit === "mg/L")) merged.info.unit = base.info.unit;
  if (same(savedStudy.linearity?.points, [
    { conc: 0.5, reps: [0.052, 0.05, 0.051] }, { conc: 1, reps: [0.101, 0.099, 0.1] },
    { conc: 5, reps: [0.5, 0.503, 0.498] }, { conc: 10, reps: [1.001, 0.998, 1.003] },
    { conc: 25, reps: [2.51, 2.49, 2.5] }, { conc: 50, reps: [5.02, 4.99, 5.01] },
  ])) merged.linearity = base.linearity;

  if (same(savedStudy.lodloq?.reps, [0.010, 0.012, 0.008, 0.011, 0.009, 0.013, 0.010, 0.009, 0.012, 0.011])) {
    merged.lodloq.reps = base.lodloq.reps;
  }
  if (savedStudy.lodloq?.spikeLevel === 0.02) merged.lodloq.spikeLevel = base.lodloq.spikeLevel;
  if (same(savedStudy.lodloq?.mdlSpiked, [0.019, 0.022, 0.018, 0.021, 0.020, 0.023, 0.017])) {
    merged.lodloq.mdlSpiked = base.lodloq.mdlSpiked;
  }

  if (same(savedStudy.precision?.groups, [
    [10.2, 10.1, 10.3], [10.0, 10.2, 10.1], [10.3, 10.1, 10.2], [10.1, 10.0, 10.3],
    [10.2, 10.3, 10.1], [10.0, 10.2, 10.2], [10.1, 10.1, 10.3], [10.3, 10.2, 10.0],
  ])) merged.precision.groups = base.precision.groups;
  if (savedStudy.precision?.massFraction === 1e-5) merged.precision.massFraction = base.precision.massFraction;

  if (savedStudy.trueness?.crmRef === 10) merged.trueness.crmRef = base.trueness.crmRef;
  if (savedStudy.trueness?.crmU === 0.1) merged.trueness.crmU = base.trueness.crmU;
  if (same(savedStudy.trueness?.crmReps, [9.95, 10.02, 10.08, 9.98, 10.05, 9.92, 10.01, 9.97, 10.03, 10.0])) {
    merged.trueness.crmReps = base.trueness.crmReps;
  }
  if (savedStudy.trueness?.spikeAmount === 10) merged.trueness.spikeAmount = base.trueness.spikeAmount;
  if (same(savedStudy.trueness?.unspiked, [5.0, 5.1, 4.9, 5.0, 5.1])) merged.trueness.unspiked = base.trueness.unspiked;
  if (same(savedStudy.trueness?.spiked, [15.1, 14.9, 15.0, 15.2, 14.8])) merged.trueness.spiked = base.trueness.spiked;
  if (savedStudy.trueness?.cSpk === 1000) merged.trueness.cSpk = base.trueness.cSpk;

  if (same(savedStudy.recovery?.levels, [
    { conc: 5, reps: [4.8, 4.9, 5.0, 4.7, 5.1] },
    { conc: 50, reps: [49.2, 50.1, 49.8, 50.3, 49.5] },
    { conc: 90, reps: [88.5, 89.2, 90.1, 89.8, 88.9] },
  ])) merged.recovery = base.recovery;
  if (same(savedStudy.robustness?.factors, [
    { name: "pH", nominal: "7.0", low: "6.8", high: "7.2", resLow: 10.1, resHigh: 10.2 },
    { name: "Temperature (°C)", nominal: "25", low: "23", high: "27", resLow: 10.0, resHigh: 10.3 },
    { name: "Flow (mL/min)", nominal: "1.0", low: "0.9", high: "1.1", resLow: 10.15, resHigh: 10.05 },
  ])) {
    merged.robustness = base.robustness;
  }
  return merged;
};

const loadWorkspace = () => {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    return null;
  }
};

/* ────────────────────────────────────────────────────────────────
   PRESET STORE — named, saved studies the user can re-open.

   Two backends, chosen automatically:
   • Storage folder (default when connected) — the user picks a folder
     via the File System Access API and each study is a .json file in it,
     fully compatible with the JSON export/import. Everyone points the app
     at their own folder; the chosen folder is remembered across sessions
     via an IndexedDB-persisted handle. Chrome/Edge only.
   • localStorage (fallback) — zero setup, works everywhere, per browser.

   Every method is async so a third backend (e.g. Turso/libSQL hosted
   SQLite through /api/presets, for cross-device sync on Vercel) can be
   dropped in later WITHOUT touching the UI — keep these method names and
   replace the bodies with fetch() calls.

   NOTE for Vercel: a plain SQLite *file* does NOT persist on Vercel —
   serverless functions get an ephemeral, read-only filesystem. Use Turso
   or Vercel Postgres via an API route if you want server-side storage.
   ──────────────────────────────────────────────────────────────── */
const PRESETS_KEY = "labvalidate-pro.presets.v1";
const IDB_NAME = "labvalidate-pro";
const IDB_STORE = "handles";
const FOLDER_KEY = "storageFolder";

const fsSupported = () => typeof window !== "undefined" && "showDirectoryPicker" in window;
const sanitizeName = (s) => (String(s || "study").replace(/[^\w.\- ]+/g, "_").trim().slice(0, 80) || "study");

/* Tiny IndexedDB helper — persists the chosen directory handle. */
const idbOpen = () => new Promise((res, rej) => {
  const r = indexedDB.open(IDB_NAME, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE);
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
const idbReq = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
const idbDone = (tx) => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
const idbGet = async (key) => { const db = await idbOpen(); const v = await idbReq(db.transaction(IDB_STORE).objectStore(IDB_STORE).get(key)); db.close(); return v; };
const idbSet = async (key, val) => { const db = await idbOpen(); const tx = db.transaction(IDB_STORE, "readwrite"); tx.objectStore(IDB_STORE).put(val, key); await idbDone(tx); db.close(); };
const idbDel = async (key) => { const db = await idbOpen(); const tx = db.transaction(IDB_STORE, "readwrite"); tx.objectStore(IDB_STORE).delete(key); await idbDone(tx); db.close(); };

let dirHandle = null;   // active storage-folder handle, or null → localStorage
let cloudUser = null;   // signed-in user → presetStore routes to Turso via /api

const verifyPerm = async (handle, write) => {
  if (!handle) return false;
  const opts = { mode: write ? "readwrite" : "read" };
  try {
    if ((await handle.queryPermission(opts)) === "granted") return true;
    return (await handle.requestPermission(opts)) === "granted";
  } catch { return false; }
};

const presetStore = {
  supported: fsSupported,
  usingFolder: () => !!dirHandle,
  folderName: () => (dirHandle ? dirHandle.name : null),

  // Cloud mode — when a user is signed in, list/save/remove/get use Turso.
  setUser: (u) => { cloudUser = u || null; },
  cloudEnabled: () => !!cloudUser,

  // Re-attach a previously chosen folder (call from a user gesture so a
  // permission prompt is allowed). Returns the folder name, or null.
  async restoreFolder() {
    if (!fsSupported()) return null;
    try {
      const h = await idbGet(FOLDER_KEY);
      if (h && (await verifyPerm(h, true))) { dirHandle = h; return h.name; }
    } catch { /* ignore */ }
    return null;
  },
  async connectFolder() {
    if (!fsSupported()) throw new Error("This browser has no folder access — use Chrome or Edge, or export/import JSON.");
    const h = await window.showDirectoryPicker({ id: "labvalidate-storage", mode: "readwrite" });
    if (!(await verifyPerm(h, true))) throw new Error("Permission to write in that folder was not granted.");
    dirHandle = h;
    try { await idbSet(FOLDER_KEY, h); } catch { /* handle still active in memory */ }
    return h.name;
  },
  async disconnectFolder() {
    dirHandle = null;
    try { await idbDel(FOLDER_KEY); } catch { /* ignore */ }
  },

  async list() {
    if (cloudUser) return cloud.list();
    if (dirHandle && (await verifyPerm(dirHandle, false))) {
      const out = [];
      for await (const [name, handle] of dirHandle.entries()) {
        if (handle.kind !== "file" || !name.toLowerCase().endsWith(".json")) continue;
        try {
          const file = await handle.getFile();
          const study = JSON.parse(await file.text());
          out.push({
            id: name, name: study?.info?.title || name.replace(/\.json$/i, ""),
            analyte: study?.info?.analyte || "", matrix: study?.info?.matrix || "",
            savedAt: new Date(file.lastModified).toISOString(), study,
          });
        } catch { /* skip files that aren't valid studies */ }
      }
      return out.sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""));
    }
    if (typeof window === "undefined") return [];
    try {
      const arr = JSON.parse(window.localStorage.getItem(PRESETS_KEY) || "[]");
      return Array.isArray(arr) ? arr.sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || "")) : [];
    } catch {
      return [];
    }
  },
  async save({ id, name, study }) {
    const label = name || study?.info?.title || study?.info?.id || "Untitled study";
    if (cloudUser) return cloud.save({ id, name: label, study });
    if (dirHandle && (await verifyPerm(dirHandle, true))) {
      const fname = `${sanitizeName(label)}.json`;
      const fh = await dirHandle.getFileHandle(fname, { create: true });
      const w = await fh.createWritable();
      await w.write(JSON.stringify(study, null, 2));
      await w.close();
      return { id: fname, name: label };
    }
    const list = await presetStore.list();
    const entry = {
      id: (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()),
      name: label, analyte: study?.info?.analyte || "", matrix: study?.info?.matrix || "",
      savedAt: new Date().toISOString(), study,
    };
    window.localStorage.setItem(PRESETS_KEY, JSON.stringify([entry, ...list]));
    return entry;
  },
  async remove(id) {
    if (cloudUser) { await cloud.remove(id); return; }
    if (dirHandle && (await verifyPerm(dirHandle, true))) {
      try { await dirHandle.removeEntry(id); } catch { /* already gone */ }
      return;
    }
    const list = await presetStore.list();
    window.localStorage.setItem(PRESETS_KEY, JSON.stringify(list.filter((e) => e.id !== id)));
  },

  // Fetch the full study object for one saved entry (cloud stores it separately
  // from the list; folder/localStorage already include it in list()).
  async get(entry) {
    if (cloudUser) return cloud.get(entry.id);
    if (entry && entry.study) return { ...entry };
    const list = await presetStore.list();
    return list.find((e) => e.id === entry.id) || null;
  },

  // Rename a saved study in place. Returns the new id (folder renames change the
  // filename, which is the id) so callers can keep tracking the open study.
  async rename(id, name) {
    const clean = String(name || "").trim();
    if (!clean) return { id, name };
    if (cloudUser) { await cloud.rename(id, clean); return { id, name: clean }; }
    if (dirHandle && (await verifyPerm(dirHandle, true))) {
      const fh = await dirHandle.getFileHandle(id);            // id is the filename
      const text = await (await fh.getFile()).text();
      const newName = `${sanitizeName(clean)}.json`;
      const nfh = await dirHandle.getFileHandle(newName, { create: true });
      const w = await nfh.createWritable(); await w.write(text); await w.close();
      if (newName !== id) { try { await dirHandle.removeEntry(id); } catch { /* ignore */ } }
      return { id: newName, name: clean };
    }
    const list = await presetStore.list();
    window.localStorage.setItem(PRESETS_KEY,
      JSON.stringify(list.map((e) => (e.id === id ? { ...e, name: clean } : e))));
    return { id, name: clean };
  },
};

/* ════════════════════════════════════════════════════════════════
   MAIN APP
   ════════════════════════════════════════════════════════════════ */
export default function LabValidatePro() {
  const [dark, setDark] = useState(() => loadWorkspace()?.dark ?? true);
  const [study, setStudy] = useState(() => mergeStudy(loadWorkspace()?.study));
  const [module, setModule] = useState(() => loadWorkspace()?.module || "plan");
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [presets, setPresets] = useState([]);
  const [pendingDelete, setPendingDelete] = useState(null); // saved study awaiting delete confirmation
  const [confirmDel, setConfirmDel] = useState(null);       // generic row-delete confirmation: { title, message, onConfirm }
  // Open a confirmation modal before running a destructive delete. onConfirm runs only if the user confirms.
  const askDelete = (message, onConfirm, title = "Delete this item?") => setConfirmDel({ title, message, onConfirm });
  const [presetName, setPresetName] = useState("");
  const [folderName, setFolderName] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const canUseFolder = presetStore.supported();
  const fileRef = useRef(null);
  const libRef = useRef(null);

  // ── Accounts & cloud workspace ──────────────────────────────
  const [user, setUser] = useState(null);          // signed-in user, or null (guest)
  const [authOpen, setAuthOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);   // read-only view (from About)
  // Terms acceptance gate — persisted per browser; re-prompts when TERMS_VERSION changes.
  const [tosAccepted, setTosAccepted] = useState(() => {
    try { return window.localStorage.getItem(TOS_KEY) === TERMS_VERSION; } catch { return false; }
  });
  const acceptTerms = () => {
    try { window.localStorage.setItem(TOS_KEY, TERMS_VERSION); } catch { /* storage may be blocked */ }
    setTosAccepted(true);
  };
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [requireLogin, setRequireLogin] = useState(false); // beta sign-in wall (from server)
  const [booting, setBooting] = useState(true);            // true until the session check resolves
  const [view, setView] = useState("study");       // "workspace" | "study"
  const [cloudId, setCloudId] = useState(null);     // id of the open cloud study (for update-in-place)
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [toast, setToast] = useState(null);         // { id, msg, type }
  const toastRef = useRef(null);
  const showToast = (msg, type = "success") => {
    clearTimeout(toastRef.current);
    setToast({ id: Date.now(), msg, type });
    toastRef.current = setTimeout(() => setToast(null), 2800);
  };

  const C = chartTheme(dark);
  const up = (key, patch) => setStudy((s) => ({ ...s, [key]: { ...s[key], ...patch } }));
  const unit = study.info.unit || "";

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ study, dark, module }));
    } catch {
      // Browsers can disable or limit local storage; the in-memory workspace still works.
    }
  }, [study, dark, module]);

  // Restore an existing session on load. A plain refresh stays on the main
  // study page (view defaults to "study") with the last study restored from
  // localStorage — we only jump to the workspace on an explicit fresh sign-in
  // (see handleAuthed), not on every reload.
  useEffect(() => {
    let alive = true;
    auth.me().then(({ user: u, requireLogin: rl }) => {
      if (!alive) return;
      setRequireLogin(!!rl);
      if (u) {
        setUser(u);
        presetStore.setUser(u);
        refreshPresets();
      }
    }).catch(() => { /* offline — treat as guest */ })
      .finally(() => { if (alive) setBooting(false); });
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-check the session (used by the pending-approval screen's "Check again").
  const refreshSession = async () => {
    const { user: u } = await auth.me();
    if (u) { setUser(u); presetStore.setUser(u); if (!u.access?.expired) setView("workspace"); }
  };

  // Mirror dark mode onto <html> so Radix portals (Select, Popover, Calendar) render themed.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  /* ── Computed results ─────────────────────────────────────── */
  const lin = useMemo(() => {
    const pts = study.linearity.points
      .map((p) => ({ conc: num(p.conc), reps: clean(p.reps) }))
      .filter((p) => p.conc !== null && p.reps.length > 0);
    if (pts.length < 3) return null;
    const x = pts.map((p) => p.conc);
    const y = pts.map((p) => S.mean(p.reps));
    const reg = S.linReg(x, y);
    const rows = pts.map((p, i) => {
      const yPred = reg.slope * p.conc + reg.intercept;
      const resid = y[i] - yPred;
      const residPct = yPred !== 0 ? (resid / yPred) * 100 : 0;
      const rf = p.conc !== 0 ? y[i] / p.conc : null;
      return { conc: p.conc, yObs: y[i], yPred, resid, residPct, rf, repRSD: p.reps.length > 1 ? S.rsd(p.reps) : null };
    });
    const rfs = rows.filter((r) => r.rf !== null).map((r) => r.rf);
    const rfRSD = rfs.length > 1 ? S.rsd(rfs) : null;
    const t = S.tCrit95(reg.n - 2);
    const interceptCI = t * reg.sIntercept;
    const interceptSig = Math.abs(reg.intercept) > interceptCI;
    return { ...reg, rows, rfRSD, interceptCI, interceptSig, maxResidPct: Math.max(...rows.map((r) => Math.abs(r.residPct))) };
  }, [study.linearity]);

  const lod = useMemo(() => {
    const d = study.lodloq;
    const kQ = num(study.criteria.kQ) ?? 10;
    if (d.approach === "calibration") {
      const slope = d.slopeFromCal ? lin?.slope : num(d.manualSlope);
      if (!slope || !lin) return null;
      const lodV = (3.3 * lin.syx) / slope;
      const loqV = (kQ * lin.syx) / slope;
      return { approach: "calibration", slope, syx: lin.syx, lod: lodV, loq: loqV };
    }
    if (d.approach === "usepa") {
      // IDL — instrument detection limit: k × SD of replicate low-level standard injections
      const idlReps = clean(d.idlReps);
      const idlK = num(d.idlK) ?? 3;
      const idl = idlReps.length >= 2
        ? { n: idlReps.length, sd: S.sd(idlReps), value: idlK * S.sd(idlReps), k: idlK }
        : null;
      // MDL — 40 CFR 136 App. B (2017): greater of the spiked-sample and method-blank estimates
      const spk = clean(d.mdlSpiked);
      const blk = clean(d.mdlBlank);
      const spikeLevel = num(d.spikeLevel);
      let mdlSpiked = null, mdlBlank = null;
      if (spk.length >= 3) {
        const t = S.tCrit99one(spk.length - 1);
        mdlSpiked = { n: spk.length, sd: S.sd(spk), mean: S.mean(spk), t, value: t * S.sd(spk) };
      }
      if (blk.length >= 3) {
        const t = S.tCrit99one(blk.length - 1);
        mdlBlank = { n: blk.length, sd: S.sd(blk), mean: S.mean(blk), t, value: S.mean(blk) + t * S.sd(blk) };
      }
      const cands = [mdlSpiked?.value, mdlBlank?.value].filter((v) => v != null);
      const mdl = cands.length ? Math.max(...cands) : null;
      const governed = mdl == null ? null : (mdlBlank && mdl === mdlBlank.value ? "blank" : "spiked");
      // EPA requires the spike be within 1–10× the resulting MDL; ratio helps confirm the level was appropriate
      const spikeRatio = (mdl && spikeLevel) ? spikeLevel / mdl : null;
      if (!idl && mdl == null) return null;
      return { approach: "usepa", idl, mdlSpiked, mdlBlank, mdl, governed, spikeLevel, spikeRatio };
    }
    const reps = clean(d.reps);
    if (reps.length < 6) return null;
    const s0 = S.sd(reps);
    const nI = Math.max(1, num(d.n) ?? 1);
    const nB = Math.max(1, num(d.nb) ?? reps.length);
    const s0p = d.blankCorrected ? s0 * Math.sqrt(1 / nI + 1 / nB) : s0 / Math.sqrt(nI);
    return { approach: d.approach, nReps: reps.length, mean: S.mean(reps), s0, s0p, lod: 3 * s0p, loq: kQ * s0p, grubbs: S.grubbs(reps) };
  }, [study.lodloq, study.criteria.kQ, lin]);

  const prec = useMemo(() => {
    const groups = study.precision.groups.map(clean).filter((g) => g.length > 1);
    if (groups.length < 2) return null;
    const a = S.anova1(groups);
    const rsdr = (a.sr / a.gm) * 100;      // repeatability RSD
    const rsdI = (a.sI / a.gm) * 100;      // intermediate precision RSD (intra-laboratory reproducibility)
    // Horwitz prediction of inter-laboratory reproducibility from the analyte mass fraction
    const C = num(study.precision.massFraction);
    let horwitz = null;
    if (C && C > 0) {
      const predRSDr = 2 * Math.pow(C, -0.1505);   // PRSD_R (%) — Horwitz curve
      const predRSDrRep = 0.66 * predRSDr;         // predicted repeatability RSD ≈ 0.66 × PRSD_R
      // Measured inter-laboratory reproducibility, if supplied from a collaborative trial / PT
      const sR = num(study.precision.sRMeasured);
      const rsdRepro = sR != null ? (sR / a.gm) * 100 : null;
      horwitz = {
        C, predRSDr, predRSDrRep,
        horRatR: rsdRepro != null ? rsdRepro / predRSDr : null,
        horRatr: rsdr / predRSDrRep,
        sR, rsdRepro,
        reproLimit: sR != null ? 2.8 * sR : null,
      };
    }
    return {
      ...a, groups,
      rsdR: rsdr, rsdI,
      rLimit: 2.8 * a.sr,
      grubbs: S.grubbs(groups.flat()),
      horwitz,
    };
  }, [study.precision]);

  const trueness = useMemo(() => {
    const d = study.trueness;
    if (d.mode === "crm") {
      const reps = clean(d.crmReps);
      const ref = num(d.crmRef);
      if (reps.length < 3 || ref === null || ref === 0) return null;
      const tt = S.tTest(reps, ref);
      const sd = S.sd(reps);
      const bias = tt.mean - ref;
      return {
        mode: "crm", n: reps.length, mean: tt.mean, sd, bias,
        biasPct: (bias / ref) * 100, recovery: (tt.mean / ref) * 100,
        ...tt, grubbs: S.grubbs(reps),
      };
    }
    const u = clean(d.unspiked), s = clean(d.spiked);
    if (u.length < 2 || s.length < 2) return null;
    const mu = S.mean(u), ms = S.mean(s);
    const df = Math.min(u.length, s.length) - 1;
    const tCrit = S.tCrit95(df);
    const method = d.spikeMethod || "apha";

    if (method === "volume") {
      // Mixing model: sample (Vspl, conc = mean unspiked) + spike (Vspk, conc cSpk)
      const Vspl = num(d.vSpl), Vspk = num(d.vSpk), cSpk = num(d.cSpk);
      if (Vspl == null || Vspk == null || cSpk == null || Vspl + Vspk === 0) return null;
      const Vt = Vspl + Vspk;
      const cExpected = (Vspl * mu + Vspk * cSpk) / Vt;   // theoretical conc at 100 % recovery
      const spikeAdded = (Vspk * cSpk) / Vt;              // spike contribution in the final mix
      const dilutedSample = (Vspl * mu) / Vt;            // native analyte after dilution
      const rec = (spikeAdded !== 0 ? (ms - dilutedSample) / spikeAdded : 0) * 100;   // spike (marginal) recovery
      const recTotal = cExpected !== 0 ? (ms / cExpected) * 100 : 0;                  // total recovery vs expected
      const sdRec = spikeAdded !== 0
        ? (Math.sqrt(S.variance(s) / s.length + (Vspl / Vt) ** 2 * (S.variance(u) / u.length)) / spikeAdded) * 100
        : 0;
      const t = sdRec !== 0 ? Math.abs(rec - 100) / sdRec : 0;
      return {
        mode: "spike", method: "volume", mu, ms, Vspl, Vspk, cSpk, Vt,
        cExpected, spikeAdded, dilutedSample, recovery: rec, recTotal, sdRec, t, tCrit, df,
        significant: t > tCrit, bias: ms - cExpected, biasPct: rec - 100,
      };
    }

    // APHA / USEPA matrix spike:  %R = 100 · (SSR − SR) / SA
    const amt = num(d.spikeAmount);
    if (!amt) return null;
    const rec = ((ms - mu) / amt) * 100;
    const sdRec = (Math.sqrt(S.variance(s) / s.length + S.variance(u) / u.length) / amt) * 100;
    const t = Math.abs(rec - 100) / sdRec;
    return { mode: "spike", method: "apha", mu, ms, amt, recovery: rec, sdRec, t, tCrit, df, significant: t > tCrit, bias: (ms - mu) - amt, biasPct: rec - 100 };
  }, [study.trueness]);

  const comp = useMemo(() => {
    const d = study.comparison;
    const a = clean(d.dataA);
    if (d.mode === "oneSample") {
      const ref = num(d.refValue);
      if (a.length < 2 || ref === null) return null;
      const tt = S.tTest(a, ref);   // one-sample t vs a stated value
      const sd = S.sd(a);
      return {
        mode: "oneSample", a, ref, sd, ...tt,
        bias: tt.mean - ref, biasPct: ref !== 0 ? ((tt.mean - ref) / ref) * 100 : null,
      };
    }
    const b = clean(d.dataB);
    if (a.length < 2 || b.length < 2) return null;
    const f = S.fTest(a, b);
    const pooled = !f.significant;          // ← the link: comparable variances → pooled t-test, else Welch
    const tt = S.tTest2(a, b, pooled);
    return { mode: "twoSample", a, b, f, tt, pooled };
  }, [study.comparison]);

  const rec = useMemo(() =>
    study.recovery.levels.map((L) => {
      const reps = clean(L.reps);
      const conc = num(L.conc);
      if (reps.length < 2 || !conc) return null;
      const m = S.mean(reps);
      return { conc, n: reps.length, mean: m, sd: S.sd(reps), rsd: S.rsd(reps), recovery: (m / conc) * 100 };
    }).filter(Boolean),
  [study.recovery]);

  const robust = useMemo(() =>
    study.robustness.factors.map((f) => {
      const lo = num(f.resLow), hi = num(f.resHigh);
      if (lo === null || hi === null) return null;
      const effect = hi - lo;
      const mid = (hi + lo) / 2;
      const effectPct = mid !== 0 ? (effect / mid) * 100 : 0;
      // Compare |effect| against repeatability if available: significant if > sr·t·√2
      const srTest = prec ? Math.abs(effect) > prec.sr * S.tCrit95(prec.dfw) * Math.SQRT2 / Math.sqrt(prec.N / prec.p) : null;
      return { ...f, effect, effectPct, srTest };
    }).filter(Boolean),
  [study.robustness, prec]);

  const mu = useMemo(() => {
    if (!prec) return null;
    const uPrec = prec.sI;                                   // intermediate precision as u(P)
    let uBias = null;
    if (trueness?.mode === "crm") {
      const uRef = num(study.trueness.crmU) ?? 0;
      uBias = Math.sqrt((trueness.sd / Math.sqrt(trueness.n)) ** 2 + (uRef / 2) ** 2 + trueness.bias ** 2);
    } else if (trueness?.mode === "spike") {
      uBias = Math.abs(trueness.bias);
    }
    const uc = uBias !== null ? Math.sqrt(uPrec ** 2 + uBias ** 2) : uPrec;
    const U = 2 * uc;
    return { uPrec, uBias, uc, U, UPct: (U / prec.gm) * 100 };
  }, [prec, trueness, study.trueness.crmU]);

  /* ── Module status (drives the validation rail) ───────────── */
  const cr = study.criteria;
  const status = {
    plan: study.info.title && study.info.analyte && study.info.requirement ? "pass" : "pending",
    selectivity: study.selectivity.interferents.some((i) => i.name)
      ? (study.selectivity.interferents.filter((i) => i.name).every((i) => i.acceptable) ? "pass" : "fail")
      : "pending",
    linearity: !lin ? "pending" : lin.r2 >= cr.r2Min && lin.maxResidPct <= cr.residPctMax ? "pass" : "fail",
    lodloq: !lod ? "pending" : "pass",
    trueness: !trueness ? "pending" : trueness.significant ? "fail" : "pass",
    precision: !prec ? "pending" : prec.rsdR <= cr.rsdRMax && prec.rsdI <= cr.rsdIMax ? "pass" : "fail",
    comparison: !comp ? "pending"
      : (comp.mode === "twoSample" ? comp.tt.significant : comp.significant) ? "warn" : "pass",
    recovery: rec.length === 0 ? "pending" : rec.every((r) => r.recovery >= cr.recMin && r.recovery <= cr.recMax) ? "pass" : "fail",
    robustness: robust.length === 0 ? "pending" : robust.every((r) => Math.abs(r.effectPct) <= cr.robustPctMax) ? "pass" : "warnOrPass",
    uncertainty: mu ? "pass" : "pending",
  };
  if (status.robustness === "warnOrPass") status.robustness = robust.some((r) => Math.abs(r.effectPct) > cr.robustPctMax) ? "warn" : "pass";

  const isVerification = study.info.type === "verification";
  const MODULES = [
    { id: "plan", label: "Study Plan", icon: ClipboardList,
      hint: "Define the method, its intended use, and the acceptance criteria every result is judged against — the foundation of the validation/verification study." },
    { id: "selectivity", label: "Selectivity", icon: Crosshair,
      hint: "The ability of the method to measure the analyte accurately in the presence of interferences (matrix components, other analytes). Confirms the signal comes from the analyte and not something else." },
    { id: "linearity", label: "Linearity & Range", icon: Activity,
      hint: "Whether the response is proportional to concentration across the working range. Assessed by the calibration fit, residual plot and response factors — not by R² alone." },
    { id: "lodloq", label: "LOD / LOQ", icon: Ruler,
      hint: "Limit of Detection — the lowest amount reliably distinguished from a blank. Limit of Quantification — the lowest amount that can be measured with acceptable precision and accuracy." },
    { id: "trueness", label: "Trueness / Bias", icon: Target,
      hint: "How close the average measured value is to the true/reference value. Bias is the difference; evaluated using a CRM, reference method, or spiked recovery." },
    { id: "precision", label: "Precision", icon: Repeat,
      hint: "The closeness of agreement between repeated measurements. Repeatability (same conditions) and intermediate precision (different days/analysts/equipment), reported as SD or %RSD." },
    { id: "comparison", label: "F & t Tests", icon: GitCompareArrows,
      hint: "Statistical comparison against a reference method or laboratory. The F-test compares variances (precision); the t-test compares means (bias) to show the methods are equivalent." },
    { id: "recovery", label: "Recovery", icon: Beaker,
      hint: "The proportion of analyte recovered from a spiked sample, expressed as a percentage. Demonstrates the method extracts and measures the analyte without significant loss." },
    { id: "robustness", label: "Ruggedness", icon: Shield,
      hint: "How resistant the results are to small, deliberate changes in method conditions (temperature, pH, time). Identifies parameters that must be controlled for reliable results." },
    { id: "uncertainty", label: "Uncertainty", icon: Sigma,
      hint: "The measurement uncertainty — a quantified range within which the true value is expected to lie, combining all significant sources of error into an expanded uncertainty." },
    { id: "report", label: "Report", icon: FileText,
      hint: "Compile the study into a summary report: parameters evaluated, results, pass/fail against criteria, and the overall fitness-for-purpose conclusion." },
  ];
  const coreDone = ["linearity", "lodloq", "trueness", "precision", "recovery"].filter((k) => status[k] !== "pending").length;
  const corePass = ["linearity", "lodloq", "trueness", "precision", "recovery"].every((k) => status[k] === "pass");

  /* ── Save / Load ──────────────────────────────────────────── */
  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(study, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${study.info.id || "validation-study"}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importJSON = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { try { setStudy(mergeStudy(JSON.parse(r.result))); setCloudId(null); } catch { alert("Invalid study file."); } };
    r.readAsText(f);
    e.target.value = "";
  };

  /* ── New: clear everything and start a fresh study ──────────── */
  const startNew = () => {
    setStudy(blankStudy());   // auto-persists via the workspace effect, so it survives refresh
    setModule("plan");
    setCloudId(null);         // no longer editing a saved cloud study
    setNewOpen(false);
    setView("study");
  };

  /* ── Presets: save the current study / re-open a saved one ──── */
  const refreshPresets = () => {
    setPresetsLoading(true);
    return presetStore.list()
      .then((list) => setPresets(Array.isArray(list) ? list : []))
      .catch(() => setPresets([]))
      .finally(() => setPresetsLoading(false));
  };
  const openPresets = async () => {
    setPresetName(study.info.title || study.info.id || "");
    setPresetsOpen(true);
    if (!presetStore.cloudEnabled()) {
      const n = await presetStore.restoreFolder();   // re-attach the user's folder if one was chosen
      setFolderName(n);
    }
    refreshPresets();
  };
  const chooseFolder = async () => {
    try {
      const n = await presetStore.connectFolder();
      setFolderName(n);
      refreshPresets();
    } catch (e) {
      if (e?.name !== "AbortError") alert(e?.message || "Could not open that folder.");
    }
  };
  const disconnectFolder = async () => {
    await presetStore.disconnectFolder();
    setFolderName(null);
    refreshPresets();
  };
  const savePreset = async () => {
    const name = presetName.trim() || study.info.title || "Untitled study";
    try {
      // In cloud mode, pass cloudId so re-saving updates the same study in place.
      const saved = await presetStore.save({ id: cloudId, name, study });
      if (saved?.id) setCloudId(saved.id);
      setPresetName("");
      refreshPresets();
      showToast(presetStore.cloudEnabled() ? "Saved to your workspace" : "Study saved");
    } catch (e) {
      showToast(e?.message || "Could not save the study.", "error");
    }
  };
  const loadPreset = async (entry) => {
    try {
      // Cloud list entries carry no `study` blob — fetch the full record on open.
      const full = entry.study ? entry : await presetStore.get(entry);
      if (full?.study) {
        setStudy(mergeStudy(full.study));
        setCloudId(presetStore.cloudEnabled() ? entry.id : null);
        setModule("plan");
      }
    } catch (e) {
      alert(e?.message || "Could not open that study.");
    }
    setPresetsOpen(false);
    setView("study");
  };
  const loadExample = (ex) => {
    const clone = typeof structuredClone === "function" ? structuredClone(ex.study) : JSON.parse(JSON.stringify(ex.study));
    setStudy(clone);
    setModule("plan");
    setCloudId(null);
    setPresetsOpen(false);
    setView("study");
  };
  const deletePreset = async (id) => {
    try {
      await presetStore.remove(id);
      if (id === cloudId) setCloudId(null);
      refreshPresets();
      showToast("Study deleted");
    } catch (e) {
      showToast(e?.message || "Could not delete the study.", "error");
    }
  };
  const renamePreset = async (id, name) => {
    try {
      const r = await presetStore.rename(id, name);
      if (id === cloudId && r?.id) setCloudId(r.id);   // folder rename changes the id
      refreshPresets();
      showToast("Study renamed");
    } catch (e) {
      showToast(e?.message || "Could not rename the study.", "error");
    }
  };

  /* ── Accounts: sign in / out, and the workspace <-> study views ── */
  const handleAuthed = (u) => {
    setUser(u);
    presetStore.setUser(u);
    setAuthOpen(false);
    setView("workspace");
    refreshPresets();
  };
  const handleSignOut = async () => {
    try { await auth.logout(); } catch { /* clear locally regardless */ }
    setUser(null);
    presetStore.setUser(null);
    setCloudId(null);
    setView("study");
    setPresets([]);
  };
  const handleAccountDeleted = () => {
    setUser(null);
    presetStore.setUser(null);
    setCloudId(null);
    setAccountOpen(false);
    setView("study");
    setPresets([]);
  };
  const startNewInWorkspace = () => {
    setStudy(blankStudy());
    setModule("plan");
    setCloudId(null);
    setView("study");
  };
  const handleFeedbackSubmitted = (updated) => {
    if (updated) { setUser(updated); presetStore.setUser(updated); }
    setFeedbackOpen(false);
    const a = updated?.access;
    if (a?.approved && !a?.expired) showToast("Thanks! Access unlocked for 1 year.");
    else if (a?.pendingApproval) showToast("Feedback sent — pending approval.");
    else showToast("Thanks for your feedback!");
  };

  // ── Beta access flags ───────────────────────────────────────
  const access = user?.access || null;
  const isAdmin = !!access?.isAdmin;
  const accessLocked = !!access && !isAdmin && access.expired;           // block until feedback
  const showTrialBanner = !!user && !isAdmin && access && !accessLocked
    && (access.inTrial || (access.daysLeft != null && access.daysLeft <= 7));
  // Portable library file — works in every browser (attach a file as storage).
  const exportLibrary = async () => {
    const items = await presetStore.list();
    const studies = items.map((e) => ({ name: e.name, analyte: e.analyte, matrix: e.matrix, savedAt: e.savedAt, study: e.study }));
    const blob = new Blob([JSON.stringify({ app: "labvalidate-pro", kind: "library", savedAt: new Date().toISOString(), studies }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "labvalidate-library.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importLibrary = async (ev) => {
    const f = ev.target.files?.[0];
    ev.target.value = "";
    if (!f) return;
    try {
      const parsed = JSON.parse(await f.text());
      const rawList = Array.isArray(parsed) ? parsed
        : Array.isArray(parsed?.studies) ? parsed.studies
        : [parsed];   // also accepts a single exported study file
      let count = 0;
      for (const item of rawList) {
        const study = item?.study && item.study.info ? item.study : (item?.info ? item : null);
        if (!study) continue;
        await presetStore.save({ name: item?.name || study?.info?.title, study: mergeStudy(study) });
        count++;
      }
      refreshPresets();
      alert(count ? `Imported ${count} stud${count === 1 ? "y" : "ies"}.` : "No studies found in that file.");
    } catch {
      alert("Invalid library file.");
    }
  };

  /* ══════════════════════════ MODULES ══════════════════════════ */

  const PlanModule = () => (
    <div className="space-y-4">
      <GuideNote>
        Per the Eurachem <b>Planning &amp; Reporting Method Validation Studies</b> supplement: define the analytical
        requirement first, then select which performance characteristics need study.{" "}
        {isVerification
          ? "For verification of a standard method, the lab confirms it can achieve the published performance (typically precision, bias, LOQ) — a reduced study."
          : "For full validation, all relevant characteristics below should be evaluated."}
      </GuideNote>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><FlaskConical className="h-4 w-4 text-primary" />Method Identification</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Method Title" value={study.info.title} onChange={(e) => up("info", { title: e.target.value })} placeholder="Determination of dissolved copper in electrical insulating oil by GFAAS" className="md:col-span-2" />
          <Field label="Method ID / SOP" value={study.info.id} onChange={(e) => up("info", { id: e.target.value })} placeholder="SOP-GFAAS-CU-001" />
          <Field label="Analyte" value={study.info.analyte} onChange={(e) => up("info", { analyte: e.target.value })} placeholder="Dissolved copper (Cu)" />
          <Field label="Matrix" value={study.info.matrix} onChange={(e) => up("info", { matrix: e.target.value })} placeholder="New or used petroleum-origin electrical insulating oil" />
          <Field label="Technique" value={study.info.technique} onChange={(e) => up("info", { technique: e.target.value })} placeholder="Graphite furnace AAS (GFAAS; non-flame atomization)" />
          <Field label="Reporting Unit" value={study.info.unit} onChange={(e) => up("info", { unit: e.target.value })} />
          <Field label="Working Range" value={study.info.range} onChange={(e) => up("info", { range: e.target.value })} placeholder="e.g. 0.005–0.100 mg/kg (laboratory-validated range)" />
          <Field label="Reference Standard" value={study.info.standard} onChange={(e) => up("info", { standard: e.target.value })} placeholder="ASTM D3635-13(2021); sampling: ASTM D923-15(2023)" />
          <NSelect label="Study Type" value={study.info.type} onChange={(v) => up("info", { type: v })}
            options={[{ value: "validation", label: "Method Validation (full)" }, { value: "verification", label: "Method Verification (standard method)" }]} />
          <Field label="Analyst" value={study.info.analyst} onChange={(e) => up("info", { analyst: e.target.value })} />
          <Field label="Date" type="date" value={study.info.date} onChange={(e) => up("info", { date: e.target.value })} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><Target className="h-4 w-4 text-primary" />Analytical Requirement (fitness for purpose)</CardTitle>
          <CardDescription className="text-xs">What must the method achieve for its intended use? This is the benchmark every result below is judged against.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <FieldLabel>Intended Use</FieldLabel>
              <Textarea className="bg-card text-sm min-h-[70px]" value={study.info.intendedUse} onChange={(e) => up("info", { intendedUse: e.target.value })}
                placeholder="e.g. Determine dissolved copper in new or in-service petroleum insulating oil to support oil-condition and oxidation assessment per ASTM D3635" />
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel>Analytical Requirement</FieldLabel>
              <Textarea className="bg-card text-sm min-h-[70px]" value={study.info.requirement} onChange={(e) => up("info", { requirement: e.target.value })}
                placeholder="e.g. LOQ ≤ 0.01 mg/kg; RSD ≤ 10 % near LOQ; recovery 90–110 % (confirm against the laboratory SOP)" />
            </div>
          </div>
          <Separator />
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Acceptance Criteria (used across all modules)</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <CriteriaRow label="Minimum R²" value={cr.r2Min} onChange={(v) => up("criteria", { r2Min: v })} />
            <CriteriaRow label="Max residual" value={cr.residPctMax} onChange={(v) => up("criteria", { residPctMax: v })} unit="%" />
            <CriteriaRow label="Max RSD (repeatability)" value={cr.rsdRMax} onChange={(v) => up("criteria", { rsdRMax: v })} unit="%" />
            <CriteriaRow label="Max RSD (intermediate)" value={cr.rsdIMax} onChange={(v) => up("criteria", { rsdIMax: v })} unit="%" />
            <CriteriaRow label="Recovery min" value={cr.recMin} onChange={(v) => up("criteria", { recMin: v })} unit="%" />
            <CriteriaRow label="Recovery max" value={cr.recMax} onChange={(v) => up("criteria", { recMax: v })} unit="%" />
            <CriteriaRow label="Max ruggedness effect" value={cr.robustPctMax} onChange={(v) => up("criteria", { robustPctMax: v })} unit="%" />
            <CriteriaRow label="LOQ multiplier kQ" value={cr.kQ} onChange={(v) => up("criteria", { kQ: v })} unit="× s′₀" />
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const SelectivityModule = () => (
    <div className="space-y-4">
      <GuideNote>
        Eurachem §6.2 — confirm the method measures only the intended analyte. Analyse samples/blanks containing suspected
        interferents at realistic levels and record the effect on the result.
      </GuideNote>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Interference Study</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {study.selectivity.interferents.map((it, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_110px_auto_auto] gap-2 items-end">
              <Field label={i === 0 ? "Interferent / matrix effect" : ""} value={it.name} placeholder="Iron (Fe) / aged-oil matrix"
                onChange={(e) => { const a = [...study.selectivity.interferents]; a[i] = { ...it, name: e.target.value }; up("selectivity", { interferents: a }); }} />
              <Field label={i === 0 ? "Level tested" : ""} value={it.level} placeholder="0.050 mg/kg Fe"
                onChange={(e) => { const a = [...study.selectivity.interferents]; a[i] = { ...it, level: e.target.value }; up("selectivity", { interferents: a }); }} />
              <Field label={i === 0 ? "Effect (%)" : ""} type="number" step="any" value={it.effectPct} placeholder="+2"
                onChange={(e) => { const a = [...study.selectivity.interferents]; a[i] = { ...it, effectPct: e.target.value === "" ? "" : +e.target.value }; up("selectivity", { interferents: a }); }} />
              <div className="flex flex-col gap-1.5 items-center pb-0.5">
                {i === 0 && <FieldLabel>OK?</FieldLabel>}
                <Switch checked={it.acceptable} onCheckedChange={(v) => { const a = [...study.selectivity.interferents]; a[i] = { ...it, acceptable: v }; up("selectivity", { interferents: a }); }} />
              </div>
              <Button variant="ghost" size="sm" className="h-9 text-destructive" onClick={() => askDelete("This interferent / matrix row and everything entered in it will be removed.", () => up("selectivity", { interferents: study.selectivity.interferents.filter((_, k) => k !== i) }), "Delete this row?")}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => up("selectivity", { interferents: [...study.selectivity.interferents, { name: "", level: "", effectPct: "", acceptable: true }] })}>
            <Plus className="h-3.5 w-3.5 mr-1" />Add interferent
          </Button>
          <Separator />
          <div className="flex flex-col gap-1.5">
            <FieldLabel>Conclusions / notes</FieldLabel>
            <Textarea className="bg-card text-sm" value={study.selectivity.notes} onChange={(e) => up("selectivity", { notes: e.target.value })}
              placeholder="e.g. No significant effect from 0.050 mg/kg Fe or the aged-oil matrix; matrix-matched calibration/background correction remained effective…" />
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const LinearityModule = () => {
    const pts = study.linearity.points;
    const setPts = (p) => up("linearity", { points: p });
    const chartData = lin ? lin.rows.map((r) => ({ ...r })) : [];
    // Derived series for the richer chart set (all cheap — recomputed per render).
    let band = [], rfData = [], accData = [], meanRF = 0, rfTol = 0;
    if (lin) {
      const t = S.tCrit95(lin.n - 2);
      const xs = lin.rows.map((r) => r.conc);
      const xMin = Math.min(...xs), xMax = Math.max(...xs);
      const concMean = new Map(lin.rows.map((r) => [r.conc, r.yObs]));
      const G = 48, grid = [];
      for (let i = 0; i <= G; i++) grid.push(xMin + ((xMax - xMin) * i) / G);
      // 95 % confidence band of the fitted line: ŷ ± t·Sy/x·√(1/n + (x−x̄)²/Sxx)
      band = Array.from(new Set([...grid, ...xs])).sort((a, b) => a - b).map((x) => {
        const fit = lin.slope * x + lin.intercept;
        const half = t * lin.syx * Math.sqrt(1 / lin.n + (x - lin.mx) ** 2 / lin.sxx);
        return { x, fit, band: [fit - half, fit + half], yObs: concMean.has(x) ? concMean.get(x) : null };
      });
      // Response factor (signal / concentration) — should stay flat if the method is linear.
      const rfRows = lin.rows.filter((r) => r.rf !== null);
      meanRF = rfRows.length ? rfRows.reduce((sm, r) => sm + r.rf, 0) / rfRows.length : 0;
      rfTol = meanRF * (+cr.residPctMax) / 100;
      rfData = rfRows.map((r) => ({ conc: r.conc, rf: r.rf, ok: Math.abs(r.rf - meanRF) <= rfTol }));
      // Back-calculated concentration recovery — the analyst-facing accuracy view.
      accData = lin.rows.map((r) => {
        const back = lin.slope !== 0 ? (r.yObs - lin.intercept) / lin.slope : null;
        return { conc: r.conc, devPct: back !== null && r.conc !== 0 ? ((back - r.conc) / r.conc) * 100 : null };
      }).filter((r) => r.devPct !== null);
    }
    return (
      <div className="space-y-4">
        <GuideNote>
          Eurachem §6.3 — assess the calibration function over the working range with ≥ 6 concentration levels (+ blank),
          replicates at each level. Judge linearity by the <b>residual plot</b> and response-factor consistency — R² alone
          is not sufficient evidence of linearity.
        </GuideNote>
        <Card>
          <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">Calibration Data</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setPts([...pts, { conc: "", reps: ["", "", ""] }])}><Plus className="h-3.5 w-3.5 mr-1" />Level</Button>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {pts.map((p, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Conc</span>
                  <input type="number" step="any" value={p.conc}
                    onChange={(e) => { const a = [...pts]; a[i] = { ...p, conc: e.target.value === "" ? "" : +e.target.value }; setPts(a); }}
                    className="w-[90px] h-8 rounded-md border border-input bg-card px-2 text-[13px] font-data focus:outline-none focus:ring-2 focus:ring-ring" />
                  <span className="text-[11px] text-muted-foreground">{unit}</span>
                </div>
                <div className="flex-1 min-w-[240px]"><RepGrid values={p.reps} onChange={(v) => { const a = [...pts]; a[i] = { ...p, reps: v }; setPts(a); }} /></div>
                <Button variant="ghost" size="sm" className="text-destructive h-8" onClick={() => askDelete("This calibration level and its replicate readings will be removed.", () => setPts(pts.filter((_, k) => k !== i)), "Delete this level?")}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            ))}
          </CardContent>
        </Card>
        {lin && (
          <>
            <div className="flex flex-wrap gap-2">
              <Stat label="Slope b₁" value={fmtSig(lin.slope)} status={null} />
              <Stat label="Intercept b₀" value={fmtSig(lin.intercept)} status={lin.interceptSig ? "fail" : "pass"} />
              <Stat label="R²" value={fmt(lin.r2, 5)} status={lin.r2 >= cr.r2Min ? "pass" : "fail"} />
              <Stat label="Sy/x" value={fmtSig(lin.syx)} />
              <Stat label="Max residual" value={fmt(lin.maxResidPct, 2)} unit="%" status={lin.maxResidPct <= cr.residPctMax ? "pass" : "fail"} />
              {lin.rfRSD !== null && <Stat label="RF RSD" value={fmt(lin.rfRSD, 2)} unit="%" status={lin.rfRSD <= cr.residPctMax ? "pass" : "warn"} />}
            </div>
            {lin.interceptSig && (
              <div className="text-[12px] text-amber-600 flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" />
                Intercept is statistically different from zero (|b₀| &gt; t·s(b₀) = {fmtSig(lin.interceptCI, 3)}). Check blanks / carry-over — see Blanks supplement.
              </div>
            )}
            {(() => {
              const myv = S.mean(lin.rows.map((r) => r.yObs));
              const sxy = lin.slope * lin.sxx;
              const ssResid = lin.syx ** 2 * (lin.n - 2);
              const tv = S.tCrit95(lin.n - 2);
              return <WorkSteps steps={[
                { label: `1. Use the mean response ȳ at each of the n = ${lin.n} levels; overall means:`,
                  formula: `x̄ = ${fmtSig(lin.mx)} ${unit}    ȳ = ${fmtSig(myv)}` },
                { label: "2. Slope  b₁ = Σ(xᵢ − x̄)(yᵢ − ȳ) / Σ(xᵢ − x̄)²",
                  formula: `b₁ = ${fmtSig(sxy)} / ${fmtSig(lin.sxx)} = ${fmtSig(lin.slope)}` },
                { label: "3. Intercept  b₀ = ȳ − b₁·x̄",
                  formula: `b₀ = ${fmtSig(myv)} − (${fmtSig(lin.slope)})(${fmtSig(lin.mx)}) = ${fmtSig(lin.intercept)}` },
                { label: "4. Correlation coefficient r, then R² = r²",
                  formula: `r = ${fmt(lin.r, 5)}   →   R² = ${fmt(lin.r2, 5)}` },
                { label: "5. Residual standard deviation  Sy/x = √[ Σ(yᵢ − ŷᵢ)² / (n − 2) ]",
                  formula: `Sy/x = √[ ${fmtSig(ssResid)} / ${lin.n - 2} ] = ${fmtSig(lin.syx)}` },
                { label: "6. Standard error of the intercept  s(b₀) = Sy/x · √(1/n + x̄²/Sxx)",
                  formula: `s(b₀) = ${fmtSig(lin.syx)} · √(1/${lin.n} + ${fmtSig(lin.mx ** 2)}/${fmtSig(lin.sxx)}) = ${fmtSig(lin.sIntercept)}` },
                { label: `7. Intercept significance — compare |b₀| with t · s(b₀)  (t = ${fmt(tv, 3)}, df = n − 2 = ${lin.n - 2})`,
                  formula: `|${fmtSig(lin.intercept)}|  ${lin.interceptSig ? ">" : "≤"}  ${fmt(tv, 3)} × ${fmtSig(lin.sIntercept)} = ${fmtSig(lin.interceptCI)}   →   ${lin.interceptSig ? "significant (≠ 0)" : "not significant"}` },
              ]} />;
            })()}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Calibration curve · 95% confidence band</CardTitle></CardHeader>
                <CardContent className="h-[260px]">
                  <ChartFrame>{({ ResponsiveContainer, ComposedChart, LineChart, ScatterChart, BarChart, Line, Area, Bar, Scatter, Cell, XAxis, YAxis, CartesianGrid, RTooltip, ReferenceLine, ReferenceArea, ErrorBar }) => (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={band} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                      <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                      <XAxis dataKey="x" type="number" domain={["auto", "auto"]} tick={{ fontSize: 11, fill: C.axis }} stroke={C.grid} label={{ value: `Conc (${unit})`, position: "insideBottom", offset: -2, fontSize: 10, fill: C.axis }} />
                      <YAxis tick={{ fontSize: 11, fill: C.axis }} stroke={C.grid} />
                      <RTooltip contentStyle={C.tooltip} itemStyle={C.tooltipItem} labelStyle={C.tooltipLabel}
                        formatter={(v, n) => (Array.isArray(v) ? [`${fmtSig(v[0])} – ${fmtSig(v[1])}`, "95% CI"] : [fmtSig(v), n === "fit" ? "Fit" : "Mean response"])}
                        labelFormatter={(l) => `Conc ${fmtSig(l)} ${unit}`} />
                      <Area dataKey="band" stroke="none" fill={C.primary} fillOpacity={0.14} connectNulls isAnimationActive={false} />
                      <Line dataKey="fit" stroke={C.primary} dot={false} strokeWidth={2} connectNulls isAnimationActive={false} />
                      <Scatter dataKey="yObs" fill={C.violet} isAnimationActive={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                  )}</ChartFrame>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Residual plot (%)</CardTitle></CardHeader>
                <CardContent className="h-[260px]">
                  <ChartFrame>{({ ResponsiveContainer, ComposedChart, LineChart, ScatterChart, BarChart, Line, Area, Bar, Scatter, Cell, XAxis, YAxis, CartesianGrid, RTooltip, ReferenceLine, ReferenceArea, ErrorBar }) => (
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                      <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                      <XAxis dataKey="conc" type="number" domain={["auto", "auto"]} tick={{ fontSize: 11, fill: C.axis }} stroke={C.grid} name="Conc" />
                      <YAxis dataKey="residPct" tick={{ fontSize: 11, fill: C.axis }} stroke={C.grid} />
                      <RTooltip contentStyle={C.tooltip} itemStyle={C.tooltipItem} labelStyle={C.tooltipLabel} formatter={(v) => fmt(v, 2) + " %"} />
                      <ReferenceLine y={0} stroke={C.axis} />
                      <ReferenceLine y={+cr.residPctMax} stroke={C.warn} strokeDasharray="4 4" />
                      <ReferenceLine y={-cr.residPctMax} stroke={C.warn} strokeDasharray="4 4" />
                      <Scatter data={chartData} fill={C.primary} isAnimationActive={false}>
                        {chartData.map((r, i) => <Cell key={i} fill={Math.abs(r.residPct) > cr.residPctMax ? C.bad : C.primary} />)}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                  )}</ChartFrame>
                </CardContent>
              </Card>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Response factor (sensitivity)</CardTitle></CardHeader>
                <CardContent className="h-[240px]">
                  <ChartFrame>{({ ResponsiveContainer, ComposedChart, LineChart, ScatterChart, BarChart, Line, Area, Bar, Scatter, Cell, XAxis, YAxis, CartesianGrid, RTooltip, ReferenceLine, ReferenceArea, ErrorBar }) => (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={rfData} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                      <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                      <XAxis dataKey="conc" type="number" domain={["auto", "auto"]} tick={{ fontSize: 11, fill: C.axis }} stroke={C.grid} label={{ value: `Conc (${unit})`, position: "insideBottom", offset: -2, fontSize: 10, fill: C.axis }} />
                      <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11, fill: C.axis }} stroke={C.grid} tickFormatter={(v) => fmtSig(v, 3)} />
                      <RTooltip contentStyle={C.tooltip} itemStyle={C.tooltipItem} labelStyle={C.tooltipLabel} formatter={(v) => fmtSig(v, 4)} labelFormatter={(l) => `Conc ${fmtSig(l)} ${unit}`} />
                      <ReferenceArea y1={meanRF - rfTol} y2={meanRF + rfTol} fill={C.primary} fillOpacity={0.08} />
                      <ReferenceLine y={meanRF} stroke={C.ok} strokeDasharray="4 4" />
                      <Line dataKey="rf" stroke={C.grid} dot={false} strokeWidth={1} connectNulls isAnimationActive={false} />
                      <Scatter dataKey="rf" isAnimationActive={false}>
                        {rfData.map((r, i) => <Cell key={i} fill={r.ok ? C.primary : C.warn} />)}
                      </Scatter>
                    </ComposedChart>
                  </ResponsiveContainer>
                  )}</ChartFrame>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Back-calculated accuracy (%)</CardTitle></CardHeader>
                <CardContent className="h-[240px]">
                  <ChartFrame>{({ ResponsiveContainer, ComposedChart, LineChart, ScatterChart, BarChart, Line, Area, Bar, Scatter, Cell, XAxis, YAxis, CartesianGrid, RTooltip, ReferenceLine, ReferenceArea, ErrorBar }) => (
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                      <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                      <XAxis dataKey="conc" type="number" domain={["auto", "auto"]} tick={{ fontSize: 11, fill: C.axis }} stroke={C.grid} name="Conc" label={{ value: `Conc (${unit})`, position: "insideBottom", offset: -2, fontSize: 10, fill: C.axis }} />
                      <YAxis dataKey="devPct" tick={{ fontSize: 11, fill: C.axis }} stroke={C.grid} />
                      <RTooltip contentStyle={C.tooltip} itemStyle={C.tooltipItem} labelStyle={C.tooltipLabel} formatter={(v) => fmt(v, 2) + " %"} labelFormatter={(l) => `Conc ${fmtSig(l)} ${unit}`} />
                      <ReferenceArea y1={-(+cr.residPctMax)} y2={+cr.residPctMax} fill={C.ok} fillOpacity={0.07} />
                      <ReferenceLine y={0} stroke={C.axis} />
                      <ReferenceLine y={+cr.residPctMax} stroke={C.warn} strokeDasharray="4 4" />
                      <ReferenceLine y={-(+cr.residPctMax)} stroke={C.warn} strokeDasharray="4 4" />
                      <Scatter data={accData} isAnimationActive={false}>
                        {accData.map((r, i) => <Cell key={i} fill={Math.abs(r.devPct) > +cr.residPctMax ? C.bad : C.primary} />)}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                  )}</ChartFrame>
                </CardContent>
              </Card>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              The <b>confidence band</b> is the 95 % envelope of the fitted line (ŷ ± t·S<sub>y/x</sub>·√(1/n + (x−x̄)²/S<sub>xx</sub>)) — narrowest at the data centroid, widest at the ends.
              The <b>response-factor</b> plot should stay flat within the shaded band (constant sensitivity ⇒ linear); a slope or curve there signals non-linearity that R² can hide.
              {" "}<b>Back-calculated accuracy</b> reads each level back off the curve and shows its % deviation from the nominal concentration — the analyst-facing counterpart to the residual plot.
            </p>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Level-by-level evaluation</CardTitle></CardHeader>
              <CardContent>
                <DataTable
                  headers={["Conc", "Mean y", "Predicted", "Residual", "Residual %", "Resp. factor", "Rep RSD %"]}
                  rows={lin.rows.map((r) => [
                    fmt(r.conc, 3), fmtSig(r.yObs), fmtSig(r.yPred), fmtSig(r.resid, 3),
                    <span key="rp" className={Math.abs(r.residPct) > cr.residPctMax ? "text-red-500 font-semibold" : ""}>{fmt(r.residPct, 2)}</span>,
                    r.rf !== null ? fmtSig(r.rf) : "—", r.repRSD !== null ? fmt(r.repRSD, 2) : "—",
                  ])} />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    );
  };

  const LodLoqModule = () => {
    const d = study.lodloq;
    return (
      <div className="space-y-4">
        <GuideNote>
          Eurachem §6.4 + <b>Blanks in Method Validation</b> supplement: LOD = 3 × s′₀ and LOQ = k<sub>Q</sub> × s′₀
          (k<sub>Q</sub> = 10 by default), where s′₀ is the standard deviation of results at/near zero, adjusted for the
          number of replicate observations (n) and blank corrections (n<sub>b</sub>). ≥ 10 replicates recommended.
          Prefer a <b>matrix blank</b> or low-fortified sample over a pure reagent blank where the matrix contributes signal.
        </GuideNote>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Experimental design</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <NSelect label="Approach" value={d.approach} onChange={(v) => up("lodloq", { approach: v })}
                options={[
                  { value: "blank", label: "Replicate blanks" },
                  { value: "fortified", label: "Low-fortified sample" },
                  { value: "calibration", label: "From calibration (3.3·Sy/x / b₁)" },
                  { value: "usepa", label: "USEPA MDL / IDL (40 CFR 136 App. B)" },
                ]} />
              {(d.approach === "blank" || d.approach === "fortified") && (
                <>
                  <NSelect label="Blank type" value={d.blankType} onChange={(v) => up("lodloq", { blankType: v })}
                    options={[{ value: "reagent", label: "Reagent blank" }, { value: "matrix", label: "Matrix blank" }]} />
                  <Field label="n (reps per future result)" type="number" value={d.n} onChange={(e) => up("lodloq", { n: e.target.value === "" ? "" : +e.target.value })} />
                  <Field label="n_b (blank reps averaged)" type="number" value={d.nb} onChange={(e) => up("lodloq", { nb: e.target.value === "" ? "" : +e.target.value })} />
                </>
              )}
            </div>
            {(d.approach === "blank" || d.approach === "fortified") && (
              <>
                <div className="flex items-center gap-2">
                  <Switch checked={d.blankCorrected} onCheckedChange={(v) => up("lodloq", { blankCorrected: v })} />
                  <span className="text-[12px] text-muted-foreground">Results are blank-corrected → s′₀ = s₀·√(1/n + 1/n<sub>b</sub>)</span>
                </div>
                <RepGrid label={`${d.blankType === "matrix" ? "Matrix blank" : "Reagent blank"} / low-level results (${unit})`}
                  values={d.reps} onChange={(v) => up("lodloq", { reps: v })}
                  outlierIdx={lod?.grubbs?.outlierIdx ?? -1} />
                {lod?.grubbs?.outlierIdx >= 0 && (
                  <div className="text-[12px] text-amber-600 flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" />
                    Grubbs test flags {fmtSig(lod.grubbs.outlierVal)} as a possible outlier (G = {fmt(lod.grubbs.G, 2)} &gt; {fmt(lod.grubbs.crit, 2)}). Investigate before excluding.
                  </div>
                )}
              </>
            )}
            {d.approach === "calibration" && (
              <div className="text-[12px] text-muted-foreground">
                Uses Sy/x = {lin ? fmtSig(lin.syx) : "—"} and slope b₁ = {lin ? fmtSig(lin.slope) : "—"} from the Linearity module.
                {!lin && " Enter calibration data first."}
              </div>
            )}
            {d.approach === "usepa" && (
              <div className="space-y-5">
                <div className="rounded-lg border border-border p-3.5 space-y-3">
                  <div className="text-[12px] font-semibold text-foreground">IDL — Instrument Detection Limit</div>
                  <div className="text-[11px] text-muted-foreground">
                    ≥ 7 replicate measurements of a low-level standard (≈ 3–5× the estimated IDL) injected directly on the instrument,
                    no sample preparation. IDL = k × s.
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Field label="k (multiplier)" type="number" value={d.idlK} onChange={(e) => up("lodloq", { idlK: e.target.value === "" ? "" : +e.target.value })} />
                  </div>
                  <RepGrid label={`Low-level standard measurements (${unit})`}
                    values={d.idlReps} onChange={(v) => up("lodloq", { idlReps: v })} />
                </div>
                <div className="rounded-lg border border-border p-3.5 space-y-3">
                  <div className="text-[12px] font-semibold text-foreground">MDL — Method Detection Limit (40 CFR 136 App. B, 2017 rev.)</div>
                  <div className="text-[11px] text-muted-foreground">
                    ≥ 7 spiked replicates carried through the entire method (spike ≈ 2–10× the estimated MDL), ideally over ≥ 3 days/batches.
                    MDL<sub>spiked</sub> = t<sub>(n−1, 0.99)</sub> × s. If method blanks give detectable results, also compute
                    MDL<sub>blank</sub> = mean + t<sub>(n−1, 0.99)</sub> × s. The reported MDL is the greater of the two.
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Field label={`Spike level (${unit})`} type="number" value={d.spikeLevel} onChange={(e) => up("lodloq", { spikeLevel: e.target.value === "" ? "" : +e.target.value })} />
                  </div>
                  <RepGrid label={`Spiked-sample replicates (${unit})`}
                    values={d.mdlSpiked} onChange={(v) => up("lodloq", { mdlSpiked: v })} />
                  <RepGrid label={`Method-blank replicates (${unit}) — leave empty if all non-detect`}
                    values={d.mdlBlank} onChange={(v) => up("lodloq", { mdlBlank: v })} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        {lod && lod.approach === "usepa" && (
          <>
            <div className="flex flex-wrap gap-2">
              {lod.idl && <Stat label={`IDL (${fmt(lod.idl.k, 0)}·s)`} value={fmtSig(lod.idl.value)} unit={unit} status="pass" />}
              {lod.mdlSpiked && <Stat label="MDL spiked (t·s)" value={fmtSig(lod.mdlSpiked.value)} unit={unit}
                status={lod.governed === "spiked" ? "pass" : undefined} />}
              {lod.mdlBlank && <Stat label="MDL blank (x̄+t·s)" value={fmtSig(lod.mdlBlank.value)} unit={unit}
                status={lod.governed === "blank" ? "pass" : undefined} />}
              {lod.mdl != null && <Stat label="MDL (reported)" value={fmtSig(lod.mdl)} unit={unit} status="pass" />}
            </div>
            {lod.spikeRatio != null && (lod.spikeRatio < 1 || lod.spikeRatio > 10) && (
              <div className="text-[12px] text-amber-600 flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" />
                Spike level is {fmt(lod.spikeRatio, 1)}× the calculated MDL. USEPA requires the spike to fall within 1–10× the MDL —
                re-spike nearer the limit and repeat the determination.
              </div>
            )}
            <WorkSteps steps={[
              lod.idl && { label: `IDL — instrument detection limit  (k = ${fmt(lod.idl.k, 0)}, n = ${lod.idl.n} injections)`,
                formula: `IDL = k · s = ${fmt(lod.idl.k, 0)} × ${fmtSig(lod.idl.sd)} = ${fmtSig(lod.idl.value)} ${unit}` },
              lod.mdlSpiked && { label: `MDL from spiked replicates  (n = ${lod.mdlSpiked.n}, df = ${lod.mdlSpiked.n - 1}, one-sided t₉₉ = ${fmt(lod.mdlSpiked.t, 3)})`,
                formula: `MDLₛ = t · s = ${fmt(lod.mdlSpiked.t, 3)} × ${fmtSig(lod.mdlSpiked.sd)} = ${fmtSig(lod.mdlSpiked.value)} ${unit}` },
              lod.mdlBlank && { label: `MDL from method blanks  (n = ${lod.mdlBlank.n}, t₉₉ = ${fmt(lod.mdlBlank.t, 3)})`,
                formula: `MDL_b = x̄ + t · s = ${fmtSig(lod.mdlBlank.mean)} + ${fmt(lod.mdlBlank.t, 3)} × ${fmtSig(lod.mdlBlank.sd)} = ${fmtSig(lod.mdlBlank.value)} ${unit}` },
              lod.mdl != null && { label: "Reported MDL = the greater of the two estimates",
                formula: `MDL = max( ${lod.mdlSpiked ? `MDLₛ = ${fmtSig(lod.mdlSpiked.value)}` : "—"}${lod.mdlBlank ? ` , MDL_b = ${fmtSig(lod.mdlBlank.value)}` : ""} ) = ${fmtSig(lod.mdl)} ${unit}   (${lod.governed === "blank" ? "blank-governed" : "spike-governed"})` },
            ]} />
            <GuideNote>
              USEPA 40 CFR Part 136, Appendix B: the MDL uses a one-sided 99 % Student-t
              {lod.mdlSpiked && <> (t = {fmt(lod.mdlSpiked.t, 3)} at {lod.mdlSpiked.n - 1} df)</>} and is the greater of the
              spiked-sample and method-blank estimates. Verify the MDL annually and after any significant method change. IDL characterises
              instrument sensitivity only (no matrix or sample prep) and is typically higher-order sensitivity than the whole-method MDL.
            </GuideNote>
          </>
        )}
        {lod && lod.approach !== "usepa" && (
          <>
            <div className="flex flex-wrap gap-2">
              {lod.approach !== "calibration" && <>
                <Stat label="Mean blank" value={fmtSig(lod.mean)} unit={unit} />
                <Stat label="s₀" value={fmtSig(lod.s0)} unit={unit} />
                <Stat label="s′₀" value={fmtSig(lod.s0p)} unit={unit} />
              </>}
              <Stat label="LOD (3·s′₀)" value={fmtSig(lod.lod)} unit={unit} status="pass" />
              <Stat label={`LOQ (${cr.kQ}·s′₀)`} value={fmtSig(lod.loq)} unit={unit} status="pass" />
            </div>
            <LodDistributionChart lod={lod} kQ={cr.kQ} unit={unit} C={C} />
            {lod.approach === "calibration" ? (
              <WorkSteps steps={[
                { label: "Uses the residual SD Sy/x and slope b₁ from the Linearity module",
                  formula: `Sy/x = ${fmtSig(lod.syx)}    b₁ = ${fmtSig(lod.slope)}` },
                { label: "LOD = 3.3 · Sy/x / b₁",
                  formula: `LOD = 3.3 × ${fmtSig(lod.syx)} / ${fmtSig(lod.slope)} = ${fmtSig(lod.lod)} ${unit}` },
                { label: `LOQ = k_Q · Sy/x / b₁   (k_Q = ${cr.kQ})`,
                  formula: `LOQ = ${cr.kQ} × ${fmtSig(lod.syx)} / ${fmtSig(lod.slope)} = ${fmtSig(lod.loq)} ${unit}` },
              ]} />
            ) : (() => {
              const reps = clean(d.reps);
              const nI = Math.max(1, num(d.n) ?? 1);
              const nB = Math.max(1, num(d.nb) ?? reps.length);
              return <WorkSteps steps={[
                { label: `1. Standard deviation of the ${reps.length} low-level results  s₀ = √[ Σ(xᵢ − x̄)² / (n − 1) ]`,
                  formula: `x̄ = ${fmtSig(lod.mean)} ${unit}    s₀ = ${fmtSig(lod.s0)} ${unit}` },
                { label: d.blankCorrected
                    ? `2. Adjust for blank correction  s′₀ = s₀ · √(1/n + 1/n_b)   (n = ${nI}, n_b = ${nB})`
                    : `2. Adjust for n replicates per reported result  s′₀ = s₀ / √n   (n = ${nI})`,
                  formula: d.blankCorrected
                    ? `s′₀ = ${fmtSig(lod.s0)} · √(1/${nI} + 1/${nB}) = ${fmtSig(lod.s0p)} ${unit}`
                    : `s′₀ = ${fmtSig(lod.s0)} / √${nI} = ${fmtSig(lod.s0p)} ${unit}` },
                { label: "3. LOD = 3 · s′₀",
                  formula: `LOD = 3 × ${fmtSig(lod.s0p)} = ${fmtSig(lod.lod)} ${unit}` },
                { label: `4. LOQ = k_Q · s′₀   (k_Q = ${cr.kQ})`,
                  formula: `LOQ = ${cr.kQ} × ${fmtSig(lod.s0p)} = ${fmtSig(lod.loq)} ${unit}` },
              ]} />;
            })()}
            <GuideNote>
              Verify the LOQ experimentally: measure a sample fortified at the calculated LOQ and confirm the precision and
              bias there still meet the analytical requirement ({study.info.requirement || "define it in Study Plan"}).
            </GuideNote>
          </>
        )}
      </div>
    );
  };

  const PrecisionModule = () => {
    const g = study.precision.groups;
    const setG = (v) => up("precision", { groups: v });
    const barData = prec ? prec.groups.map((gr, i) => ({ name: `${study.precision.label} ${i + 1}`, mean: S.mean(gr), sd: S.sd(gr) })) : [];
    return (
      <div className="space-y-4">
        <GuideNote>
          Eurachem §6.6 — three tiers of precision: <b>repeatability</b> s<sub>r</sub> (within-group, one operator/day/instrument),
          <b> intermediate precision</b> s<sub>I</sub> (intra-laboratory reproducibility — varying day/analyst/instrument within the lab), and
          <b> reproducibility</b> s<sub>R</sub> (inter-laboratory). One-way ANOVA across ≥ 8 groups × ≥ 2 replicates gives s<sub>r</sub> and
          s<sub>I</sub>; s<sub>R</sub> comes from a collaborative trial or PT and is benchmarked below with the Horwitz/HorRat check.
          Precision limit = 2.8 × s.
        </GuideNote>
        <Card>
          <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">Nested design ({study.precision.label.toLowerCase()}s × replicates)</CardTitle>
            <div className="flex gap-2 items-center">
              <NSelect value={study.precision.label} onChange={(v) => up("precision", { label: v })}
                options={["Day", "Analyst", "Run", "Instrument"].map((v) => ({ value: v, label: `Group = ${v}` }))} />
              <Button variant="outline" size="sm" onClick={() => setG([...g, ["", "", ""]])}><Plus className="h-3.5 w-3.5 mr-1" />{study.precision.label}</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {g.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[11px] font-data text-muted-foreground w-14 shrink-0">{study.precision.label} {i + 1}</span>
                <div className="flex-1"><RepGrid values={row} onChange={(v) => { const a = [...g]; a[i] = v; setG(a); }} /></div>
                <Button variant="ghost" size="sm" className="text-destructive h-8" onClick={() => askDelete(`This ${study.precision.label.toLowerCase()} group and its replicate values will be removed.`, () => setG(g.filter((_, k) => k !== i)), `Delete this ${study.precision.label.toLowerCase()}?`)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            ))}
          </CardContent>
        </Card>
        {prec && (
          <>
            <div className="flex flex-wrap gap-2">
              <Stat label="Grand mean" value={fmtSig(prec.gm)} unit={unit} />
              <Stat label="sr (repeatability)" value={fmtSig(prec.sr)} unit={unit} />
              <Stat label="RSDr" value={fmt(prec.rsdR, 2)} unit="%" status={prec.rsdR <= cr.rsdRMax ? "pass" : "fail"} />
              <Stat label="sI (intermediate)" value={fmtSig(prec.sI)} unit={unit} />
              <Stat label="RSDI" value={fmt(prec.rsdI, 2)} unit="%" status={prec.rsdI <= cr.rsdIMax ? "pass" : "fail"} />
              <Stat label="r limit (2.8·sr)" value={fmtSig(prec.rLimit)} unit={unit} />
            </div>
            {(() => {
              const nBar = prec.N / prec.p;
              const varBetween = prec.sBetween ** 2;
              return <WorkSteps steps={[
                { label: `1. Design: p = ${prec.p} groups, N = ${prec.N} results total, grand mean x̿`,
                  formula: `x̿ = ${fmtSig(prec.gm)} ${unit}     n̄ = N/p = ${prec.N}/${prec.p} = ${fmt(nBar, 3)}` },
                { label: "2. Between-group sum of squares  SSb = Σ nᵢ(x̄ᵢ − x̿)²   →   MSb = SSb/(p−1)",
                  formula: `SSb = ${fmtSig(prec.ssb)}   df_b = ${prec.dfb}   MSb = ${fmtSig(prec.ssb)}/${prec.dfb} = ${fmtSig(prec.msb)}` },
                { label: "3. Within-group sum of squares  SSw = ΣΣ(xᵢⱼ − x̄ᵢ)²   →   MSw = SSw/(N−p)",
                  formula: `SSw = ${fmtSig(prec.ssw)}   df_w = ${prec.dfw}   MSw = ${fmtSig(prec.ssw)}/${prec.dfw} = ${fmtSig(prec.msw)}` },
                { label: "4. Repeatability  sr = √MSw   →   RSDr = sr/x̿ × 100",
                  formula: `sr = √${fmtSig(prec.msw)} = ${fmtSig(prec.sr)} ${unit}     RSDr = ${fmtSig(prec.sr)}/${fmtSig(prec.gm)} × 100 = ${fmt(prec.rsdR, 2)} %` },
                { label: "5. Between-group variance component  s²_between = (MSb − MSw)/n̄   (set to 0 if MSb ≤ MSw)",
                  formula: `s²_between = (${fmtSig(prec.msb)} − ${fmtSig(prec.msw)})/${fmt(nBar, 3)} = ${fmtSig(varBetween)}   →   s_between = ${fmtSig(prec.sBetween)}` },
                { label: "6. Intermediate precision  sI = √(sr² + s²_between)   →   RSDI = sI/x̿ × 100",
                  formula: `sI = √(${fmtSig(prec.sr ** 2)} + ${fmtSig(varBetween)}) = ${fmtSig(prec.sI)} ${unit}     RSDI = ${fmt(prec.rsdI, 2)} %` },
                { label: `7. F-test for a significant between-group effect  F = MSb/MSw  vs  F_crit(${prec.dfb}, ${prec.dfw})`,
                  formula: `F = ${fmtSig(prec.msb)}/${fmtSig(prec.msw)} = ${fmt(prec.f, 2)}  ${prec.f > prec.fCrit ? ">" : "≤"}  ${fmt(prec.fCrit, 2)}   →   ${prec.f > prec.fCrit ? "significant" : "not significant"}` },
                { label: "8. Repeatability limit  r = 2.8 · sr",
                  formula: `r = 2.8 × ${fmtSig(prec.sr)} = ${fmtSig(prec.rLimit)} ${unit}` },
                prec.horwitz && { label: "9. Horwitz benchmark  PRSD_R = 2·C^(−0.1505),  HorRat_r = RSDr / (0.66·PRSD_R)",
                  formula: `PRSD_R = 2 × ${fmtSig(prec.horwitz.C)}^(−0.1505) = ${fmt(prec.horwitz.predRSDr, 2)} %     HorRat_r = ${fmt(prec.rsdR, 2)} / ${fmt(prec.horwitz.predRSDrRep, 2)} = ${fmt(prec.horwitz.horRatr, 2)}` },
              ]} />;
            })()}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">ANOVA table</CardTitle></CardHeader>
                <CardContent>
                  <DataTable headers={["Source", "SS", "df", "MS", "F", "F crit (5 %)"]}
                    rows={[
                      ["Between-group", fmtSig(prec.ssb), prec.dfb, fmtSig(prec.msb),
                        <span key="f" className={prec.f > prec.fCrit ? "text-amber-600 font-semibold" : ""}>{fmt(prec.f, 2)}</span>, fmt(prec.fCrit, 2)],
                      ["Within-group", fmtSig(prec.ssw), prec.dfw, fmtSig(prec.msw), "", ""],
                    ]} />
                  <p className="text-[11px] text-muted-foreground mt-2">
                    {prec.f > prec.fCrit
                      ? `F > F crit: between-${study.precision.label.toLowerCase()} variation is significant — sI properly includes it.`
                      : `F ≤ F crit: no significant between-${study.precision.label.toLowerCase()} effect; sI ≈ sr.`}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Group means ± SD</CardTitle></CardHeader>
                <CardContent className="h-[230px]">
                  <ChartFrame>{({ ResponsiveContainer, ComposedChart, LineChart, ScatterChart, BarChart, Line, Area, Bar, Scatter, Cell, XAxis, YAxis, CartesianGrid, RTooltip, ReferenceLine, ReferenceArea, ErrorBar }) => (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                      <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: C.axis }} stroke={C.grid} />
                      <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11, fill: C.axis }} stroke={C.grid} />
                      <RTooltip contentStyle={C.tooltip} itemStyle={C.tooltipItem} labelStyle={C.tooltipLabel} formatter={(v) => fmtSig(v)} />
                      <ReferenceLine y={prec.gm} stroke={C.primary} strokeDasharray="4 4" />
                      <Bar dataKey="mean" fill={C.primary} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                        <ErrorBar dataKey="sd" stroke={C.axis} width={3} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  )}</ChartFrame>
                </CardContent>
              </Card>
            </div>
            {(() => {
              const label = study.precision.label;
              const jitter = (i, n) => (n <= 1 ? 0 : ((i / (n - 1)) - 0.5) * 0.5);
              const strip = [];
              prec.groups.forEach((g, gi) => g.forEach((v, i) => strip.push({ x: gi + 1 + jitter(i, g.length), y: v, grp: `${label} ${gi + 1}` })));
              const gmeans = prec.groups.map((g, gi) => ({ x: gi + 1, y: S.mean(g), sd: S.sd(g), grp: `${label} ${gi + 1}`, isMean: true }));
              const ticks = Array.from({ length: prec.p }, (_, i) => i + 1);
              const varW = prec.sr ** 2, varB = prec.sBetween ** 2, varT = varW + varB || 1;
              const rL = +cr.rsdRMax, iL = +cr.rsdIMax;
              const rsdBars = [
                { name: "RSDr", measured: prec.rsdR, limit: Number.isFinite(rL) ? rL : 0, ok: !Number.isFinite(rL) || prec.rsdR <= rL },
                { name: "RSDI", measured: prec.rsdI, limit: Number.isFinite(iL) ? iL : 0, ok: !Number.isFinite(iL) || prec.rsdI <= iL },
              ];
              const PrecTip = ({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const pt = payload[0].payload;
                return (
                  <div style={{ ...C.tooltip, padding: "6px 9px", minWidth: 150 }}>
                    <div style={{ ...C.tooltipLabel }}>{pt.grp}{pt.isMean ? " — mean" : ""}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, ...C.tooltipItem }}><span>{pt.isMean ? "Mean" : "Value"}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtSig(pt.y, 4)} {unit}</span></div>
                    {pt.isMean && <div style={{ display: "flex", justifyContent: "space-between", gap: 12, ...C.tooltipItem }}><span>SD</span><span style={{ fontVariantNumeric: "tabular-nums" }}>± {fmtSig(pt.sd, 3)}</span></div>}
                  </div>
                );
              };
              return (
                <div className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Individual values by {label.toLowerCase()}</CardTitle></CardHeader>
                    <CardContent className="h-[240px]">
                      <ChartFrame>{({ ResponsiveContainer, ComposedChart, LineChart, ScatterChart, BarChart, Line, Area, Bar, Scatter, Cell, XAxis, YAxis, CartesianGrid, RTooltip, ReferenceLine, ReferenceArea, ErrorBar }) => (
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 8, right: 14, bottom: 4, left: 0 }}>
                          <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                          <XAxis type="number" dataKey="x" domain={[0.5, prec.p + 0.5]} ticks={ticks} tickFormatter={(t) => `${label} ${t}`} tick={{ fontSize: 10, fill: C.axis }} stroke={C.grid} />
                          <YAxis type="number" dataKey="y" domain={["auto", "auto"]} tick={{ fontSize: 11, fill: C.axis }} stroke={C.grid} tickFormatter={(v) => fmtSig(v, 3)} />
                          <RTooltip cursor={{ strokeDasharray: "3 3" }} content={<PrecTip />} />
                          <ReferenceArea y1={prec.gm - prec.sI} y2={prec.gm + prec.sI} fill={C.primary} fillOpacity={0.07} />
                          <ReferenceArea y1={prec.gm - prec.sr} y2={prec.gm + prec.sr} fill={C.ok} fillOpacity={0.10} />
                          <ReferenceLine y={prec.gm} stroke={C.primary} strokeDasharray="4 4" />
                          <Scatter data={strip} fill={C.violet} fillOpacity={0.55} isAnimationActive={false} />
                          <Scatter data={gmeans} fill={C.warn} shape="diamond" isAnimationActive={false}>
                            <ErrorBar dataKey="sd" width={4} strokeWidth={1.4} stroke={C.warn} direction="y" />
                          </Scatter>
                        </ScatterChart>
                      </ResponsiveContainer>
                      )}</ChartFrame>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Variance components</CardTitle></CardHeader>
                    <CardContent>
                      <div className="h-[188px]">
                        <ChartFrame>{({ ResponsiveContainer, ComposedChart, LineChart, ScatterChart, BarChart, Line, Area, Bar, Scatter, Cell, XAxis, YAxis, CartesianGrid, RTooltip, ReferenceLine, ReferenceArea, ErrorBar }) => (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={[{ name: "Total σ² (sI²)", within: varW, between: varB }]} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                            <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                            <XAxis dataKey="name" tick={{ fontSize: 10, fill: C.axis }} stroke={C.grid} />
                            <YAxis tick={{ fontSize: 11, fill: C.axis }} stroke={C.grid} tickFormatter={(v) => fmtSig(v, 2)} />
                            <RTooltip contentStyle={C.tooltip} itemStyle={C.tooltipItem} labelStyle={C.tooltipLabel}
                              formatter={(v, n) => [`${fmtSig(v, 3)} (${fmt((v / varT) * 100, 0)} %)`, n === "within" ? "Repeatability sr²" : "Between-group s²b"]} />
                            <Bar dataKey="within" stackId="v" fill={C.primary} isAnimationActive={false} />
                            <Bar dataKey="between" stackId="v" fill={C.violet} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                          </BarChart>
                        </ResponsiveContainer>
                        )}</ChartFrame>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground mt-1.5">
                        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: C.primary }} />Repeatability s<sub>r</sub>² · {fmt((varW / varT) * 100, 0)} %</span>
                        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: C.violet }} />Between-{label.toLowerCase()} s²<sub>b</sub> · {fmt((varB / varT) * 100, 0)} %</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
                <Card>
                  <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Precision vs acceptance limits</CardTitle></CardHeader>
                  <CardContent className="h-[220px]">
                    <ChartFrame>{({ ResponsiveContainer, ComposedChart, LineChart, ScatterChart, BarChart, Line, Area, Bar, Scatter, Cell, XAxis, YAxis, CartesianGrid, RTooltip, ReferenceLine, ReferenceArea, ErrorBar }) => (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={rsdBars} margin={{ top: 8, right: 12, bottom: 4, left: 0 }} barGap={6}>
                        <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.axis }} stroke={C.grid} />
                        <YAxis tick={{ fontSize: 11, fill: C.axis }} stroke={C.grid} tickFormatter={(v) => v + "%"} />
                        <RTooltip contentStyle={C.tooltip} itemStyle={C.tooltipItem} labelStyle={C.tooltipLabel} formatter={(v, n) => [fmt(v, 2) + " %", n === "limit" ? "Acceptance limit" : "Measured"]} />
                        <Bar dataKey="limit" fill={C.grid} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                        <Bar dataKey="measured" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                          {rsdBars.map((r, i) => <Cell key={i} fill={r.ok ? C.primary : C.bad} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    )}</ChartFrame>
                  </CardContent>
                </Card>
                </div>
              );
            })()}
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              <b>Individual values</b> plots every replicate (purple) grouped by {study.precision.label.toLowerCase()}, with the {study.precision.label.toLowerCase()} means (amber diamonds ± SD), the grand mean (dashed line), and the ±s<sub>r</sub> repeatability (green) and ±s<sub>I</sub> intermediate-precision (teal) bands — tight clusters sitting inside the bands mean good precision.
              {" "}<b>Variance components</b> shows how the total variance splits into within-{study.precision.label.toLowerCase()} repeatability vs between-{study.precision.label.toLowerCase()} spread — the ANOVA partition behind s<sub>I</sub>.
              {" "}<b>Precision vs limits</b> compares the measured RSD<sub>r</sub> and RSD<sub>I</sub> (green = within, red = over) against their acceptance limits (grey).
            </p>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Reproducibility (inter-laboratory) &amp; Horwitz / HorRat</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="text-[12px] text-muted-foreground">
                  Reproducibility s<sub>R</sub> requires an interlaboratory collaborative trial or proficiency-test data — it cannot be
                  obtained from single-lab replicates. Enter a measured s<sub>R</sub> if you have one, and provide the analyte mass fraction
                  to benchmark precision against the Horwitz curve (predicted RSD<sub>R</sub> = 2 × C<sup>−0.1505</sup>). A HorRat between
                  0.5 and 2 indicates acceptable precision.
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Field label="Analyte mass fraction C" type="number" step="any" value={study.precision.massFraction}
                    onChange={(e) => up("precision", { massFraction: e.target.value === "" ? "" : +e.target.value })} />
                  <Field label={`Measured sR (${unit}, optional)`} type="number" step="any" value={study.precision.sRMeasured}
                    onChange={(e) => up("precision", { sRMeasured: e.target.value === "" ? "" : +e.target.value })} />
                </div>
                <div className="text-[11px] text-muted-foreground -mt-1">
                  C is dimensionless: e.g. 1 % = 1e-2, 1 mg/kg (ppm) = 1e-6, 1 µg/kg (ppb) = 1e-9. Match it to the level under study.
                </div>
                {prec.horwitz ? (
                  <div className="flex flex-wrap gap-2">
                    <Stat label="Horwitz PRSD_R" value={fmt(prec.horwitz.predRSDr, 2)} unit="%" />
                    <Stat label="Pred. RSDr (0.66·PRSD_R)" value={fmt(prec.horwitz.predRSDrRep, 2)} unit="%" />
                    <Stat label="HorRat_r" value={fmt(prec.horwitz.horRatr, 2)}
                      status={prec.horwitz.horRatr >= 0.5 && prec.horwitz.horRatr <= 2 ? "pass" : "fail"} />
                    {prec.horwitz.rsdRepro != null && <>
                      <Stat label="sR (measured)" value={fmtSig(prec.horwitz.sR)} unit={unit} />
                      <Stat label="RSD_R" value={fmt(prec.horwitz.rsdRepro, 2)} unit="%" />
                      <Stat label="HorRat_R" value={fmt(prec.horwitz.horRatR, 2)}
                        status={prec.horwitz.horRatR >= 0.5 && prec.horwitz.horRatR <= 2 ? "pass" : "fail"} />
                      <Stat label="R limit (2.8·sR)" value={fmtSig(prec.horwitz.reproLimit)} unit={unit} />
                    </>}
                  </div>
                ) : (
                  <div className="text-[12px] text-amber-600">Enter a positive mass fraction C to compute the Horwitz benchmark.</div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    );
  };

  const ComparisonModule = () => {
    const d = study.comparison;
    const twoSet = d.mode === "twoSample";
    const pGroups = study.precision.groups;
    const groupOpts = pGroups.map((_, i) => ({ value: String(i), label: `${study.precision.label} ${i + 1}` }));
    const loadPrecisionGroups = () => {
      const ia = Math.min(+d.srcA || 0, pGroups.length - 1);
      const ib = Math.min(+d.srcB || 0, pGroups.length - 1);
      up("comparison", {
        mode: "twoSample",
        labelA: `${study.precision.label} ${ia + 1}`, labelB: `${study.precision.label} ${ib + 1}`,
        dataA: [...(pGroups[ia] || [])], dataB: [...(pGroups[ib] || [])],
      });
    };
    const loadTruenessSpike = () => up("comparison", {
      mode: "twoSample", labelA: "Unspiked", labelB: "Spiked",
      dataA: [...study.trueness.unspiked], dataB: [...study.trueness.spiked],
    });
    const loadTruenessCRM = () => up("comparison", {
      mode: "oneSample", labelA: "CRM replicates",
      dataA: [...study.trueness.crmReps], refValue: study.trueness.crmRef,
    });
    const barData = comp
      ? (comp.mode === "twoSample"
          ? [
              { name: d.labelA || "A", mean: S.mean(comp.a), sd: S.sd(comp.a) },
              { name: d.labelB || "B", mean: S.mean(comp.b), sd: S.sd(comp.b) },
            ]
          : [{ name: d.labelA || "A", mean: comp.mean, sd: comp.sd }])
      : [];
    return (
      <div className="space-y-4">
        <GuideNote>
          Significance testing for method verification (Eurachem §6.3 / ISO/IEC 17025 §7.2.2). The two tests are <b>linked</b>:
          the <b>F-test</b> first compares the two <i>variances</i> (precision), and its outcome decides which <b>t-test</b> compares
          the two <i>means</i> (bias) — a <b>pooled-variance</b> t-test when the variances are comparable, or the <b>Welch</b> t-test
          when they differ. Use it to compare a new method vs a reference method, two analysts, two instruments, or two lots — or a
          single data set against a certified/target value.
        </GuideNote>

        <Card>
          <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">Data sets</CardTitle>
            <NSelect value={d.mode} onChange={(v) => up("comparison", { mode: v })}
              options={[
                { value: "twoSample", label: "Two data sets  (F-test + t-test)" },
                { value: "oneSample", label: "One set vs reference value  (t-test)" },
              ]} />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Field label={twoSet ? "Label — data set A" : "Label — data set"} value={d.labelA}
                  onChange={(e) => up("comparison", { labelA: e.target.value })} placeholder="Reference method" />
                <RepGrid label="Results A" values={d.dataA} onChange={(v) => up("comparison", { dataA: v })} />
              </div>
              {twoSet ? (
                <div className="space-y-2">
                  <Field label="Label — data set B" value={d.labelB}
                    onChange={(e) => up("comparison", { labelB: e.target.value })} placeholder="New method" />
                  <RepGrid label="Results B" values={d.dataB} onChange={(v) => up("comparison", { dataB: v })} />
                </div>
              ) : (
                <div className="space-y-2">
                  <Field label="Reference / certified value" type="number" step="any" value={d.refValue}
                    onChange={(e) => up("comparison", { refValue: e.target.value === "" ? "" : +e.target.value })} />
                  <div className="text-[11px] text-muted-foreground">
                    The one-sample t-test checks whether the mean of the data set differs from this stated value. The F-test needs
                    two data sets, so it is shown only in the two-set mode.
                  </div>
                </div>
              )}
            </div>
            <Separator />
            <div className="rounded-lg border border-dashed border-border p-3 space-y-2.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Prefill from another module</div>
              {twoSet ? (
                <div className="flex flex-wrap items-end gap-2">
                  <NSelect label="Precision → A" value={d.srcA} onChange={(v) => up("comparison", { srcA: v })} options={groupOpts} />
                  <NSelect label="Precision → B" value={d.srcB} onChange={(v) => up("comparison", { srcB: v })} options={groupOpts} />
                  <Button variant="outline" size="sm" className="h-9" onClick={loadPrecisionGroups}>
                    <GitCompareArrows className="h-3.5 w-3.5 mr-1.5" />Load precision groups
                  </Button>
                  <Button variant="outline" size="sm" className="h-9" onClick={loadTruenessSpike}>
                    <Beaker className="h-3.5 w-3.5 mr-1.5" />Load Trueness unspiked vs spiked
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-end gap-2">
                  <Button variant="outline" size="sm" className="h-9" onClick={loadTruenessCRM}>
                    <Target className="h-3.5 w-3.5 mr-1.5" />Load Trueness CRM replicates (sets reference)
                  </Button>
                </div>
              )}
              <div className="text-[11px] text-muted-foreground">
                Copies a snapshot of the chosen data here — later edits in this module don't change the source, and vice versa.
              </div>
            </div>
            {!comp && (
              <div className="text-[12px] text-amber-600">
                Enter at least 2 values in each required field to run the tests.
              </div>
            )}
          </CardContent>
        </Card>

        {comp && comp.mode === "twoSample" && (
          <>
            <div className="flex flex-wrap gap-2">
              <Stat label={`Mean ${d.labelA || "A"}`} value={fmtSig(comp.tt.m1)} unit={unit} />
              <Stat label={`Mean ${d.labelB || "B"}`} value={fmtSig(comp.tt.m2)} unit={unit} />
              <Stat label="Difference" value={fmtSig(comp.tt.diff)} unit={unit} />
              <Stat label={`s ${d.labelA || "A"}`} value={fmtSig(comp.f.sa)} unit={unit} />
              <Stat label={`s ${d.labelB || "B"}`} value={fmtSig(comp.f.sb)} unit={unit} />
            </div>

            {/* F-test → t-test decision link */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-3 items-stretch">
              <Card className={comp.f.significant ? "border-amber-500/50" : "border-emerald-600/40"}>
                <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">Step 1 — F-test (variances)</CardTitle></CardHeader>
                <CardContent className="space-y-1.5">
                  <div className="font-data text-sm">F = s²(larger)/s²(smaller) = {fmt(comp.f.F, 3)}</div>
                  <div className="text-[12px] text-muted-foreground">F crit (α = 0.05, two-tailed; df {comp.f.df1}, {comp.f.df2}) = {fmt(comp.f.fCrit, 2)}</div>
                  <div className={`text-[13px] font-medium ${comp.f.significant ? "text-amber-600" : "text-emerald-600"}`}>
                    {comp.f.significant ? "F > F crit → variances differ significantly" : "F ≤ F crit → variances comparable"}
                  </div>
                </CardContent>
              </Card>
              <div className="hidden lg:flex flex-col items-center justify-center text-muted-foreground px-1">
                <GitCompareArrows className="h-5 w-5 text-primary" />
                <span className="text-[10px] uppercase tracking-wider mt-1 text-center leading-tight">selects<br />t-test</span>
              </div>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">Step 2 — {comp.pooled ? "Pooled" : "Welch"} t-test (means)</CardTitle></CardHeader>
                <CardContent className="space-y-1.5">
                  <div className="font-data text-sm">t = {fmt(comp.tt.t, 3)}</div>
                  <div className="text-[12px] text-muted-foreground">t crit (95 %, df {fmt(comp.tt.df, 1)}) = {fmt(comp.tt.tCrit, 3)}</div>
                  <div className={`text-[13px] font-medium ${comp.tt.significant ? "text-amber-600" : "text-emerald-600"}`}>
                    {comp.tt.significant ? "t > t crit → means differ significantly" : "t ≤ t crit → no significant difference"}
                  </div>
                </CardContent>
              </Card>
            </div>

            <WorkSteps steps={[
              { label: "1. Sample variances", formula: `s²(${d.labelA || "A"}) = ${fmtSig(comp.f.va)}   s²(${d.labelB || "B"}) = ${fmtSig(comp.f.vb)}` },
              { label: "2. F-test — larger variance over smaller", formula: `F = ${fmtSig(Math.max(comp.f.va, comp.f.vb))} / ${fmtSig(Math.min(comp.f.va, comp.f.vb))} = ${fmt(comp.f.F, 3)}   vs   F(0.025; ${comp.f.df1}, ${comp.f.df2}) = ${fmt(comp.f.fCrit, 2)}  →  ${comp.f.significant ? "different" : "comparable"}` },
              { label: `3. Variance decision selects the t-test → ${comp.pooled ? "pooled (equal-variance)" : "Welch (unequal-variance)"}`,
                formula: comp.pooled
                  ? `s_p = √{[(n₁−1)s₁² + (n₂−1)s₂²]/(n₁+n₂−2)} = ${fmtSig(comp.tt.sp)}   SE = s_p·√(1/n₁+1/n₂) = ${fmtSig(comp.tt.se)}`
                  : `SE = √(s₁²/n₁ + s₂²/n₂) = ${fmtSig(comp.tt.se)}   df = ${fmt(comp.tt.df, 2)} (Welch–Satterthwaite)` },
              { label: "4. t statistic and decision", formula: `t = |${fmtSig(comp.tt.m1)} − ${fmtSig(comp.tt.m2)}| / ${fmtSig(comp.tt.se)} = ${fmt(comp.tt.t, 3)}   ${comp.tt.t > comp.tt.tCrit ? ">" : "≤"}   t crit = ${fmt(comp.tt.tCrit, 3)}  →  ${comp.tt.significant ? "significant" : "not significant"}` },
            ]} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Summary</CardTitle></CardHeader>
                <CardContent>
                  <DataTable headers={["Test", "Statistic", "Critical (95 %)", "Outcome"]}
                    rows={[
                      ["F (variances)", fmt(comp.f.F, 3), fmt(comp.f.fCrit, 2),
                        <span key="f" className={comp.f.significant ? "text-amber-600 font-semibold" : "text-emerald-600 font-semibold"}>{comp.f.significant ? "Differ" : "Comparable"}</span>],
                      [`t (${comp.pooled ? "pooled" : "Welch"})`, fmt(comp.tt.t, 3), fmt(comp.tt.tCrit, 3),
                        <span key="t" className={comp.tt.significant ? "text-amber-600 font-semibold" : "text-emerald-600 font-semibold"}>{comp.tt.significant ? "Differ" : "No difference"}</span>],
                    ]} />
                  <p className="text-[12px] text-muted-foreground mt-2 leading-relaxed">
                    {comp.tt.significant
                      ? `The means of “${d.labelA || "A"}” and “${d.labelB || "B"}” differ significantly at 95 % — investigate the bias before treating the two as equivalent.`
                      : `No significant difference between the means of “${d.labelA || "A"}” and “${d.labelB || "B"}” at 95 % — consistent with equivalent performance.`}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Means ± SD</CardTitle></CardHeader>
                <CardContent className="h-[230px]">
                  <ChartFrame>{({ ResponsiveContainer, ComposedChart, LineChart, ScatterChart, BarChart, Line, Area, Bar, Scatter, Cell, XAxis, YAxis, CartesianGrid, RTooltip, ReferenceLine, ReferenceArea, ErrorBar }) => (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                      <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: C.axis }} stroke={C.grid} />
                      <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11, fill: C.axis }} stroke={C.grid} />
                      <RTooltip contentStyle={C.tooltip} itemStyle={C.tooltipItem} labelStyle={C.tooltipLabel} formatter={(v) => fmtSig(v)} />
                      <Bar dataKey="mean" fill={C.primary} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                        <ErrorBar dataKey="sd" stroke={C.axis} width={3} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  )}</ChartFrame>
                </CardContent>
              </Card>
            </div>

            {(() => {
              const nameA = d.labelA || "A", nameB = d.labelB || "B";
              const jitter = (i, n) => (n <= 1 ? 0 : ((i / (n - 1)) - 0.5) * 0.5);
              const stripA = comp.a.map((v, i) => ({ x: v, y: 1 + jitter(i, comp.a.length), set: nameA }));
              const stripB = comp.b.map((v, i) => ({ x: v, y: 2 + jitter(i, comp.b.length), set: nameB }));
              const meanPts = [
                { x: comp.tt.m1, y: 1, sd: comp.f.sa, set: nameA, isMean: true },
                { x: comp.tt.m2, y: 2, sd: comp.f.sb, set: nameB, isMean: true },
              ];
              const diff = comp.tt.diff, ciHalf = comp.tt.tCrit * comp.tt.se;
              const dLo = Math.min(0, diff - ciHalf), dHi = Math.max(0, diff + ciHalf);
              const pad = (dHi - dLo) * 0.2 || Math.abs(diff) || 1;
              const StripTip = ({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const p = payload[0].payload;
                return (
                  <div style={{ ...C.tooltip, padding: "6px 9px", minWidth: 150 }}>
                    <div style={{ ...C.tooltipLabel }}>{p.set}{p.isMean ? " — mean" : ""}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, ...C.tooltipItem }}><span>{p.isMean ? "Mean" : "Value"}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtSig(p.x, 4)} {unit}</span></div>
                    {p.isMean && <div style={{ display: "flex", justifyContent: "space-between", gap: 12, ...C.tooltipItem }}><span>SD</span><span style={{ fontVariantNumeric: "tabular-nums" }}>± {fmtSig(p.sd, 3)}</span></div>}
                  </div>
                );
              };
              const DiffTip = ({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const p = payload[0].payload;
                return (
                  <div style={{ ...C.tooltip, padding: "6px 9px", minWidth: 176 }}>
                    <div style={{ ...C.tooltipLabel }}>Difference ({nameA} − {nameB})</div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, ...C.tooltipItem }}><span>Difference</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtSig(p.x, 3)} {unit}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, ...C.tooltipItem }}><span>95 % CI</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtSig(p.x - p.err, 3)} … {fmtSig(p.x + p.err, 3)}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, ...C.tooltipItem }}><span>Verdict</span><span style={{ color: comp.tt.significant ? C.warn : C.ok, fontWeight: 600 }}>{comp.tt.significant ? "means differ" : "no difference"}</span></div>
                  </div>
                );
              };
              return (
                <div className="space-y-4">
                <FDistributionChart df1={comp.f.df1} df2={comp.f.df2} F={comp.f.F} fCrit={comp.f.fCrit} significant={comp.f.significant} C={C} />
                <div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Data spread (each replicate)</CardTitle></CardHeader>
                    <CardContent className="h-[230px]">
                      <ChartFrame>{({ ResponsiveContainer, ComposedChart, LineChart, ScatterChart, BarChart, Line, Area, Bar, Scatter, Cell, XAxis, YAxis, CartesianGrid, RTooltip, ReferenceLine, ReferenceArea, ErrorBar }) => (
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 8, right: 18, bottom: 4, left: 10 }}>
                          <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                          <XAxis type="number" dataKey="x" domain={["auto", "auto"]} tick={{ fontSize: 10, fill: C.axis }} stroke={C.grid} tickFormatter={(v) => fmtSig(v, 3)} />
                          <YAxis type="number" dataKey="y" domain={[0.5, 2.5]} ticks={[1, 2]} width={96} tick={{ fontSize: 10, fill: C.axis }} stroke={C.grid} tickFormatter={(t) => (t === 1 ? nameA : t === 2 ? nameB : "")} />
                          <RTooltip cursor={{ strokeDasharray: "3 3" }} content={<StripTip />} />
                          <Scatter data={stripA} fill={C.primary} fillOpacity={0.6} />
                          <Scatter data={stripB} fill={C.violet} fillOpacity={0.6} />
                          <Scatter data={meanPts} fill={C.warn} shape="diamond">
                            <ErrorBar dataKey="sd" width={4} strokeWidth={1.5} stroke={C.warn} direction="x" />
                          </Scatter>
                        </ScatterChart>
                      </ResponsiveContainer>
                      )}</ChartFrame>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Difference in means ± 95 % CI</CardTitle></CardHeader>
                    <CardContent className="h-[230px]">
                      <ChartFrame>{({ ResponsiveContainer, ComposedChart, LineChart, ScatterChart, BarChart, Line, Area, Bar, Scatter, Cell, XAxis, YAxis, CartesianGrid, RTooltip, ReferenceLine, ReferenceArea, ErrorBar }) => (
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 8, right: 22, bottom: 4, left: 10 }}>
                          <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                          <XAxis type="number" dataKey="x" domain={[dLo - pad, dHi + pad]} tick={{ fontSize: 10, fill: C.axis }} stroke={C.grid} tickFormatter={(v) => fmtSig(v, 3)} />
                          <YAxis type="number" dataKey="y" domain={[0, 2]} ticks={[1]} width={96} tick={{ fontSize: 10, fill: C.axis }} stroke={C.grid} tickFormatter={() => `${nameA} − ${nameB}`} />
                          <RTooltip cursor={{ strokeDasharray: "3 3" }} content={<DiffTip />} />
                          <ReferenceLine x={0} stroke={C.ok} strokeDasharray="4 4" label={{ value: "no difference", position: "top", fontSize: 9, fill: C.ok }} />
                          <Scatter data={[{ x: diff, y: 1, err: ciHalf }]} fill={comp.tt.significant ? C.warn : C.ok}>
                            <ErrorBar dataKey="err" width={6} strokeWidth={1.6} stroke={comp.tt.significant ? C.warn : C.ok} direction="x" />
                          </Scatter>
                        </ScatterChart>
                      </ResponsiveContainer>
                      )}</ChartFrame>
                    </CardContent>
                  </Card>
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground mt-2">
                  <b>Data spread</b> plots every replicate (teal = {nameA}, purple = {nameB}); the amber diamonds are the group means with ±1 SD whiskers — wide separation with little overlap signals a real difference.
                  {" "}<b>Difference ± 95 % CI</b> shows the mean gap {nameA} − {nameB}: when the interval crosses the dashed “no difference” line at 0, the t-test is not significant.
                </p>
                </div>
                </div>
              );
            })()}
          </>
        )}

        {comp && comp.mode === "oneSample" && (
          <>
            <div className="flex flex-wrap gap-2">
              <Stat label="Mean" value={fmtSig(comp.mean)} unit={unit} />
              <Stat label="Reference" value={fmtSig(comp.ref)} unit={unit} />
              <Stat label="Bias" value={fmtSig(comp.bias)} unit={unit} />
              {comp.biasPct != null && <Stat label="Bias" value={fmt(comp.biasPct, 2)} unit="%" />}
              <Stat label="t" value={fmt(comp.t, 3)} status={comp.significant ? "warn" : "pass"} />
              <Stat label="t crit (95 %)" value={fmt(comp.tCrit, 3)} />
            </div>
            <WorkSteps steps={[
              { label: "1. Mean, SD and standard error", formula: `x̄ = ${fmtSig(comp.mean)} ${unit}   s = ${fmtSig(comp.sd)}   SE = s/√n = ${fmtSig(comp.se)}   (n = ${comp.a.length})` },
              { label: "2. One-sample t vs the reference value", formula: `t = |x̄ − µ₀| / SE = |${fmtSig(comp.mean)} − ${fmtSig(comp.ref)}| / ${fmtSig(comp.se)} = ${fmt(comp.t, 3)}` },
              { label: "3. Decision", formula: `t = ${fmt(comp.t, 3)}   ${comp.t > comp.tCrit ? ">" : "≤"}   t crit(${comp.df}) = ${fmt(comp.tCrit, 3)}  →  ${comp.significant ? "differs from the reference" : "consistent with the reference"}` },
            ]} />
            {(() => {
              const nameA = d.labelA || "Data set";
              const jitter = (i, n) => (n <= 1 ? 0 : ((i / (n - 1)) - 0.5) * 0.5);
              const pts = comp.a.map((v, i) => ({ x: v, y: 1 + jitter(i, comp.a.length) }));
              const ciHalf = comp.tCrit * comp.se;
              const xs = [...comp.a, comp.ref, comp.mean - ciHalf, comp.mean + ciHalf];
              const lo = Math.min(...xs), hi = Math.max(...xs), pad = (hi - lo) * 0.15 || 1;
              const OneTip = ({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const p = payload[0].payload;
                return (
                  <div style={{ ...C.tooltip, padding: "6px 9px", minWidth: 150 }}>
                    <div style={{ ...C.tooltipLabel }}>{p.isMean ? "Mean ± 95 % CI" : "Replicate"}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, ...C.tooltipItem }}><span>{p.isMean ? "Mean" : "Value"}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtSig(p.x, 4)} {unit}</span></div>
                    {p.isMean && <div style={{ display: "flex", justifyContent: "space-between", gap: 12, ...C.tooltipItem }}><span>95 % CI</span><span style={{ fontVariantNumeric: "tabular-nums" }}>± {fmtSig(p.err, 3)}</span></div>}
                  </div>
                );
              };
              return (
                <Card>
                  <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Data vs reference value</CardTitle></CardHeader>
                  <CardContent className="h-[200px]">
                    <ChartFrame>{({ ResponsiveContainer, ComposedChart, LineChart, ScatterChart, BarChart, Line, Area, Bar, Scatter, Cell, XAxis, YAxis, CartesianGrid, RTooltip, ReferenceLine, ReferenceArea, ErrorBar }) => (
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 12, right: 22, bottom: 4, left: 10 }}>
                        <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                        <XAxis type="number" dataKey="x" domain={[lo - pad, hi + pad]} tick={{ fontSize: 10, fill: C.axis }} stroke={C.grid} tickFormatter={(v) => fmtSig(v, 3)} />
                        <YAxis type="number" dataKey="y" domain={[0.4, 1.6]} ticks={[1]} width={96} tick={{ fontSize: 10, fill: C.axis }} stroke={C.grid} tickFormatter={() => nameA} />
                        <RTooltip cursor={{ strokeDasharray: "3 3" }} content={<OneTip />} />
                        <ReferenceLine x={comp.ref} stroke={C.violet} strokeDasharray="4 4" label={{ value: "reference", position: "top", fontSize: 9, fill: C.violet }} />
                        <Scatter data={pts} fill={C.primary} fillOpacity={0.6} />
                        <Scatter data={[{ x: comp.mean, y: 1, err: ciHalf, isMean: true }]} fill={comp.significant ? C.warn : C.ok} shape="diamond">
                          <ErrorBar dataKey="err" width={5} strokeWidth={1.6} stroke={comp.significant ? C.warn : C.ok} direction="x" />
                        </Scatter>
                      </ScatterChart>
                    </ResponsiveContainer>
                    )}</ChartFrame>
                  </CardContent>
                  <CardContent className="pt-0">
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      Teal dots are the replicates; the diamond is the mean with its 95 % CI whiskers. If the dashed <b>reference</b> line falls inside the whiskers, the mean is statistically consistent with the reference value.
                    </p>
                  </CardContent>
                </Card>
              );
            })()}
            <Card>
              <CardContent className="pt-4">
                <p className="text-[13px] leading-relaxed">
                  The mean of <b>{d.labelA || "the data set"}</b> ({fmtSig(comp.mean)} {unit}) {comp.significant ? "differs significantly from" : "is consistent with"} the
                  reference value {fmtSig(comp.ref)} {unit} at the 95 % confidence level
                  {comp.biasPct != null && <> (bias {fmt(comp.biasPct, 2)} %)</>}.
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    );
  };

  const TruenessModule = () => {
    const d = study.trueness;
    return (
      <div className="space-y-4">
        <GuideNote>
          Eurachem §6.5 — assess bias against a <b>CRM</b> (preferred), by <b>spike recovery</b>, or by comparison with a
          reference method. Significance is judged with a t-test at 95 % confidence; also compare the bias with the CRM's
          own uncertainty before concluding.
        </GuideNote>
        <Tabs value={d.mode} onValueChange={(v) => up("trueness", { mode: v })}>
          <TabsList className="lvp-no-print">
            <TabsTrigger value="crm">CRM study</TabsTrigger>
            <TabsTrigger value="spike">Spike recovery</TabsTrigger>
          </TabsList>
          <TabsContent value="crm" className="space-y-4 mt-4">
            <Card>
              <CardContent className="pt-5 space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Field label={`Certified value (${unit})`} type="number" step="any" value={d.crmRef} onChange={(e) => up("trueness", { crmRef: e.target.value === "" ? "" : +e.target.value })} />
                  <Field label={`CRM expanded U (${unit})`} type="number" step="any" value={d.crmU} onChange={(e) => up("trueness", { crmU: e.target.value === "" ? "" : +e.target.value })} />
                </div>
                <RepGrid label={`CRM replicate results (${unit})`} values={d.crmReps} onChange={(v) => up("trueness", { crmReps: v })}
                  outlierIdx={trueness?.mode === "crm" ? trueness?.grubbs?.outlierIdx ?? -1 : -1} />
              </CardContent>
            </Card>
            {trueness?.mode === "crm" && (
              <div className="flex flex-wrap gap-2">
                <Stat label="Mean" value={fmtSig(trueness.mean)} unit={unit} />
                <Stat label="Bias" value={fmtSig(trueness.bias, 3)} unit={unit} />
                <Stat label="Bias %" value={fmt(trueness.biasPct, 2)} unit="%" status={trueness.significant ? "fail" : "pass"} />
                <Stat label="Recovery" value={fmt(trueness.recovery, 1)} unit="%" />
                <Stat label="t / t crit" value={`${fmt(trueness.t, 2)} / ${fmt(trueness.tCrit, 2)}`} status={trueness.significant ? "fail" : "pass"} />
              </div>
            )}
            {trueness?.mode === "crm" && (
              <TruenessDistributionChart mean={trueness.mean} sd={trueness.sd} refVal={num(d.crmRef)}
                refU={num(d.crmU)} bias={trueness.bias} unit={unit} C={C} />
            )}
            {trueness?.mode === "crm" && (() => {
              const ref = num(d.crmRef);
              return <WorkSteps steps={[
                { label: `1. Mean of the ${trueness.n} CRM results and their standard deviation`,
                  formula: `x̄ = ${fmtSig(trueness.mean)} ${unit}    s = ${fmtSig(trueness.sd)} ${unit}` },
                { label: "2. Bias = x̄ − certified value;   Bias % = bias/ref × 100;   Recovery = x̄/ref × 100",
                  formula: `Bias = ${fmtSig(trueness.mean)} − ${fmtSig(ref)} = ${fmtSig(trueness.bias, 3)} ${unit}   →   ${fmt(trueness.biasPct, 2)} %   (Recovery ${fmt(trueness.recovery, 1)} %)` },
                { label: `3. Significance t-test  t = |x̄ − ref| / (s/√n)   vs   t_crit (df = ${trueness.df}, 95 %)`,
                  formula: `t = |${fmtSig(trueness.mean)} − ${fmtSig(ref)}| / (${fmtSig(trueness.sd)}/√${trueness.n}) = ${fmt(trueness.t, 2)}  ${trueness.significant ? ">" : "≤"}  ${fmt(trueness.tCrit, 2)}   →   ${trueness.significant ? "significant bias" : "no significant bias"}` },
              ]} />;
            })()}
            {trueness?.mode === "crm" && (
              <p className="text-[12px] text-muted-foreground">
                {trueness.significant
                  ? "Bias is statistically significant at 95 % confidence — investigate, correct, or include as an uncertainty component."
                  : "No statistically significant bias at 95 % confidence."}
              </p>
            )}
          </TabsContent>
          <TabsContent value="spike" className="space-y-4 mt-4">
            <Card>
              <CardContent className="pt-5 space-y-4">
                <NSelect label="Recovery formula" value={d.spikeMethod || "apha"} onChange={(v) => up("trueness", { spikeMethod: v })}
                  className="max-w-[360px]"
                  options={[
                    { value: "apha", label: "APHA / USEPA — %R = 100·(SSR − SR)/SA" },
                    { value: "volume", label: "Volume / mixing — (Vspl·Cspl + Vspk·Cspk)/(Vspl + Vspk)" },
                  ]} />
                {(d.spikeMethod || "apha") === "apha" ? (
                  <>
                    <Field label={`Spike added, SA (${unit})`} type="number" step="any" value={d.spikeAmount} className="max-w-[220px]"
                      onChange={(e) => up("trueness", { spikeAmount: e.target.value === "" ? "" : +e.target.value })} />
                    <div className="text-[11px] text-muted-foreground -mt-2">
                      SA = concentration equivalent of the spike in the final sample. SSR = spiked result, SR = unspiked result.
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <Field label="Sample volume Vspl" type="number" step="any" value={d.vSpl}
                        onChange={(e) => up("trueness", { vSpl: e.target.value === "" ? "" : +e.target.value })} />
                      <Field label="Spike volume Vspk" type="number" step="any" value={d.vSpk}
                        onChange={(e) => up("trueness", { vSpk: e.target.value === "" ? "" : +e.target.value })} />
                      <Field label={`Spike standard conc Cspk (${unit})`} type="number" step="any" value={d.cSpk}
                        onChange={(e) => up("trueness", { cSpk: e.target.value === "" ? "" : +e.target.value })} />
                    </div>
                    <div className="text-[11px] text-muted-foreground -mt-1">
                      Cspl is taken from the unspiked mean. Vspl and Vspk share any consistent unit (mL, µL…). Expected mix conc =
                      (Vspl·Cspl + Vspk·Cspk)/(Vspl + Vspk); recovery corrects for the dilution of both sample and spike.
                    </div>
                  </>
                )}
                <RepGrid label={`Unspiked sample (${unit})`} values={d.unspiked} onChange={(v) => up("trueness", { unspiked: v })} />
                <RepGrid label={`Spiked sample (${unit})`} values={d.spiked} onChange={(v) => up("trueness", { spiked: v })} />
              </CardContent>
            </Card>
            {trueness?.mode === "spike" && (
              <div className="flex flex-wrap gap-2">
                {trueness.method === "volume" && <>
                  <Stat label="Expected mix conc" value={fmtSig(trueness.cExpected)} unit={unit} />
                  <Stat label="Spike added (in mix)" value={fmtSig(trueness.spikeAdded)} unit={unit} />
                  <Stat label="Total recovery" value={fmt(trueness.recTotal, 1)} unit="%" />
                </>}
                <Stat label={trueness.method === "volume" ? "Spike recovery" : "Marginal recovery"}
                  value={fmt(trueness.recovery, 1)} unit="%" status={trueness.significant ? "fail" : "pass"} />
                <Stat label="u(Rec)" value={fmt(trueness.sdRec, 2)} unit="%" />
                <Stat label="t / t crit" value={`${fmt(trueness.t, 2)} / ${fmt(trueness.tCrit, 2)}`} status={trueness.significant ? "fail" : "pass"} />
              </div>
            )}
            {trueness?.mode === "spike" && (
              <RecoveryDistributionChart recovery={trueness.recovery} sdRec={trueness.sdRec}
                tCrit={trueness.tCrit} significant={trueness.significant}
                recMin={num(cr.recMin)} recMax={num(cr.recMax)} C={C} />
            )}
            {trueness?.mode === "spike" && (
              <WorkSteps steps={
                trueness.method === "volume"
                  ? [
                      { label: "1. Native sample concentration Cspl = unspiked mean;  total volume Vt = Vspl + Vspk",
                        formula: `Cspl = ${fmtSig(trueness.mu)} ${unit}    Vt = ${fmtSig(trueness.Vspl)} + ${fmtSig(trueness.Vspk)} = ${fmtSig(trueness.Vt)}` },
                      { label: "2. Expected concentration of the mix at 100 % recovery  Cexp = (Vspl·Cspl + Vspk·Cspk)/Vt",
                        formula: `Cexp = (${fmtSig(trueness.Vspl)}×${fmtSig(trueness.mu)} + ${fmtSig(trueness.Vspk)}×${fmtSig(trueness.cSpk)}) / ${fmtSig(trueness.Vt)} = ${fmtSig(trueness.cExpected)} ${unit}` },
                      { label: "3. Split the expected value into diluted native + spike contribution",
                        formula: `diluted sample = Vspl·Cspl/Vt = ${fmtSig(trueness.dilutedSample)}    spike added = Vspk·Cspk/Vt = ${fmtSig(trueness.spikeAdded)} ${unit}` },
                      { label: "4. Total recovery = measured spiked mean / Cexp × 100",
                        formula: `Total R = ${fmtSig(trueness.ms)} / ${fmtSig(trueness.cExpected)} × 100 = ${fmt(trueness.recTotal, 1)} %` },
                      { label: "5. Spike (marginal) recovery = (measured − diluted sample) / spike added × 100",
                        formula: `R = (${fmtSig(trueness.ms)} − ${fmtSig(trueness.dilutedSample)}) / ${fmtSig(trueness.spikeAdded)} × 100 = ${fmt(trueness.recovery, 1)} %` },
                      { label: `6. Significance  t = |R − 100| / u(R)   vs   t_crit (df = ${trueness.df})`,
                        formula: `t = |${fmt(trueness.recovery, 1)} − 100| / ${fmt(trueness.sdRec, 2)} = ${fmt(trueness.t, 2)}  ${trueness.significant ? ">" : "≤"}  ${fmt(trueness.tCrit, 2)}` },
                    ]
                  : [
                      { label: "1. Sample result SR = unspiked mean;  spiked result SSR = spiked mean",
                        formula: `SR = ${fmtSig(trueness.mu)} ${unit}    SSR = ${fmtSig(trueness.ms)} ${unit}    SA = ${fmtSig(trueness.amt)} ${unit}` },
                      { label: "2. Recovery  %R = 100 · (SSR − SR) / SA",
                        formula: `%R = 100 × (${fmtSig(trueness.ms)} − ${fmtSig(trueness.mu)}) / ${fmtSig(trueness.amt)} = ${fmt(trueness.recovery, 1)} %` },
                      { label: `3. Significance  t = |%R − 100| / u(R)   vs   t_crit (df = ${trueness.df}, 95 %)`,
                        formula: `t = |${fmt(trueness.recovery, 1)} − 100| / ${fmt(trueness.sdRec, 2)} = ${fmt(trueness.t, 2)}  ${trueness.significant ? ">" : "≤"}  ${fmt(trueness.tCrit, 2)}   →   ${trueness.significant ? "significant" : "not significant"}` },
                    ]
              } />
            )}
            {trueness?.mode === "spike" && (
              <p className="text-[12px] text-muted-foreground">
                {trueness.significant
                  ? "Recovery differs significantly from 100 % at 95 % confidence — bias is present; investigate or correct."
                  : "Recovery not significantly different from 100 % at 95 % confidence."}
              </p>
            )}
          </TabsContent>
        </Tabs>
      </div>
    );
  };

  const RecoveryModule = () => {
    const L = study.recovery.levels;
    const setL = (v) => up("recovery", { levels: v });
    const recMin = num(cr.recMin) ?? 80;
    const recMax = num(cr.recMax) ?? 120;
    const yLo = Math.min(60, recMin - 10);
    const yHi = Math.max(140, recMax + 10);
    // Per-level mean recovery — drives the summary bar chart.
    const barData = rec.map((r) => ({ conc: `${r.conc}`, recovery: r.recovery }));
    // Every replicate's recovery in run order, grouped by fortification level —
    // drives the zig-zag control chart.
    const runData = [];
    const levelBounds = [];
    study.recovery.levels.forEach((lv) => {
      const conc = num(lv.conc);
      const reps = clean(lv.reps);
      if (!conc || reps.length < 1) return;
      const start = runData.length + 1;
      reps.forEach((v, j) => runData.push({ seq: runData.length + 1, recovery: (v / conc) * 100, level: conc, rep: j + 1 }));
      levelBounds.push({ conc, start, end: runData.length, mid: (start + runData.length) / 2 });
    });
    const inWin = (r) => r >= recMin && r <= recMax;
    const groupTicks = levelBounds.map((b) => b.mid);
    const RunDot = ({ cx, cy, payload }) => {
      if (cx == null || cy == null) return null;
      const color = inWin(payload.recovery) ? C.primary : C.bad;
      const s = 3.6;
      return (
        <g stroke={color} strokeWidth={1.9} strokeLinecap="round">
          <line x1={cx - s} y1={cy - s} x2={cx + s} y2={cy + s} />
          <line x1={cx - s} y1={cy + s} x2={cx + s} y2={cy - s} />
        </g>
      );
    };
    const RunTooltip = ({ active, payload }) => {
      if (!active || !payload || !payload.length) return null;
      const p = payload[0].payload;
      const ok = inWin(p.recovery);
      return (
        <div style={{ ...C.tooltip, padding: "6px 9px", minWidth: 150 }}>
          <div style={{ ...C.tooltipLabel }}>{fmt(p.level, 2)} {unit} · rep {p.rep}</div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, ...C.tooltipItem }}>
            <span>Recovery</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(p.recovery, 1)} %</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, ...C.tooltipItem }}>
            <span>Status</span><span style={{ color: ok ? C.ok : C.bad, fontWeight: 600 }}>{ok ? "In window" : "Out of window"}</span>
          </div>
        </div>
      );
    };
    return (
      <div className="space-y-4">
        <GuideNote>
          Recovery at ≥ 3 levels spanning the working range (low ≈ LOQ, mid, high ≈ 90 % of range), ≥ 5 replicates each.
          Acceptance window here: {cr.recMin}–{cr.recMax} % (editable in Study Plan).
        </GuideNote>
        <Card>
          <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">Fortification levels</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setL([...L, { conc: "", reps: ["", "", "", "", ""] }])}><Plus className="h-3.5 w-3.5 mr-1" />Level</Button>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {L.map((lv, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Nominal</span>
                  <input type="number" step="any" value={lv.conc}
                    onChange={(e) => { const a = [...L]; a[i] = { ...lv, conc: e.target.value === "" ? "" : +e.target.value }; setL(a); }}
                    className="w-[90px] h-8 rounded-md border border-input bg-card px-2 text-[13px] font-data focus:outline-none focus:ring-2 focus:ring-ring" />
                  <span className="text-[11px] text-muted-foreground">{unit}</span>
                </div>
                <div className="flex-1 min-w-[240px]"><RepGrid values={lv.reps} onChange={(v) => { const a = [...L]; a[i] = { ...lv, reps: v }; setL(a); }} /></div>
                <Button variant="ghost" size="sm" className="text-destructive h-8" onClick={() => askDelete("This fortification level and its replicate results will be removed.", () => setL(L.filter((_, k) => k !== i)), "Delete this level?")}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            ))}
          </CardContent>
        </Card>
        {rec.length > 0 && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Results</CardTitle></CardHeader>
                <CardContent>
                  <DataTable headers={["Level", "n", "Mean", "SD", "RSD %", "Recovery %", ""]}
                    rows={rec.map((r) => [
                      `${fmt(r.conc, 2)} ${unit}`, r.n, fmtSig(r.mean), fmtSig(r.sd, 3), fmt(r.rsd, 2), fmt(r.recovery, 1),
                      <StatusBadge key="s" s={r.recovery >= cr.recMin && r.recovery <= cr.recMax ? "pass" : "fail"} />,
                    ])} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Recovery vs level (mean)</CardTitle></CardHeader>
                <CardContent className="h-[230px]">
                  <ChartFrame>{({ ResponsiveContainer, ComposedChart, LineChart, ScatterChart, BarChart, Line, Area, Bar, Scatter, Cell, XAxis, YAxis, CartesianGrid, RTooltip, ReferenceLine, ReferenceArea, ErrorBar }) => (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                      <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                      <XAxis dataKey="conc" tick={{ fontSize: 11, fill: C.axis }} stroke={C.grid} />
                      <YAxis domain={[yLo, yHi]} tick={{ fontSize: 11, fill: C.axis }} stroke={C.grid} />
                      <RTooltip contentStyle={C.tooltip} itemStyle={C.tooltipItem} labelStyle={C.tooltipLabel} formatter={(v) => fmt(v, 1) + " %"} />
                      <ReferenceArea y1={recMin} y2={recMax} fill={C.ok} fillOpacity={0.08} />
                      <ReferenceLine y={100} stroke={C.ok} strokeDasharray="4 4" />
                      <ReferenceLine y={recMin} stroke={C.warn} strokeDasharray="3 3" />
                      <ReferenceLine y={recMax} stroke={C.warn} strokeDasharray="3 3" />
                      <Bar dataKey="recovery" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                        {barData.map((r, i) => <Cell key={i} fill={r.recovery >= recMin && r.recovery <= recMax ? C.primary : C.bad} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  )}</ChartFrame>
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Recovery control chart</CardTitle></CardHeader>
              <CardContent className="h-[300px]">
                <ChartFrame>{({ ResponsiveContainer, ComposedChart, LineChart, ScatterChart, BarChart, Line, Area, Bar, Scatter, Cell, XAxis, YAxis, CartesianGrid, RTooltip, ReferenceLine, ReferenceArea, ErrorBar }) => (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={runData} margin={{ top: 22, right: 54, bottom: 18, left: 4 }}>
                    <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="seq" type="number" domain={[0.5, runData.length + 0.5]} ticks={groupTicks}
                      tickFormatter={(t) => { const b = levelBounds.find((g) => g.mid === t); return b ? `${fmt(b.conc, 2)} ${unit}` : ""; }}
                      tick={{ fontSize: 10, fill: C.axis }} stroke={C.grid}
                      label={{ value: "Fortification level", position: "insideBottom", offset: -8, fontSize: 10, fill: C.axis }} />
                    <YAxis domain={[yLo, yHi]} tick={{ fontSize: 11, fill: C.axis }} stroke={C.grid} />
                    <RTooltip content={<RunTooltip />} cursor={{ stroke: C.axis, strokeDasharray: "3 3" }} isAnimationActive={false} />
                    {/* action areas outside the acceptance window */}
                    <ReferenceArea y1={recMax} y2={yHi} fill={C.bad} fillOpacity={0.09} stroke="none"
                      label={{ value: "Action area", position: "insideTop", fontSize: 9, fill: C.bad }} />
                    <ReferenceArea y1={yLo} y2={recMin} fill={C.bad} fillOpacity={0.09} stroke="none"
                      label={{ value: "Action area", position: "insideBottom", fontSize: 9, fill: C.bad }} />
                    {/* fortification-level separators */}
                    {levelBounds.slice(1).map((b, i) => <ReferenceLine key={`sep${i}`} x={b.start - 0.5} stroke={C.grid} strokeDasharray="2 4" />)}
                    {/* control lines: upper / target / lower */}
                    <ReferenceLine y={recMax} stroke={C.warn} strokeDasharray="5 3"
                      label={{ value: `${fmt(recMax, 0)}%`, position: "right", fontSize: 9, fill: C.warn }} />
                    <ReferenceLine y={100} stroke={C.ok} strokeDasharray="4 4"
                      label={{ value: "100%", position: "right", fontSize: 9, fill: C.ok }} />
                    <ReferenceLine y={recMin} stroke={C.warn} strokeDasharray="5 3"
                      label={{ value: `${fmt(recMin, 0)}%`, position: "right", fontSize: 9, fill: C.warn }} />
                    <Line dataKey="recovery" stroke={C.primary} strokeWidth={1.8} dot={<RunDot />} isAnimationActive={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
                )}</ChartFrame>
              </CardContent>
            </Card>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Each <b>×</b> is one replicate's recovery, plotted in run order and grouped by fortification level (low → high). The line
              zig-zags between them. The green centre line is the <b>100 %</b> target; the amber lines are the <b>{fmt(recMin, 0)}–{fmt(recMax, 0)} %</b>
              {" "}acceptance limits. A point that strays into the red <b>action area</b> (turning red) is out of specification and must be investigated.
            </p>
            {(() => {
              const steps = [
                { label: "1. For each fortification level, average the replicate results and measure their scatter",
                  formula: "x̄ = Σx / n     s = √[ Σ(x − x̄)² / (n − 1) ]     RSD % = s / x̄ × 100" },
                { label: "2. Recovery is the measured mean expressed as a percentage of the amount fortified (nominal)",
                  formula: "Recovery % = (x̄ / nominal) × 100",
                  note: `Acceptable when Recovery % is within ${cr.recMin}–${cr.recMax} % (editable in Study Plan).` },
                ...rec.map((r, i) => {
                  const ok = r.recovery >= cr.recMin && r.recovery <= cr.recMax;
                  return {
                    label: `${i + 3}. ${fmt(r.conc, 2)} ${unit} level  (n = ${r.n})`,
                    formula: `x̄ = ${fmtSig(r.mean)} ${unit}    s = ${fmtSig(r.sd, 3)}    RSD = ${fmt(r.rsd, 2)} %\nRecovery = ${fmtSig(r.mean)} / ${fmtSig(r.conc)} × 100 = ${fmt(r.recovery, 1)} %`,
                    note: `${fmt(r.recovery, 1)} % ${ok ? "within" : "outside"} ${cr.recMin}–${cr.recMax} %  →  ${ok ? "pass" : "fail — investigate"}`,
                  };
                }),
              ];
              return <WorkSteps steps={steps} title="Show how Recovery % is calculated" />;
            })()}
          </>
        )}
      </div>
    );
  };

  const RobustnessModule = () => {
    const F = study.robustness.factors;
    const setF = (v) => up("robustness", { factors: v });
    const chartData = robust.map((r) => ({ name: r.name, effect: r.effectPct }));
    return (
      <div className="space-y-4">
        <GuideNote>
          Eurachem §6.7 (ruggedness) — deliberately vary method parameters around their nominal values and measure the
          effect on the result. Effects ≤ {cr.robustPctMax} % (editable) are considered negligible; larger effects mean the
          parameter must be controlled and its tolerance stated in the SOP. For many factors, a Youden / Plackett–Burman
          design is more efficient than one-factor-at-a-time.
        </GuideNote>
        <Card>
          <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">Factors</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setF([...F, { name: "", nominal: "", low: "", high: "", resLow: "", resHigh: "" }])}><Plus className="h-3.5 w-3.5 mr-1" />Factor</Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {F.map((f, i) => {
              const set = (patch) => { const a = [...F]; a[i] = { ...f, ...patch }; setF(a); };
              return (
                <div key={i} className="grid grid-cols-2 md:grid-cols-[1.4fr_repeat(5,1fr)_auto] gap-2 items-end rounded-lg border border-border bg-muted/30 px-3 py-2">
                  <Field label={i === 0 ? "Factor" : ""} value={f.name} placeholder="Pyrolysis temperature (°C)" onChange={(e) => set({ name: e.target.value })} />
                  <Field label={i === 0 ? "Nominal" : ""} value={f.nominal} onChange={(e) => set({ nominal: e.target.value })} />
                  <Field label={i === 0 ? "Low" : ""} value={f.low} onChange={(e) => set({ low: e.target.value })} />
                  <Field label={i === 0 ? "High" : ""} value={f.high} onChange={(e) => set({ high: e.target.value })} />
                  <Field label={i === 0 ? "Result @low" : ""} type="number" step="any" value={f.resLow} onChange={(e) => set({ resLow: e.target.value === "" ? "" : +e.target.value })} />
                  <Field label={i === 0 ? "Result @high" : ""} type="number" step="any" value={f.resHigh} onChange={(e) => set({ resHigh: e.target.value === "" ? "" : +e.target.value })} />
                  <Button variant="ghost" size="sm" className="text-destructive h-9" onClick={() => askDelete("This ruggedness factor and its low / high results will be removed.", () => setF(F.filter((_, k) => k !== i)), "Delete this factor?")}><Trash2 className="h-4 w-4" /></Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
        {robust.length > 0 && (
          <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Effect evaluation</CardTitle></CardHeader>
              <CardContent>
                <DataTable headers={["Factor", "Effect", "Effect %", "vs sr", ""]}
                  rows={robust.map((r) => [
                    r.name || "—", fmtSig(r.effect, 3), fmt(r.effectPct, 2),
                    r.srTest === null ? "n/a" : r.srTest ? <span className="text-amber-600">significant</span> : "within noise",
                    <StatusBadge key="s" s={Math.abs(r.effectPct) <= cr.robustPctMax ? "pass" : "warn"} />,
                  ])} />
                <p className="text-[11px] text-muted-foreground mt-2">"vs sr" compares |effect| with the repeatability from the Precision module (t-based, 95 %).</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Effect magnitude (%)</CardTitle></CardHeader>
              <CardContent className="h-[230px]">
                <ChartFrame>{({ ResponsiveContainer, ComposedChart, LineChart, ScatterChart, BarChart, Line, Area, Bar, Scatter, Cell, XAxis, YAxis, CartesianGrid, RTooltip, ReferenceLine, ReferenceArea, ErrorBar }) => (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 20, bottom: 4, left: 10 }}>
                    <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: C.axis }} stroke={C.grid} />
                    <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10, fill: C.axis }} stroke={C.grid} />
                    <RTooltip contentStyle={C.tooltip} itemStyle={C.tooltipItem} labelStyle={C.tooltipLabel} formatter={(v) => fmt(v, 2) + " %"} />
                    <ReferenceLine x={+cr.robustPctMax} stroke={C.warn} strokeDasharray="4 4" />
                    <ReferenceLine x={-cr.robustPctMax} stroke={C.warn} strokeDasharray="4 4" />
                    <Bar dataKey="effect" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                      {chartData.map((r, i) => <Cell key={i} fill={Math.abs(r.effect) <= cr.robustPctMax ? C.primary : C.warn} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                )}</ChartFrame>
              </CardContent>
            </Card>
          </div>
          {(() => {
            const rob = +cr.robustPctMax;
            // Sensitivity (tornado): the result span low → high for each factor, largest swing first.
            const results = robust.flatMap((r) => [num(r.resLow), num(r.resHigh)]).filter((x) => x !== null);
            const gmR = results.length ? results.reduce((a, b) => a + b, 0) / results.length : 0;
            const tornado = [...robust]
              .sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect))
              .map((r) => {
                const lo = num(r.resLow), hi = num(r.resHigh);
                return { name: r.name || "—", range: [Math.min(lo, hi), Math.max(lo, hi)], lo, hi, effect: r.effect, effectPct: r.effectPct, ok: Math.abs(r.effectPct) <= rob };
              });
            // Significance: |effect| compared with the repeatability critical difference (needs the Precision module).
            const n = prec ? prec.N / prec.p : null;
            const cd = prec ? prec.sr * S.tCrit95(prec.dfw) * Math.SQRT2 / Math.sqrt(n) : null;
            const sig = prec ? [...robust]
              .sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect))
              .map((r) => ({ name: r.name || "—", absEffect: Math.abs(r.effect), significant: r.srTest })) : [];
            const TornadoTip = ({ active, payload }) => {
              if (!active || !payload || !payload.length) return null;
              const p = payload[0].payload;
              return (
                <div style={{ ...C.tooltip, padding: "6px 9px", minWidth: 168 }}>
                  <div style={{ ...C.tooltipLabel }}>{p.name}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, ...C.tooltipItem }}><span>Result @low</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtSig(p.lo, 4)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, ...C.tooltipItem }}><span>Result @high</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtSig(p.hi, 4)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, ...C.tooltipItem }}><span>Effect</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtSig(p.effect, 3)} ({fmt(p.effectPct, 2)} %)</span></div>
                </div>
              );
            };
            const SigTip = ({ active, payload }) => {
              if (!active || !payload || !payload.length) return null;
              const p = payload[0].payload;
              return (
                <div style={{ ...C.tooltip, padding: "6px 9px", minWidth: 168 }}>
                  <div style={{ ...C.tooltipLabel }}>{p.name}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, ...C.tooltipItem }}><span>|Effect|</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtSig(p.absEffect, 3)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, ...C.tooltipItem }}><span>Crit. difference</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtSig(cd, 3)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, ...C.tooltipItem }}><span>Verdict</span><span style={{ color: p.significant ? C.warn : C.ok, fontWeight: 600 }}>{p.significant ? "significant" : "within noise"}</span></div>
                </div>
              );
            };
            return (
              <div>
              <div className={`grid grid-cols-1 ${prec ? "lg:grid-cols-2" : ""} gap-4`}>
                <Card>
                  <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Sensitivity — result span (low → high)</CardTitle></CardHeader>
                  <CardContent className="h-[230px]">
                    <ChartFrame>{({ ResponsiveContainer, ComposedChart, LineChart, ScatterChart, BarChart, Line, Area, Bar, Scatter, Cell, XAxis, YAxis, CartesianGrid, RTooltip, ReferenceLine, ReferenceArea, ErrorBar }) => (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={tornado} layout="vertical" margin={{ top: 12, right: 24, bottom: 4, left: 10 }}>
                        <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                        <XAxis type="number" domain={["auto", "auto"]} tick={{ fontSize: 10, fill: C.axis }} stroke={C.grid} tickFormatter={(v) => fmtSig(v, 3)} />
                        <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10, fill: C.axis }} stroke={C.grid} />
                        <RTooltip content={<TornadoTip />} cursor={{ fill: C.grid, fillOpacity: 0.15 }} />
                        <ReferenceLine x={gmR} stroke={C.ok} strokeDasharray="4 4" label={{ value: "mean", position: "top", fontSize: 9, fill: C.ok }} />
                        <Bar dataKey="range" radius={[3, 3, 3, 3]} barSize={16} isAnimationActive={false}>
                          {tornado.map((r, i) => <Cell key={i} fill={r.ok ? C.primary : C.warn} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    )}</ChartFrame>
                  </CardContent>
                </Card>
                {prec && (
                  <Card>
                    <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">|Effect| vs repeatability noise</CardTitle></CardHeader>
                    <CardContent className="h-[230px]">
                      <ChartFrame>{({ ResponsiveContainer, ComposedChart, LineChart, ScatterChart, BarChart, Line, Area, Bar, Scatter, Cell, XAxis, YAxis, CartesianGrid, RTooltip, ReferenceLine, ReferenceArea, ErrorBar }) => (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={sig} layout="vertical" margin={{ top: 12, right: 24, bottom: 4, left: 10 }}>
                          <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                          <XAxis type="number" domain={[0, (dMax) => Math.max(dMax, cd) * 1.1]} tick={{ fontSize: 10, fill: C.axis }} stroke={C.grid} tickFormatter={(v) => fmtSig(v, 2)} />
                          <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10, fill: C.axis }} stroke={C.grid} />
                          <RTooltip content={<SigTip />} cursor={{ fill: C.grid, fillOpacity: 0.15 }} />
                          <ReferenceLine x={cd} stroke={C.warn} strokeDasharray="4 4" label={{ value: "crit. diff.", position: "top", fontSize: 9, fill: C.warn }} />
                          <Bar dataKey="absEffect" radius={[0, 4, 4, 0]} barSize={16} isAnimationActive={false}>
                            {sig.map((r, i) => <Cell key={i} fill={r.significant ? C.warn : C.primary} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                      )}</ChartFrame>
                    </CardContent>
                  </Card>
                )}
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground mt-2">
                <b>Sensitivity</b> shows the result span as each factor moves from its low → high setting (widest bar = most influential), sorted by effect size; the dashed line marks the mean of all results.
                {prec && <> <b>|Effect| vs noise</b> compares each effect with the repeatability critical difference — a bar reaching past the dashed line is statistically distinguishable from repeatability noise.</>}
              </p>
              </div>
            );
          })()}
          {(() => {
            const rob = +cr.robustPctMax;
            const n = prec ? prec.N / prec.p : null;
            const cd = prec ? prec.sr * S.tCrit95(prec.dfw) * Math.SQRT2 / Math.sqrt(n) : null;
            const steps = [
              { label: "1. For each factor, the effect is the change in result when the parameter moves from its low to its high setting",
                formula: "Effect = Result@high − Result@low" },
              { label: "2. Express the effect against the mid-point response so factors on different scales stay comparable",
                formula: "mid = (Result@high + Result@low) / 2\nEffect % = Effect / mid × 100",
                note: `Negligible when |Effect %| ≤ ${rob} % (editable acceptance limit).` },
              ...robust.map((r, i) => {
                const mid = (num(r.resHigh) + num(r.resLow)) / 2;
                const ok = Math.abs(r.effectPct) <= rob;
                return {
                  label: `${i + 3}. ${r.name || "Factor " + (i + 1)}`,
                  formula: `Effect = ${fmtSig(num(r.resHigh), 4)} − ${fmtSig(num(r.resLow), 4)} = ${fmtSig(r.effect, 3)}\nEffect % = ${fmtSig(r.effect, 3)} / ${fmtSig(mid, 4)} × 100 = ${fmt(r.effectPct, 2)} %`,
                  note: `|${fmt(r.effectPct, 2)} %| ${ok ? "≤" : ">"} ${rob} %  →  ${ok ? "negligible (pass)" : "significant — control this parameter and state its tolerance in the SOP"}`,
                };
              }),
              prec && {
                label: `${robust.length + 3}. "vs sr" check — is the effect larger than repeatability noise?`,
                formula: `CD = s_r · t(${prec.dfw}, 95%) · √2 / √n = ${fmtSig(prec.sr, 3)} · ${fmt(S.tCrit95(prec.dfw), 2)} · √2 / √${fmt(n, 0)} = ${fmtSig(cd, 3)}`,
                note: `An |effect| above the critical difference CD is statistically distinguishable from repeatability ("significant"); at or below it the change is "within noise".`,
              },
            ];
            return <WorkSteps steps={steps} title="Show how Effect % is calculated" />;
          })()}
          </>
        )}
      </div>
    );
  };

  const UncertaintyModule = () => (
    <div className="space-y-4">
      <GuideNote>
        Top-down estimate per EURACHEM/CITAC CG4: combine the intermediate precision u(P) = s<sub>I</sub> with the
        uncertainty of bias u(bias) from the trueness study. u<sub>c</sub> = √(u(P)² + u(bias)²), expanded U = 2·u<sub>c</sub> (k = 2, ~95 %).
        This is a screening estimate — a full budget should itemise additional components (calibration, sampling, purity).
      </GuideNote>
      {!mu ? (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">Complete the <b>Precision</b> module (and ideally <b>Trueness</b>) first — this module combines their outputs automatically.</CardContent></Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <Stat label="u(P) = sI" value={fmtSig(mu.uPrec)} unit={unit} />
            <Stat label="u(bias)" value={mu.uBias !== null ? fmtSig(mu.uBias) : "—"} unit={unit} />
            <Stat label="uc" value={fmtSig(mu.uc)} unit={unit} />
            <Stat label="U (k=2)" value={fmtSig(mu.U)} unit={unit} status="pass" />
            <Stat label="U relative" value={fmt(mu.UPct, 2)} unit="%" />
          </div>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Budget</CardTitle></CardHeader>
            <CardContent>
              <DataTable headers={["Component", "Source", "u", "u² share"]}
                rows={[
                  ["Precision u(P)", "sI from ANOVA (Precision module)", fmtSig(mu.uPrec), fmt((mu.uPrec ** 2 / mu.uc ** 2) * 100, 1) + " %"],
                  ["Bias u(bias)", trueness?.mode === "crm" ? "CRM study: √(sm² + u(ref)² + bias²)" : trueness?.mode === "spike" ? "|bias| from spike study" : "not assessed",
                    mu.uBias !== null ? fmtSig(mu.uBias) : "—", mu.uBias !== null ? fmt((mu.uBias ** 2 / mu.uc ** 2) * 100, 1) + " %" : "—"],
                  [<b key="c">Combined uc</b>, "√Σu²", <b key="v">{fmtSig(mu.uc)}</b>, "100 %"],
                  [<b key="e">Expanded U</b>, "k = 2 (~95 %)", <b key="u">{fmtSig(mu.U)} {unit} ({fmt(mu.UPct, 1)} %)</b>, ""],
                ]} />
            </CardContent>
          </Card>
          {(() => {
            const comps = [
              { name: "Precision u(P)", u: mu.uPrec, share: mu.uc > 0 ? (mu.uPrec ** 2 / mu.uc ** 2) * 100 : 0 },
              ...(mu.uBias !== null ? [{ name: "Bias u(bias)", u: mu.uBias, share: mu.uc > 0 ? (mu.uBias ** 2 / mu.uc ** 2) * 100 : 0 }] : []),
            ].sort((a, b) => b.share - a.share);
            const xbar = prec.gm, U = mu.U, uc = mu.uc, lo = xbar - U, hi = xbar + U;
            const pad = (hi - lo) * 0.25 || Math.abs(xbar) * 0.05 || 1;
            const BudgetTip = ({ active, payload }) => {
              if (!active || !payload || !payload.length) return null;
              const p = payload[0].payload;
              return (
                <div style={{ ...C.tooltip, padding: "6px 9px", minWidth: 160 }}>
                  <div style={{ ...C.tooltipLabel }}>{p.name}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, ...C.tooltipItem }}><span>Contribution</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(p.share, 1)} %</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, ...C.tooltipItem }}><span>u</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtSig(p.u)} {unit}</span></div>
                </div>
              );
            };
            const ResTip = ({ active }) => {
              if (!active) return null;
              return (
                <div style={{ ...C.tooltip, padding: "6px 9px", minWidth: 176 }}>
                  <div style={{ ...C.tooltipLabel }}>Reported result</div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, ...C.tooltipItem }}><span>x̄</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtSig(xbar)} {unit}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, ...C.tooltipItem }}><span>± U (k=2)</span><span style={{ fontVariantNumeric: "tabular-nums" }}>± {fmtSig(U)} ({fmt(mu.UPct, 1)} %)</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, ...C.tooltipItem }}><span>95 % interval</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtSig(lo, 3)} … {fmtSig(hi, 3)}</span></div>
                </div>
              );
            };
            return (
              <div className="space-y-2">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Uncertainty budget — variance contributions</CardTitle></CardHeader>
                  <CardContent className="h-[200px]">
                    <ChartFrame>{({ ResponsiveContainer, ComposedChart, LineChart, ScatterChart, BarChart, Line, Area, Bar, Scatter, Cell, XAxis, YAxis, CartesianGrid, RTooltip, ReferenceLine, ReferenceArea, ErrorBar }) => (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={comps} layout="vertical" margin={{ top: 8, right: 28, bottom: 4, left: 10 }}>
                        <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                        <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: C.axis }} stroke={C.grid} tickFormatter={(v) => v + "%"} />
                        <YAxis type="category" dataKey="name" width={96} tick={{ fontSize: 10, fill: C.axis }} stroke={C.grid} />
                        <RTooltip cursor={{ fill: C.grid, fillOpacity: 0.15 }} content={<BudgetTip />} />
                        <Bar dataKey="share" radius={[0, 4, 4, 0]} barSize={22} isAnimationActive={false}>
                          {comps.map((r, i) => <Cell key={i} fill={i === 0 ? C.primary : C.violet} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    )}</ChartFrame>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Reported result x̄ ± U (k = 2)</CardTitle></CardHeader>
                  <CardContent className="h-[200px]">
                    <ChartFrame>{({ ResponsiveContainer, ComposedChart, LineChart, ScatterChart, BarChart, Line, Area, Bar, Scatter, Cell, XAxis, YAxis, CartesianGrid, RTooltip, ReferenceLine, ReferenceArea, ErrorBar }) => (
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 8, right: 24, bottom: 4, left: 10 }}>
                        <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                        <XAxis type="number" dataKey="x" domain={[lo - pad, hi + pad]} tick={{ fontSize: 10, fill: C.axis }} stroke={C.grid} tickFormatter={(v) => fmtSig(v, 3)} />
                        <YAxis type="number" dataKey="y" domain={[0, 2]} ticks={[1]} width={96} tickFormatter={() => "Result"} tick={{ fontSize: 10, fill: C.axis }} stroke={C.grid} />
                        <RTooltip cursor={{ strokeDasharray: "3 3" }} content={<ResTip />} />
                        <ReferenceArea x1={xbar - uc} x2={xbar + uc} y1={0} y2={2} fill={C.primary} fillOpacity={0.12} />
                        <ReferenceLine x={xbar} stroke={C.ok} strokeDasharray="4 4" />
                        <Scatter data={[{ x: xbar, y: 1, err: U }]} fill={C.primary} isAnimationActive={false}>
                          <ErrorBar dataKey="err" width={7} strokeWidth={1.8} stroke={C.primary} direction="x" />
                        </Scatter>
                      </ScatterChart>
                    </ResponsiveContainer>
                    )}</ChartFrame>
                  </CardContent>
                </Card>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                The <b>budget</b> ranks each component by its share of the combined variance u<sub>c</sub>² (largest first) — showing at a glance whether <b>precision</b> or <b>bias</b> dominates and where to focus improvement.
                {" "}The <b>result</b> plot shows the value x̄ = {fmtSig(xbar)} {unit} with its expanded-uncertainty interval ± U (k = 2 ≈ 95 %); the shaded inner band is the standard uncertainty ± u<sub>c</sub> (k = 1).
              </p>
              </div>
            );
          })()}
          {(() => {
            const crm = trueness?.mode === "crm";
            const uRef = num(study.trueness.crmU) ?? 0;
            const sm = crm ? trueness.sd / Math.sqrt(trueness.n) : null;
            const steps = [
              { label: "1. Precision contribution — the intermediate precision sI from the ANOVA (Precision module) is taken directly as u(P)",
                formula: `u(P) = sI = ${fmtSig(mu.uPrec)} ${unit}` },
              mu.uBias === null
                ? { label: "2. Bias contribution — no trueness study assessed, so bias is not included",
                    formula: "u(bias) = —   (assess a CRM or spike recovery to include it)" }
                : crm
                  ? { label: "2. Bias contribution (CRM) — combine the standard error of the CRM mean, the CRM's own standard uncertainty, and the observed bias",
                      formula: `u(bias) = √( (s/√n)² + (U_CRM/2)² + bias² )\n= √( (${fmtSig(trueness.sd)}/√${trueness.n})² + (${fmtSig(uRef)}/2)² + ${fmtSig(trueness.bias, 3)}² )\n= √( ${fmtSig(sm, 3)}² + ${fmtSig(uRef / 2, 3)}² + ${fmtSig(trueness.bias, 3)}² ) = ${fmtSig(mu.uBias)} ${unit}`,
                      note: "U_CRM is the certificate's expanded uncertainty; dividing by 2 converts it back to a standard uncertainty (k = 2)." }
                  : { label: "2. Bias contribution (spike recovery) — the absolute bias is used as u(bias)",
                      formula: `u(bias) = |bias| = ${fmtSig(mu.uBias)} ${unit}` },
              { label: "3. Combine the independent components in quadrature",
                formula: mu.uBias === null
                  ? `uc = u(P) = ${fmtSig(mu.uc)} ${unit}`
                  : `uc = √( u(P)² + u(bias)² ) = √( ${fmtSig(mu.uPrec)}² + ${fmtSig(mu.uBias)}² ) = ${fmtSig(mu.uc)} ${unit}` },
              { label: "4. Expand to ~95 % confidence with coverage factor k = 2, then express relative to the result mean",
                formula: `U = 2 × uc = 2 × ${fmtSig(mu.uc)} = ${fmtSig(mu.U)} ${unit}\nU rel = U / x̄ × 100 = ${fmtSig(mu.U)} / ${fmtSig(prec.gm)} × 100 = ${fmt(mu.UPct, 2)} %`,
                note: "x̄ is the grand mean from the Precision ANOVA." },
            ];
            return <WorkSteps steps={steps} title="Show how U is calculated" />;
          })()}
        </>
      )}
    </div>
  );

  const ReportModule = () => {
    const rows = [
      ["Selectivity", status.selectivity, study.selectivity.interferents.filter((i) => i.name).length + " interferents assessed", "No unacceptable interference"],
      ["Linearity (R²)", status.linearity, lin ? fmt(lin.r2, 5) : "—", `≥ ${cr.r2Min}`],
      ["Max residual", status.linearity, lin ? fmt(lin.maxResidPct, 2) + " %" : "—", `≤ ${cr.residPctMax} %`],
      ...(lod && lod.approach === "usepa"
        ? [
            ["IDL (USEPA)", status.lodloq, lod.idl ? `${fmtSig(lod.idl.value)} ${unit}` : "—", "Determined (instrument)"],
            ["MDL (USEPA 40 CFR 136)", status.lodloq, lod.mdl != null ? `${fmtSig(lod.mdl)} ${unit}` : "—", "Determined (whole method)"],
          ]
        : [
            ["LOD", status.lodloq, lod ? `${fmtSig(lod.lod)} ${unit}` : "—", "Determined"],
            ["LOQ", status.lodloq, lod ? `${fmtSig(lod.loq)} ${unit}` : "—", "Determined & verified"],
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
      ["Uncertainty U", status.uncertainty, mu ? `${fmtSig(mu.U)} ${unit} (${fmt(mu.UPct, 1)} %)` : "—", "Estimated (k = 2)"],
    ];
    const fit = corePass && coreDone === 5;
    return (
      <div className="space-y-4 lvp-print-area">
        <div className={`rounded-xl border p-5 ${fit ? "border-emerald-600/40 bg-emerald-600/5" : "border-amber-500/40 bg-amber-500/5"}`}>
          <div className={`text-base font-semibold ${fit ? "text-emerald-600" : "text-amber-600"}`}>
            {fit ? "METHOD IS FIT FOR ITS INTENDED PURPOSE" : "REVIEW REQUIRED — not all criteria met or completed"}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Evaluated per Eurachem "The Fitness for Purpose of Analytical Methods" 3rd Ed. (2025), Planning &amp; Blanks
            supplements, and ISO/IEC 17025:2017 §7.2.2.
          </div>
        </div>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">{isVerification ? "Method Verification" : "Method Validation"} Summary — {study.info.title || "[method title]"}</CardTitle>
            <CardDescription className="text-xs font-data">
              {[study.info.id, study.info.analyte, study.info.matrix, study.info.technique, study.info.range && `Range: ${study.info.range}`].filter(Boolean).join(" · ") || "Complete the Study Plan module"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <DataTable headers={["Performance characteristic", "Result", "Criterion", "Status"]}
              rows={rows.map(([p, s, v, c]) => [p, <span key="v" className="font-data">{v}</span>, c, <StatusBadge key="s" s={s} />])} />
            <Separator />
            <div className="text-[13px] leading-relaxed">
              The method <b>{study.info.title || "[title]"}</b> for the determination of <b>{study.info.analyte || "[analyte]"}</b> in{" "}
              <b>{study.info.matrix || "[matrix]"}</b> by {study.info.technique || "[technique]"} has been{" "}
              {isVerification ? "verified" : "validated"} against the analytical requirement:{" "}
              <i>{study.info.requirement || "[not defined — set it in Study Plan]"}</i>.{" "}
              {fit
                ? "All evaluated performance characteristics meet the stated acceptance criteria; the method is deemed fit for its intended purpose within the stated scope."
                : "One or more performance characteristics are pending or outside the acceptance criteria; the method is not yet demonstrated fit for purpose."}
            </div>
            <div className="grid grid-cols-1 gap-8 pt-4 sm:grid-cols-3 sm:gap-6">
              {[
                ["Performed by", study.info.analyst],
                ["Reviewed by", study.info.reviewer === "QA Manager" ? "" : study.info.reviewer],
                ["Approved by", ""],
              ].map(([lab, name], i) => (
                <div key={i}>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-4">{lab}</div>
                  <div className="text-[11px] text-muted-foreground space-y-3">
                    <div className="border-b border-muted-foreground/40 pb-1">Name:{name ? ` ${name}` : ""}</div>
                    <div className="border-b border-muted-foreground/40 pb-1">Position:</div>
                    <div className="border-b border-muted-foreground/40 pb-1">Signature:</div>
                    <div className="border-b border-muted-foreground/40 pb-1">Date:</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <div className="flex gap-2 lvp-no-print">
          <Button onClick={() => setPdfOpen(true)}><Printer className="h-4 w-4 mr-1.5" />Print / PDF</Button>
          <Button variant="outline" onClick={exportJSON}><Download className="h-4 w-4 mr-1.5" />Export study (.json)</Button>
        </div>
      </div>
    );
  };

  const MODULE_VIEWS = {
    plan: PlanModule, selectivity: SelectivityModule, linearity: LinearityModule,
    lodloq: LodLoqModule, trueness: TruenessModule, precision: PrecisionModule,
    comparison: ComparisonModule,
    recovery: RecoveryModule, robustness: RobustnessModule,
    uncertainty: UncertaintyModule, report: ReportModule,
  };
  const ActiveView = MODULE_VIEWS[module];

  /* ── Beta sign-in wall: while the session check runs, then block guests ── */
  if (booting) {
    return (
      <div className={`lvp-root ${dark ? "dark" : ""} min-h-screen flex items-center justify-center bg-background`}>
        <style>{THEME_CSS}</style>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!tosAccepted) {
    return (
      <div className={`lvp-root ${dark ? "dark" : ""} min-h-screen bg-background`}>
        <style>{THEME_CSS}</style>
        <TermsDialog open mandatory onAgree={acceptTerms} />
      </div>
    );
  }
  if (requireLogin && !user) {
    return (
      <div className={`lvp-root ${dark ? "dark" : ""} min-h-screen bg-background`}>
        <style>{THEME_CSS}</style>
        <AuthDialog open mandatory onAuthed={handleAuthed} onViewTerms={() => setTermsOpen(true)} />
        <TermsDialog open={termsOpen} onClose={() => setTermsOpen(false)} />
      </div>
    );
  }

  /* ══════════════════════════ LAYOUT ══════════════════════════ */
  return (
    <ConfirmContext.Provider value={askDelete}>
    <TooltipProvider delayDuration={300}>
    <div className={`lvp-root ${dark ? "dark" : ""} min-h-screen`}>
      <style>{THEME_CSS}</style>

      {/* Top bar */}
      <header className="lvp-no-print sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur px-4 md:px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <FlaskConical className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold tracking-tight leading-tight">LabValidate <span className="text-primary">Pro</span></div>
            <div className="text-[10px] font-data text-muted-foreground truncate">EURACHEM 3RD ED. 2025 · ISO/IEC 17025:2017</div>
          </div>
          <Badge variant="outline" className="hidden sm:inline-flex text-primary border-primary/40 uppercase text-[10px] tracking-wider ml-1">
            {isVerification ? "Verification" : "Validation"}
          </Badge>
          <Badge variant="outline" className="inline-flex border-amber-500/50 text-amber-600 uppercase text-[10px] tracking-wider" title="Beta — still in development. Your feedback shapes it.">
            Beta
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={importJSON} />
          {user && (
            <>
              <span className="hidden sm:inline max-w-[220px] truncate text-[13px] font-medium text-muted-foreground mr-1">
                {user.name || user.email}
              </span>
              <Separator orientation="vertical" className="h-5 mr-1 hidden sm:block" />
            </>
          )}
          {user && view === "study" && (
            <Hint label="Workspace">
              <Button variant="ghost" size="sm" className="px-2" onClick={() => { refreshPresets(); setView("workspace"); }}>
                <LayoutDashboard className="h-4 w-4" />
              </Button>
            </Hint>
          )}
          <Hint label="New study">
            <Button variant="outline" size="sm" className="px-2" onClick={() => setNewOpen(true)}>
              <FilePlus className="h-4 w-4" />
            </Button>
          </Hint>
          <Hint label="Presets — save & open studies">
            <Button variant="ghost" size="sm" className="px-2" onClick={openPresets}><Library className="h-4 w-4" /></Button>
          </Hint>
          <Separator orientation="vertical" className="h-5 mx-1" />
          <Hint label={dark ? "Light appearance" : "Dark appearance"}>
            <Button variant="ghost" size="sm" className="px-2" onClick={() => setDark(!dark)}>
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </Hint>
          {user ? (
            <Hint label="Account & settings">
              <Button variant="ghost" size="sm" className="px-2" onClick={() => setAccountOpen(true)}>
                <UserCircle2 className="h-4 w-4" />
              </Button>
            </Hint>
          ) : (
            <Hint label="Sign in or create an account">
              <Button variant="ghost" size="sm" className="px-2" onClick={() => setAuthOpen(true)}>
                <LogIn className="h-4 w-4" />
              </Button>
            </Hint>
          )}
          <SettingsMenu
            user={user} dark={dark} setDark={setDark}
            onImport={() => fileRef.current?.click()}
            onExport={exportJSON}
            onOpenAccount={() => setAccountOpen(true)}
            onOpenAbout={() => setAboutOpen(true)}
            onOpenTutorial={() => setTutorialOpen(true)}
            onOpenFeedback={() => setFeedbackOpen(true)}
            onOpenReport={() => setReportOpen(true)}
            onOpenAdmin={() => setAdminOpen(true)}
            onSignIn={() => setAuthOpen(true)}
            onSignOut={handleSignOut}
          />
        </div>
      </header>

      {showTrialBanner && (
        <div className="lvp-no-print flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-[12px] text-amber-700 dark:text-amber-400">
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            {access.inTrial
              ? <>Beta trial — <b>{access.daysLeft} day{access.daysLeft === 1 ? "" : "s"} left</b>. Send feedback to unlock a full year.</>
              : <>Access ends in <b>{access.daysLeft} day{access.daysLeft === 1 ? "" : "s"}</b>. Send feedback to renew for a year.</>}
          </span>
          <button onClick={() => setFeedbackOpen(true)} className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:opacity-80">
            <MessageSquare className="h-3.5 w-3.5" />Send feedback
          </button>
        </div>
      )}

      {view === "workspace" && user ? (
        <WorkspaceDashboard
          user={user} presets={presets} loading={presetsLoading}
          onOpen={loadPreset} onDelete={setPendingDelete} onRename={renamePreset}
          onNew={startNewInWorkspace} onRefresh={refreshPresets}
        />
      ) : (
      <div className="flex flex-col md:flex-row max-w-[1240px] mx-auto md:max-w-none md:w-full md:pl-[228px]">
        {/* Validation rail */}
        <aside className="lvp-no-print md:fixed md:left-0 md:top-[61px] md:bottom-0 md:z-10 md:w-[228px] shrink-0 md:border-r border-border md:overflow-y-auto md:bg-background p-3">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground px-2 pb-2">Study progress</div>
          <nav className="flex md:flex-col gap-1 overflow-x-auto">
            {MODULES.map((m) => {
              const st = status[m.id];
              const active = module === m.id;
              return (
                <Hint key={m.id} label={m.hint} side="right"
                  className="max-w-[280px] whitespace-normal text-left leading-relaxed">
                  <button onClick={() => setModule(m.id)}
                    className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] whitespace-nowrap transition-colors w-full text-left ${
                      active ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted text-foreground"}`}>
                    <m.icon className={`h-4 w-4 shrink-0 ${active ? "" : "text-muted-foreground"}`} />
                    <span className="flex-1">{m.label}</span>
                    {m.id !== "report" && (
                      <span className={`h-2 w-2 rounded-full shrink-0 ${
                        st === "pass" ? "bg-emerald-500" : st === "fail" ? "bg-red-500" : st === "warn" ? "bg-amber-500"
                          : active ? "bg-primary-foreground/40" : "bg-border"}`} />
                    )}
                  </button>
                </Hint>
              );
            })}
          </nav>
          <div className="hidden md:block mt-5 mx-2 rounded-lg border border-border p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Core characteristics</div>
            <div className="font-data text-lg font-semibold mt-0.5">{coreDone}<span className="text-muted-foreground text-sm">/5</span></div>
            <div className="h-1.5 rounded-full bg-muted mt-2 overflow-hidden">
              <div className={`h-full rounded-full transition-all ${corePass && coreDone === 5 ? "bg-emerald-500" : "bg-primary"}`} style={{ width: `${(coreDone / 5) * 100}%` }} />
            </div>
          </div>
        </aside>

        {/* Main panel */}
        <main className="flex-1 min-w-0 p-4 md:p-6">
          <div className="lvp-no-print flex items-center gap-2 mb-4">
            <h1 className="text-lg font-semibold tracking-tight">{MODULES.find((m) => m.id === module)?.label}</h1>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <StatusBadge s={status[module] ?? "pending"} />
          </div>
          {ActiveView()}
        </main>
      </div>
      )}
      <footer id="app-footer" className="border-t border-border px-4 py-5 text-center text-xs text-muted-foreground md:ml-[228px]">
        Developed by{" "}
        <a
          href={LINKEDIN_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary underline-offset-4 transition-colors hover:underline hover:text-primary/80"
        >
          ChM. Ts. Hadi Fauzi, MRSC
        </a>
      </footer>

      {/* New-study confirmation */}
      {newOpen && (
        <div className="lvp-no-print fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setNewOpen(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative w-full max-w-md rounded-xl border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <div className="text-sm font-semibold">Start a new study?</div>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                This clears every field in all modules so you can start fresh. This can't be undone.
              </p>
              <p className="text-[12px] text-muted-foreground leading-relaxed">
                Your saved studies in <b>Presets</b> are not affected. If you want to keep the current work, cancel and save it first
                (Presets → Save, or Export study).
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => setNewOpen(false)}>Cancel</Button>
                <Button variant="destructive" size="sm" onClick={startNew}><FilePlus className="h-3.5 w-3.5 mr-1.5" />Clear &amp; start new</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Presets modal — save the current study and re-open saved ones */}
      {presetsOpen && (
        <div className="lvp-no-print fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 overflow-y-auto"
          onClick={() => setPresetsOpen(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg mt-[8vh] rounded-xl border border-border bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <Library className="h-4 w-4 text-primary" />
                <div className="text-sm font-semibold">Presets — saved studies</div>
              </div>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setPresetsOpen(false)}><X className="h-4 w-4" /></Button>
            </div>

            <div className="p-4 space-y-4">
              {user ? (
                /* Signed in — studies save to the account (Turso). */
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-center gap-2">
                  <Cloud className="h-4 w-4 text-primary shrink-0" />
                  <div className="text-[12px] text-muted-foreground">
                    Saving to your account (<span className="font-data">{user.email}</span>) — synced across your devices.
                  </div>
                </div>
              ) : (
                /* Guest — storage folder / localStorage. */
                <div className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Storage folder</div>
                    {folderName && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Connected
                      </span>
                    )}
                  </div>
                  {!canUseFolder ? (
                    <div className="text-[11px] text-amber-600">
                      Folder storage needs Chrome or Edge. Studies are kept in this browser; use Export / Import JSON to move them.
                    </div>
                  ) : folderName ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="min-w-0 flex-1 flex items-center gap-1.5 text-[13px]">
                        <FolderOpen className="h-4 w-4 text-primary shrink-0" />
                        <span className="font-data truncate">{folderName}</span>
                      </div>
                      <Button variant="outline" size="sm" className="h-8" onClick={chooseFolder}>Change</Button>
                      <Button variant="ghost" size="sm" className="h-8" onClick={disconnectFolder}>Disconnect</Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="outline" size="sm" className="h-9" onClick={chooseFolder}>
                        <FolderOpen className="h-3.5 w-3.5 mr-1.5" />Choose storage folder
                      </Button>
                      <span className="text-[11px] text-muted-foreground">Save each study as a .json file in your own folder.</span>
                    </div>
                  )}
                  <div className="text-[11px] text-muted-foreground pt-1">
                    Tip: <button className="font-medium text-primary hover:underline" onClick={() => { setPresetsOpen(false); setAuthOpen(true); }}>sign in</button> to sync studies across devices.
                  </div>
                </div>
              )}

              {/* Save current */}
              <div className="rounded-lg border border-border p-3 space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Save current study</div>
                <div className="flex gap-2">
                  <Input value={presetName} onChange={(e) => setPresetName(e.target.value)}
                    placeholder="Name this study (e.g. Cu in oil — 2026 Q3)" className="h-9 bg-card text-sm" />
                  <Button size="sm" className="h-9 shrink-0" onClick={savePreset}><Save className="h-3.5 w-3.5 mr-1.5" />Save</Button>
                </div>
              </div>

              {/* Examples */}
              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Examples — load a worked study</div>
                <div className="space-y-1.5">
                  {EXAMPLES.map((ex) => (
                    <div key={ex.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 hover:bg-muted/40">
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium truncate">{ex.name}</div>
                        <div className="text-[11px] text-muted-foreground leading-snug">{ex.blurb}</div>
                      </div>
                      <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={() => loadExample(ex)}>
                        <FlaskConical className="h-3.5 w-3.5 mr-1" />Load
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Saved list */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Open a saved study ({presets.length})</div>
                  <div className="flex items-center gap-1">
                    <input ref={libRef} type="file" accept=".json" className="hidden" onChange={importLibrary} />
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => libRef.current?.click()} title="Attach a library file">
                      <Upload className="h-3.5 w-3.5 mr-1" />Import file
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={exportLibrary} disabled={!presets.length} title="Download all as one file">
                      <Download className="h-3.5 w-3.5 mr-1" />Export all
                    </Button>
                  </div>
                </div>
                {presets.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-[12px] text-muted-foreground">
                    No saved studies yet. Name and save the current one above.
                  </div>
                ) : (
                  <div className="max-h-[46vh] overflow-y-auto space-y-1.5 pr-0.5">
                    {presets.map((e) => (
                      <div key={e.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 hover:bg-muted/40">
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-medium truncate">{e.name}</div>
                          <div className="text-[11px] text-muted-foreground font-data truncate">
                            {[e.analyte, e.matrix].filter(Boolean).join(" · ") || "—"}
                            {e.savedAt ? ` · ${new Date(e.savedAt).toLocaleString()}` : ""}
                          </div>
                        </div>
                        <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={() => loadPreset(e)}>
                          <Upload className="h-3.5 w-3.5 mr-1" />Open
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive shrink-0" onClick={() => setPendingDelete(e)} title="Delete study">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="text-[11px] text-muted-foreground border-t border-border pt-3">
                {user
                  ? <>Saved to your account in the cloud (Turso) — your studies follow you to any device where you sign in.</>
                  : folderName
                    ? <>Saving as <span className="font-data">.json</span> files in <span className="font-data">{folderName}</span> — portable, and the same files work with Export / Import.</>
                    : <>Saved in this browser. Connect a storage folder above for portable <span className="font-data">.json</span> files, or sign in to sync studies across devices with your account.</>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Accounts & settings dialogs.
          Everything lazy is mounted only while it is open — rendering a lazy
          component with open={false} would still fetch its chunk up front. */}
      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} onAuthed={handleAuthed} onViewTerms={() => setTermsOpen(true)} />
      <TermsDialog open={termsOpen} onClose={() => setTermsOpen(false)} />
      <Suspense fallback={null}>
        {accountOpen && (
          <AccountDialog
            open onClose={() => setAccountOpen(false)} user={user}
            onUpdated={setUser} onSignOut={() => { setAccountOpen(false); handleSignOut(); }}
            onDeleted={handleAccountDeleted}
          />
        )}
        {aboutOpen && <AboutDialog open onClose={() => setAboutOpen(false)} onOpenTerms={() => setTermsOpen(true)} />}
        {tutorialOpen && <TutorialDialog open onClose={() => setTutorialOpen(false)} />}

        {/* Feedback — voluntary dialog (dismissible) */}
        {feedbackOpen && !accessLocked && (
          <FeedbackDialog open onClose={() => setFeedbackOpen(false)} onSubmitted={handleFeedbackSubmitted} user={user} />
        )}
        {/* Report a bug / improvement — separate from feedback */}
        {reportOpen && <ReportDialog open onClose={() => setReportOpen(false)} />}

        {/* Build & export the validation report as a PDF (pick sections, tables/graphs) */}
        {pdfOpen && (
          <PdfReportDialog
            open={pdfOpen}
            onClose={() => setPdfOpen(false)}
            data={{ study, lin, lod, prec, trueness, comp, rec, robust, mu, status, cr, unit, isVerification, corePass, coreDone }}
          />
        )}

        {/* Access gate when the trial has lapsed: ask for feedback, then wait for approval */}
        {accessLocked && (access.pendingApproval
          ? <PendingGate user={user} onSignOut={handleSignOut} onRefresh={refreshSession} />
          : <FeedbackDialog open mandatory onSubmitted={handleFeedbackSubmitted} user={user} />)}

        {isAdmin && adminOpen && <AdminDialog open onClose={() => setAdminOpen(false)} />}
      </Suspense>

      {/* Delete confirmation — guards against accidentally removing a saved study */}
      {pendingDelete && (
        <div className="lvp-no-print fixed inset-0 z-[70] flex items-center justify-center p-4"
          onClick={() => setPendingDelete(null)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-2xl"
            onClick={(ev) => ev.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">Delete this study?</h2>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  <span className="font-medium text-foreground">{pendingDelete.name}</span> will be permanently deleted. This can’t be undone.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setPendingDelete(null)}>Cancel</Button>
              <Button variant="destructive" size="sm"
                onClick={() => { const id = pendingDelete.id; setPendingDelete(null); deletePreset(id); }}>
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Generic row-delete confirmation — guards every module's Trash button against an accidental click */}
      {confirmDel && (
        <div className="lvp-no-print fixed inset-0 z-[70] flex items-center justify-center p-4"
          onClick={() => setConfirmDel(null)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-2xl"
            onClick={(ev) => ev.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">{confirmDel.title}</h2>
                <p className="mt-1 text-[13px] text-muted-foreground">{confirmDel.message} This can’t be undone.</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmDel(null)}>Cancel</Button>
              <Button variant="destructive" size="sm"
                onClick={() => { const fn = confirmDel.onConfirm; setConfirmDel(null); fn?.(); }}>
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Toast — transient confirmation for save / delete / rename */}
      {toast && (
        <div className="lvp-no-print fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 px-2 w-full max-w-sm pointer-events-none">
          <div className={`flex items-center gap-2 rounded-lg border px-3.5 py-2.5 shadow-lg backdrop-blur text-[13px] font-medium animate-in fade-in slide-in-from-bottom-2 ${
            toast.type === "error"
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-emerald-500/30 bg-card text-foreground"}`}>
            {toast.type === "error"
              ? <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
              : <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />}
            <span>{toast.msg}</span>
          </div>
        </div>
      )}
    </div>
    </TooltipProvider>
    </ConfirmContext.Provider>
  );
}

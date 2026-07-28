import * as Recharts from "recharts";

/* ─────────────────────────────────────────────────────────────
   Render-prop bridge for recharts.

   recharts and its d3 dependencies are the largest single slice of the main
   bundle, yet no chart is drawn until the analyst opens a module that has one —
   the Study Plan landing module has none. Owning the import here, behind the
   lazy() boundary in labvalidate-pro.jsx, moves the whole library into its own
   chunk while each chart's JSX stays at its call site, still closing over the
   local study data it needs.

   `Tooltip` is handed over as `RTooltip` because the shadcn/ui Tooltip is
   already in scope where the charts are written.
   ───────────────────────────────────────────────────────────── */
const kit = { ...Recharts, RTooltip: Recharts.Tooltip };

export default function ChartKit({ children }) {
  return children(kit);
}

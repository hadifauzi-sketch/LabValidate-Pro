import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { devApiPlugin } from "./dev-api-plugin.mjs";

export default defineConfig({
  plugins: [react(), devApiPlugin()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  build: {
    // Keep the readable source out of production: no .map files are emitted, so
    // devtools only ever shows the minified bundle. This is Vite's default —
    // it is pinned here so it cannot be turned on by accident.
    sourcemap: false,
    rollupOptions: {
      output: {
        // Split the stable dependencies into their own chunks. They change far
        // less often than app code, so returning visitors keep them cached
        // across deploys instead of re-downloading them with every release.
        // recharts and @react-pdf are deliberately absent: both are reached only
        // through dynamic import(), so Rollup already gives them async chunks
        // that never load until a chart or the PDF dialog is actually needed.
        // Matched on the resolved module id rather than the package name: the
        // bare-specifier form leaves React in whichever chunk imports it first
        // and emits an empty "react" chunk.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          const pkg = id.replace(/\\/g, "/").split("node_modules/").pop();
          if (/^(date-fns|react-day-picker)\//.test(pkg)) return "dates";
          if (/^(react|react-dom|scheduler)\//.test(pkg)) return "react";
          if (pkg.startsWith("@radix-ui/")) return "radix";
        },
      },
    },
  },
});

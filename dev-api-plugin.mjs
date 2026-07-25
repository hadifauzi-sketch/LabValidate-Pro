/**
 * Vite dev plugin: serve the /api/* serverless functions during `npm run dev`,
 * so local development needs no Vercel account. On Vercel these same files run
 * natively as serverless functions and this plugin is not involved.
 *
 * It shims the two Vercel helpers the handlers use — res.status() and res.json()
 * — and maps request paths to the handler files (including the [id] route).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  try {
    const text = readFileSync(join(__dirname, ".env.local"), "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch { /* no .env.local — handlers will report missing config */ }
}

// Map a request pathname to { file, params } or null.
function route(pathname) {
  const parts = pathname.replace(/^\/api\//, "").split("/").filter(Boolean);
  if (parts[0] === "auth" && parts.length === 2) return { file: `api/auth/${parts[1]}.js`, params: {} };
  if (parts[0] === "studies" && parts.length === 1) return { file: "api/studies/index.js", params: {} };
  if (parts[0] === "studies" && parts.length === 2) return { file: "api/studies/[id].js", params: { id: decodeURIComponent(parts[1]) } };
  if (parts[0] === "feedback" && parts.length === 1) return { file: "api/feedback.js", params: {} };
  if (parts[0] === "reports" && parts.length === 1) return { file: "api/reports.js", params: {} };
  if (parts[0] === "admin" && parts[1] === "users" && parts.length === 2) return { file: "api/admin/users/index.js", params: {} };
  if (parts[0] === "admin" && parts[1] === "users" && parts.length === 3) return { file: "api/admin/users/[id].js", params: { id: decodeURIComponent(parts[2]) } };
  return null;
}

export function devApiPlugin() {
  return {
    name: "dev-api",
    configureServer(server) {
      loadEnvLocal();
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith("/api/")) return next();
        const url = new URL(req.url, "http://localhost");
        const match = route(url.pathname);
        if (!match) { res.statusCode = 404; res.end(JSON.stringify({ error: "Not found" })); return; }

        // Attach Vercel-style helpers + query.
        req.query = { ...Object.fromEntries(url.searchParams), ...match.params };
        res.status = (c) => { res.statusCode = c; return res; };
        res.json = (o) => {
          if (!res.getHeader("Content-Type")) res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(o)); return res;
        };

        try {
          const mod = await server.ssrLoadModule("/" + match.file);
          await mod.default(req, res);
        } catch (err) {
          server.config.logger.error("[dev-api] " + (err?.stack || err));
          if (!res.writableEnded) { res.statusCode = 500; res.end(JSON.stringify({ error: "Dev API error" })); }
        }
      });
    },
  };
}

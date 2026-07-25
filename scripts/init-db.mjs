/**
 * One-time database setup for LabValidate Pro.
 *
 * Creates the `users` and `studies` tables in your Turso database.
 * Safe to run more than once (every statement is IF NOT EXISTS).
 *
 * Usage:
 *   1. Fill in .env.local  (copy from .env.example)
 *   2. node scripts/init-db.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@libsql/client";

const __dirname = dirname(fileURLToPath(import.meta.url));

/* Tiny .env.local loader — avoids a dotenv dependency for this one script. */
function loadEnv() {
  const path = join(__dirname, "..", ".env.local");
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    console.error("✗ .env.local not found. Copy .env.example to .env.local and fill it in first.");
    process.exit(1);
  }
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2].trim().replace(/^["']|["']$/g, "");
    if (!(m[1] in process.env)) process.env[m[1]] = val;
  }
}

loadEnv();

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || url.includes("your-database-name")) {
  console.error("✗ TURSO_DATABASE_URL is not set in .env.local");
  process.exit(1);
}

const db = createClient({ url, authToken });

const statements = [
  `CREATE TABLE IF NOT EXISTS users (
     id                TEXT PRIMARY KEY,
     email             TEXT UNIQUE NOT NULL,
     name              TEXT,
     password_hash     TEXT NOT NULL,
     created_at        TEXT NOT NULL,
     role              TEXT NOT NULL DEFAULT 'user',
     access_expires_at TEXT,
     last_feedback_at  TEXT,
     approved_at       TEXT,
     company           TEXT,
     job               TEXT,
     country           TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS studies (
     id         TEXT PRIMARY KEY,
     user_id    TEXT NOT NULL,
     name       TEXT NOT NULL,
     analyte    TEXT,
     matrix     TEXT,
     data       TEXT NOT NULL,
     saved_at   TEXT NOT NULL,
     updated_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS feedback (
     id         TEXT PRIMARY KEY,
     user_id    TEXT NOT NULL,
     rating     INTEGER NOT NULL,
     type       TEXT,
     comment    TEXT,
     created_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS reports (
     id         TEXT PRIMARY KEY,
     user_id    TEXT NOT NULL,
     type       TEXT NOT NULL,
     title      TEXT,
     detail     TEXT NOT NULL,
     created_at TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_studies_user ON studies(user_id, saved_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at DESC)`,
];

// Columns added after v1 — safe to run on an existing users table.
const migrations = [
  "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'",
  "ALTER TABLE users ADD COLUMN access_expires_at TEXT",
  "ALTER TABLE users ADD COLUMN last_feedback_at TEXT",
  "ALTER TABLE users ADD COLUMN approved_at TEXT",
  "ALTER TABLE users ADD COLUMN company TEXT",
  "ALTER TABLE users ADD COLUMN job TEXT",
  "ALTER TABLE users ADD COLUMN country TEXT",
];

try {
  for (const sql of statements) await db.execute(sql);
  for (const sql of migrations) {
    try { await db.execute(sql); }
    catch (e) { if (!/duplicate column/i.test(e.message || "")) throw e; }  // already applied
  }

  // Promote configured admins (so your own account becomes admin, even if it
  // was created before roles existed).
  const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (adminEmails.length) {
    const ph = adminEmails.map(() => "?").join(",");
    const r = await db.execute({ sql: `UPDATE users SET role='admin', access_expires_at=NULL WHERE lower(email) IN (${ph})`, args: adminEmails });
    if (r.rowsAffected) console.log(`✓ Promoted ${r.rowsAffected} admin account(s): ${adminEmails.join(", ")}`);
  }

  // Backfill a trial window for any legacy accounts that predate the access model.
  const trialDays = Number(process.env.TRIAL_DAYS || 30);
  const legacy = await db.execute("SELECT id, created_at FROM users WHERE role='user' AND access_expires_at IS NULL");
  for (const row of legacy.rows) {
    const exp = new Date(Date.parse(row.created_at) + trialDays * 86400000).toISOString();
    await db.execute({ sql: "UPDATE users SET access_expires_at=? WHERE id=?", args: [exp, row.id] });
  }
  if (legacy.rows.length) console.log(`✓ Backfilled trial window for ${legacy.rows.length} existing tester(s)`);

  const tables = await db.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users','studies','feedback','reports') ORDER BY name",
  );
  console.log("✓ Database ready. Tables present:", tables.rows.map((r) => r.name).join(", "));
} catch (err) {
  console.error("✗ Setup failed:", err.message || err);
  process.exit(1);
}

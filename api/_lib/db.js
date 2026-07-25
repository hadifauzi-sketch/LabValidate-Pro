import { createClient } from "@libsql/client";

/* Single shared libSQL client, reused across serverless invocations.
   Credentials come from environment variables — never the browser. */
let _client = null;

export function db() {
  if (_client) return _client;
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) throw new Error("TURSO_DATABASE_URL is not configured");
  _client = createClient({ url, authToken });
  return _client;
}

/* Parameterized query helper — args are bound, never string-concatenated,
   so user input can't be injected into SQL. */
export async function query(sql, args = []) {
  return db().execute({ sql, args });
}

export async function queryOne(sql, args = []) {
  const res = await query(sql, args);
  return res.rows[0] ?? null;
}

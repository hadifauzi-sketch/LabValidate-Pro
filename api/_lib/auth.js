import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { SignJWT, jwtVerify } from "jose";
import { queryOne } from "./db.js";

/* ── Beta access model ───────────────────────────────────────────
   Roles: 'admin' (unlimited) and 'user'. A user gets a free trial;
   submitting feedback grants/renews a longer access window. These
   helpers turn a DB users-row into the access info the client uses. */
export function accessInfo(row, now = Date.now()) {
  const role = row.role || "user";
  const isAdmin = role === "admin";
  const expiresAt = row.access_expires_at || null;
  const expMs = expiresAt ? Date.parse(expiresAt) : null;
  const expired = !isAdmin && expMs != null && now > expMs;
  const daysLeft = isAdmin || expMs == null ? null : Math.max(0, Math.ceil((expMs - now) / 86400000));
  const hasFeedback = !!row.last_feedback_at;
  const approved = !!row.approved_at;
  const pendingApproval = !isAdmin && hasFeedback && !approved;   // gave feedback, awaiting admin
  const inTrial = !isAdmin && !approved && !expired;              // initial window, not yet approved
  let status;                                                    // one-word state for the admin UI
  if (isAdmin) status = "admin";
  else if (approved) status = expired ? "expired" : "active";
  else if (hasFeedback) status = "pending";
  else status = expired ? "expired" : "trial";
  return { role, isAdmin, expiresAt, expired, daysLeft, hasFeedback, approved, pendingApproval, inTrial, status };
}

/* The user shape returned to the browser — no password hash, plus profile + access. */
export function publicUser(row) {
  return {
    id: row.id, email: row.email, name: row.name, role: row.role || "user",
    company: row.company || null, job: row.job || null, country: row.country || null,
    access: accessInfo(row),
  };
}

const scryptAsync = promisify(scrypt);

const COOKIE = "lvp_session";
// Session is browser-session-scoped: the cookie carries no Max-Age/Expires, so
// the browser drops it when the window/browser is closed and the user must sign
// in again. This shorter JWT lifetime is just a hard backstop in case a browser
// restores session cookies ("continue where you left off").
const SESSION_DAYS = 1;

/* ── Password hashing (scrypt, per-user random salt) ─────────────── */
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, 64);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [saltHex, hashHex] = stored.split(":");
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = await scryptAsync(password, salt, 64);
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/* ── Session JWT (signed with AUTH_SECRET) ───────────────────────── */
function secretKey() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not configured");
  return new TextEncoder().encode(s);
}

export async function signSession(userId) {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
}

export async function readSession(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload.sub || null;
  } catch {
    return null;
  }
}

/* ── Cookie helpers ──────────────────────────────────────────────── */
export function parseCookies(req) {
  const header = req.headers?.cookie || "";
  const out = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === "production";
  // No Max-Age / Expires → a session cookie that the browser deletes on close,
  // forcing a fresh sign-in each time the app is reopened.
  res.setHeader("Set-Cookie",
    `${COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax${secure ? "; Secure" : ""}`);
}

export function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === "production";
  res.setHeader("Set-Cookie",
    `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`);
}

/* ── Request guard ───────────────────────────────────────────────── */
export async function getUser(req) {
  const token = parseCookies(req)[COOKIE];
  const userId = await readSession(token);
  if (!userId) return null;
  const row = await queryOne(
    "SELECT id, email, name, role, access_expires_at, last_feedback_at, approved_at, company, job, country FROM users WHERE id = ?",
    [userId],
  );
  return row ? publicUser(row) : null;
}

/* Returns the user, or writes a 401 and returns null. */
export async function requireUser(req, res) {
  const user = await getUser(req);
  if (!user) {
    res.status(401).json({ error: "Not signed in" });
    return null;
  }
  return user;
}

/* Like requireUser, but also 403s when the beta access window has expired
   (admins are never blocked). Use to protect actions that need active access. */
export async function requireActive(req, res) {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (!user.access.isAdmin && user.access.expired) {
    res.status(403).json({ error: "Your beta access has ended — send feedback to continue.", access: user.access });
    return null;
  }
  return user;
}

/* Admin-only guard. */
export async function requireAdmin(req, res) {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (!user.access.isAdmin) {
    res.status(403).json({ error: "Admins only." });
    return null;
  }
  return user;
}

/* ── Shared body parsing / helpers ───────────────────────────────── */
export async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body) {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  // Fallback: read the raw stream (some runtimes don't pre-parse).
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
    req.on("error", () => resolve({}));
  });
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function newId() {
  return randomBytes(16).toString("hex");
}

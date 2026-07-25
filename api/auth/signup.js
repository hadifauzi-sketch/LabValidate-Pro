import { query, queryOne } from "../_lib/db.js";
import {
  hashPassword, signSession, setSessionCookie, readBody, EMAIL_RE, newId, publicUser,
} from "../_lib/auth.js";
import { isAdminEmail, daysFromNow, TRIAL_DAYS } from "../_lib/config.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { email, password, name } = await readBody(req);
    const cleanEmail = String(email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(cleanEmail)) return res.status(400).json({ error: "Enter a valid email address." });
    if (String(password || "").length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });

    const existing = await queryOne("SELECT id FROM users WHERE email = ?", [cleanEmail]);
    if (existing) return res.status(409).json({ error: "An account with that email already exists." });

    const id = newId();
    const hash = await hashPassword(String(password));
    const cleanName = String(name || "").trim() || null;
    const admin = isAdminEmail(cleanEmail);
    const role = admin ? "admin" : "user";
    const createdAt = new Date().toISOString();
    const accessExpires = admin ? null : daysFromNow(TRIAL_DAYS);   // admins never expire

    await query(
      "INSERT INTO users (id, email, name, password_hash, created_at, role, access_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, cleanEmail, cleanName, hash, createdAt, role, accessExpires],
    );

    const token = await signSession(id);
    setSessionCookie(res, token);
    return res.status(201).json({
      user: publicUser({ id, email: cleanEmail, name: cleanName, role, access_expires_at: accessExpires, last_feedback_at: null }),
    });
  } catch (err) {
    console.error("signup error", err);
    return res.status(500).json({ error: "Could not create the account. Try again." });
  }
}

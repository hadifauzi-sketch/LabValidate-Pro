import { queryOne } from "../_lib/db.js";
import { verifyPassword, signSession, setSessionCookie, readBody, publicUser } from "../_lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { email, password } = await readBody(req);
    const cleanEmail = String(email || "").trim().toLowerCase();
    const row = await queryOne(
      "SELECT id, email, name, password_hash, role, access_expires_at, last_feedback_at, approved_at, company, job, country FROM users WHERE email = ?",
      [cleanEmail],
    );
    // Same message whether the email or password is wrong (don't reveal which).
    const ok = row && (await verifyPassword(String(password || ""), row.password_hash));
    if (!ok) return res.status(401).json({ error: "Incorrect email or password." });

    const token = await signSession(row.id);
    setSessionCookie(res, token);
    return res.status(200).json({ user: publicUser(row) });
  } catch (err) {
    console.error("login error", err);
    return res.status(500).json({ error: "Could not sign in. Try again." });
  }
}

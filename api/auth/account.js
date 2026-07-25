import { query, queryOne } from "../_lib/db.js";
import {
  requireUser, readBody, hashPassword, verifyPassword, clearSessionCookie, publicUser,
} from "../_lib/auth.js";

export default async function handler(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;

  try {
    // PATCH — update profile name and/or change password.
    if (req.method === "PATCH") {
      const body = await readBody(req);

      if (typeof body.name === "string") {
        await query("UPDATE users SET name = ? WHERE id = ?", [body.name.trim() || null, user.id]);
      }

      if (body.newPassword != null) {
        if (String(body.newPassword).length < 8)
          return res.status(400).json({ error: "New password must be at least 8 characters." });
        const row = await queryOne("SELECT password_hash FROM users WHERE id = ?", [user.id]);
        const ok = await verifyPassword(String(body.currentPassword || ""), row?.password_hash);
        if (!ok) return res.status(400).json({ error: "Current password is incorrect." });
        await query("UPDATE users SET password_hash = ? WHERE id = ?",
          [await hashPassword(String(body.newPassword)), user.id]);
      }

      const updated = await queryOne(
        "SELECT id, email, name, role, access_expires_at, last_feedback_at, approved_at, company, job, country FROM users WHERE id = ?", [user.id]);
      return res.status(200).json({ user: publicUser(updated) });
    }

    // DELETE — remove the account and every study it owns.
    if (req.method === "DELETE") {
      await query("DELETE FROM studies WHERE user_id = ?", [user.id]);
      await query("DELETE FROM users WHERE id = ?", [user.id]);
      clearSessionCookie(res);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("account error", err);
    return res.status(500).json({ error: "Could not update the account. Try again." });
  }
}

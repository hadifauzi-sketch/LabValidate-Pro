import { query, queryOne } from "../../_lib/db.js";
import { requireAdmin, readBody, publicUser } from "../../_lib/auth.js";
import { daysFromNow, TRIAL_DAYS, ACCESS_DAYS } from "../../_lib/config.js";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const id = String(req.query?.id || "");
  if (!id) return res.status(400).json({ error: "Missing user id." });

  try {
    // PATCH — admin controls a tester's access / role.
    if (req.method === "PATCH") {
      const { action, role } = await readBody(req);
      const now = new Date().toISOString();
      if (action === "approve" || action === "grantYear") {
        // Approve the tester for a full year of access.
        await query("UPDATE users SET approved_at = ?, access_expires_at = ? WHERE id = ? AND role != 'admin'", [now, daysFromNow(ACCESS_DAYS), id]);
      } else if (action === "resetTrial") {
        await query("UPDATE users SET access_expires_at = ?, last_feedback_at = NULL, approved_at = NULL WHERE id = ? AND role != 'admin'", [daysFromNow(TRIAL_DAYS), id]);
      } else if (action === "block") {
        await query("UPDATE users SET access_expires_at = ?, approved_at = NULL WHERE id = ? AND role != 'admin'", [new Date(0).toISOString(), id]);
      } else if (action === "setRole") {
        if (!["admin", "user"].includes(role)) return res.status(400).json({ error: "Invalid role." });
        // Promoting to admin clears the expiry; demoting starts a fresh trial.
        const expiry = role === "admin" ? null : daysFromNow(TRIAL_DAYS);
        await query("UPDATE users SET role = ?, access_expires_at = ?, approved_at = NULL WHERE id = ?", [role, expiry, id]);
      } else {
        return res.status(400).json({ error: "Unknown action." });
      }
      const row = await queryOne(
        "SELECT id, email, name, role, access_expires_at, last_feedback_at, approved_at, company, job, country FROM users WHERE id = ?", [id]);
      if (!row) return res.status(404).json({ error: "User not found." });
      return res.status(200).json({ user: publicUser(row) });
    }

    // DELETE — remove a tester and all of their data.
    if (req.method === "DELETE") {
      if (id === admin.id) return res.status(400).json({ error: "You can't delete your own admin account here." });
      await query("DELETE FROM studies WHERE user_id = ?", [id]);
      await query("DELETE FROM feedback WHERE user_id = ?", [id]);
      await query("DELETE FROM reports WHERE user_id = ?", [id]);
      await query("DELETE FROM users WHERE id = ?", [id]);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("admin user [id] error", err);
    return res.status(500).json({ error: "Could not update the user." });
  }
}

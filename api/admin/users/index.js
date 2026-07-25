import { query } from "../../_lib/db.js";
import { requireAdmin, accessInfo } from "../../_lib/auth.js";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const r = await query(
      `SELECT u.id, u.email, u.name, u.role, u.created_at, u.access_expires_at, u.last_feedback_at,
              u.approved_at, u.company, u.job, u.country,
              (SELECT COUNT(*) FROM feedback f WHERE f.user_id = u.id) AS feedback_count,
              (SELECT COUNT(*) FROM studies s WHERE s.user_id = u.id) AS study_count
         FROM users u ORDER BY u.created_at DESC`,
    );
    const users = r.rows.map((x) => ({
      id: x.id, email: x.email, name: x.name, role: x.role || "user",
      company: x.company || null, job: x.job || null, country: x.country || null,
      createdAt: x.created_at, feedbackCount: Number(x.feedback_count || 0),
      studyCount: Number(x.study_count || 0), access: accessInfo(x),
    }));
    return res.status(200).json({ users });
  } catch (err) {
    console.error("admin users error", err);
    return res.status(500).json({ error: "Could not load users." });
  }
}

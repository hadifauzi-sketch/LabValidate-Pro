import { query, queryOne } from "./_lib/db.js";
import { requireUser, requireAdmin, readBody, newId, publicUser } from "./_lib/auth.js";
import { daysFromNow, ACCESS_DAYS, AUTO_APPROVE } from "./_lib/config.js";

export default async function handler(req, res) {
  try {
    // POST — a signed-in tester submits feedback (star + comment + who they are).
    // Allowed even when expired, since this is what puts them up for approval.
    if (req.method === "POST") {
      const user = await requireUser(req, res);
      if (!user) return;

      const { rating, comment, name, company, job, country } = await readBody(req);
      const stars = Math.round(Number(rating));
      if (!(stars >= 1 && stars <= 5)) return res.status(400).json({ error: "Please give a star rating (1–5)." });
      const text = String(comment || "").trim();
      if (!text) return res.status(400).json({ error: "Please add a short comment." });
      const cleanName = String(name || "").trim();
      const cleanCompany = String(company || "").trim();
      const cleanJob = String(job || "").trim();
      if (!cleanName) return res.status(400).json({ error: "Please tell us your name." });
      if (!cleanCompany) return res.status(400).json({ error: "Please add your company / organisation." });
      if (!cleanJob) return res.status(400).json({ error: "Please add your job / role." });

      const now = new Date().toISOString();
      await query(
        "INSERT INTO feedback (id, user_id, rating, type, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        [newId(), user.id, stars, "feedback", text.slice(0, 4000), now],
      );
      // Save who they are onto the profile so the admin panel can show it.
      await query(
        "UPDATE users SET name = ?, company = ?, job = ?, country = ?, last_feedback_at = ? WHERE id = ?",
        [cleanName, cleanCompany.slice(0, 120), cleanJob.slice(0, 120), String(country || "").trim().slice(0, 80) || null, now, user.id],
      );

      // Approval: auto-grant a year, or leave the tester "pending" for the admin.
      if (!user.access.isAdmin) {
        if (AUTO_APPROVE) {
          await query("UPDATE users SET approved_at = ?, access_expires_at = ? WHERE id = ?", [now, daysFromNow(ACCESS_DAYS), user.id]);
        } else if (user.access.expired) {
          await query("UPDATE users SET approved_at = NULL WHERE id = ?", [user.id]);  // needs fresh approval
        }
      }

      const row = await queryOne(
        "SELECT id, email, name, role, access_expires_at, last_feedback_at, approved_at, company, job, country FROM users WHERE id = ?", [user.id]);
      return res.status(201).json({ user: publicUser(row) });
    }

    // GET — admin views all feedback + a summary.
    if (req.method === "GET") {
      const admin = await requireAdmin(req, res);
      if (!admin) return;
      const r = await query(
        `SELECT f.id, f.rating, f.comment, f.created_at, u.email, u.name, u.company, u.job, u.country
           FROM feedback f LEFT JOIN users u ON u.id = f.user_id
          ORDER BY f.created_at DESC`,
      );
      const items = r.rows.map((x) => ({
        id: x.id, rating: x.rating, comment: x.comment, createdAt: x.created_at,
        email: x.email, name: x.name, company: x.company, job: x.job, country: x.country,
      }));
      const count = items.length;
      const avg = count ? items.reduce((s, x) => s + x.rating, 0) / count : 0;
      return res.status(200).json({ feedback: items, summary: { count, avg: Math.round(avg * 100) / 100 } });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("feedback error", err);
    return res.status(500).json({ error: "Could not save feedback. Try again." });
  }
}

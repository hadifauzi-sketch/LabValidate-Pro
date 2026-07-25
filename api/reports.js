import { query } from "./_lib/db.js";
import { requireUser, requireAdmin, readBody, newId } from "./_lib/auth.js";

const TYPES = ["bug", "improvement"];

export default async function handler(req, res) {
  try {
    // POST — any signed-in user reports a bug or an improvement idea.
    if (req.method === "POST") {
      const user = await requireUser(req, res);
      if (!user) return;

      const { type, title, detail } = await readBody(req);
      const t = TYPES.includes(String(type)) ? String(type) : "bug";
      const body = String(detail || "").trim();
      if (!body) return res.status(400).json({ error: "Please describe the bug or the improvement." });

      await query(
        "INSERT INTO reports (id, user_id, type, title, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        [newId(), user.id, t, String(title || "").trim().slice(0, 200) || null, body.slice(0, 8000), new Date().toISOString()],
      );
      return res.status(201).json({ ok: true });
    }

    // GET — admin views all reports.
    if (req.method === "GET") {
      const admin = await requireAdmin(req, res);
      if (!admin) return;
      const r = await query(
        `SELECT r.id, r.type, r.title, r.detail, r.created_at, u.email, u.name
           FROM reports r LEFT JOIN users u ON u.id = r.user_id
          ORDER BY r.created_at DESC`,
      );
      const items = r.rows.map((x) => ({
        id: x.id, type: x.type, title: x.title, detail: x.detail,
        createdAt: x.created_at, email: x.email, name: x.name,
      }));
      return res.status(200).json({ reports: items });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("reports error", err);
    return res.status(500).json({ error: "Could not save the report. Try again." });
  }
}

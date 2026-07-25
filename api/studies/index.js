import { query, queryOne } from "../_lib/db.js";
import { requireUser, requireActive, readBody, newId } from "../_lib/auth.js";

export default async function handler(req, res) {
  // Reads need any signed-in user; writes need active (non-expired) access.
  const user = req.method === "GET" ? await requireUser(req, res) : await requireActive(req, res);
  if (!user) return;

  try {
    // GET — list this user's studies (metadata only; the heavy `data` blob is
    // fetched per-study when a study is opened).
    if (req.method === "GET") {
      const rows = await query(
        `SELECT id, name, analyte, matrix, saved_at, updated_at
           FROM studies WHERE user_id = ? ORDER BY saved_at DESC`,
        [user.id],
      );
      const studies = rows.rows.map((r) => ({
        id: r.id, name: r.name, analyte: r.analyte, matrix: r.matrix,
        savedAt: r.updated_at || r.saved_at,
      }));
      return res.status(200).json({ studies });
    }

    // POST — save (insert or update) a study. Upsert by id, scoped to the user.
    if (req.method === "POST") {
      const body = await readBody(req);
      const study = body.study;
      if (!study || typeof study !== "object")
        return res.status(400).json({ error: "Missing study data." });

      const name = String(body.name || study?.info?.title || study?.info?.id || "Untitled study").slice(0, 200);
      const analyte = study?.info?.analyte ? String(study.info.analyte) : null;
      const matrix = study?.info?.matrix ? String(study.info.matrix) : null;
      const data = JSON.stringify(study);
      const now = new Date().toISOString();

      let id = body.id ? String(body.id) : null;
      const existing = id
        ? await queryOne("SELECT id FROM studies WHERE id = ? AND user_id = ?", [id, user.id])
        : null;

      if (existing) {
        await query(
          `UPDATE studies SET name = ?, analyte = ?, matrix = ?, data = ?, updated_at = ?
             WHERE id = ? AND user_id = ?`,
          [name, analyte, matrix, data, now, id, user.id],
        );
      } else {
        id = id || newId();
        await query(
          `INSERT INTO studies (id, user_id, name, analyte, matrix, data, saved_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, user.id, name, analyte, matrix, data, now, now],
        );
      }
      return res.status(200).json({ id, name, analyte, matrix, savedAt: now });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("studies index error", err);
    return res.status(500).json({ error: "Could not reach your studies. Try again." });
  }
}

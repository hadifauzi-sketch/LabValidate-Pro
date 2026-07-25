import { query, queryOne } from "../_lib/db.js";
import { requireUser, requireActive, readBody } from "../_lib/auth.js";

export default async function handler(req, res) {
  // Reading a study needs a session; renaming/deleting needs active access.
  const user = req.method === "GET" ? await requireUser(req, res) : await requireActive(req, res);
  if (!user) return;

  const id = String(req.query?.id || "");
  if (!id) return res.status(400).json({ error: "Missing study id." });

  try {
    // GET — the full study (incl. the `data` JSON) for opening in the editor.
    if (req.method === "GET") {
      const row = await queryOne(
        "SELECT id, name, analyte, matrix, data, saved_at, updated_at FROM studies WHERE id = ? AND user_id = ?",
        [id, user.id],
      );
      if (!row) return res.status(404).json({ error: "Study not found." });
      let study;
      try { study = JSON.parse(row.data); } catch { study = null; }
      return res.status(200).json({
        id: row.id, name: row.name, analyte: row.analyte, matrix: row.matrix,
        savedAt: row.updated_at || row.saved_at, study,
      });
    }

    // PATCH — rename a study in place (name only; data untouched).
    if (req.method === "PATCH") {
      const { name } = await readBody(req);
      const clean = String(name || "").trim().slice(0, 200);
      if (!clean) return res.status(400).json({ error: "A name is required." });
      const now = new Date().toISOString();
      const r = await query(
        "UPDATE studies SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?",
        [clean, now, id, user.id],
      );
      if (r.rowsAffected === 0) return res.status(404).json({ error: "Study not found." });
      return res.status(200).json({ id, name: clean, savedAt: now });
    }

    // DELETE — remove one study (only if it belongs to this user).
    if (req.method === "DELETE") {
      await query("DELETE FROM studies WHERE id = ? AND user_id = ?", [id, user.id]);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("study [id] error", err);
    return res.status(500).json({ error: "Could not reach that study. Try again." });
  }
}

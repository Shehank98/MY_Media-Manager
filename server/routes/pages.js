import { Router } from "express";
import { query } from "../db.js";
import { ah } from "../util.js";
import { encrypt, decrypt } from "../services/crypto.js";
import { getPageInfo } from "../services/facebook.js";

const router = Router();

// Helper: load a page row with its decrypted token.
export async function loadPage(id) {
  const { rows } = await query("SELECT * FROM pages WHERE id = $1", [id]);
  if (!rows[0]) return null;
  const page = rows[0];
  page.access_token = decrypt(page.access_token);
  return page;
}

// List all managed pages (tokens never returned to the client).
router.get("/", ah(async (_req, res) => {
  const { rows } = await query(
    "SELECT id, name, fb_page_id, website, about, languages, created_at FROM pages ORDER BY created_at ASC"
  );
  res.json(rows);
}));

// Add a page by pasting its FB Page ID + access token.
// We verify the token against Facebook before saving.
router.post("/", ah(async (req, res) => {
  const { fb_page_id, access_token, website, about, languages } = req.body || {};
  if (!fb_page_id || !access_token) {
    return res
      .status(400)
      .json({ error: "fb_page_id and access_token are required." });
  }

  let info;
  try {
    info = await getPageInfo(fb_page_id, access_token);
  } catch (e) {
    return res.status(400).json({
      error: `Facebook rejected this Page ID / token: ${e.message}`,
    });
  }

  const { rows } = await query(
    `INSERT INTO pages (name, fb_page_id, access_token, website, about, languages)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (fb_page_id) DO UPDATE
       SET name = EXCLUDED.name,
           access_token = EXCLUDED.access_token,
           website = COALESCE(EXCLUDED.website, pages.website),
           about = COALESCE(EXCLUDED.about, pages.about),
           languages = COALESCE(EXCLUDED.languages, pages.languages)
     RETURNING id, name, fb_page_id, website, about, languages, created_at`,
    [
      info.name || "Untitled Page",
      fb_page_id,
      encrypt(access_token),
      website || info.link || null,
      about || info.about || null,
      languages || "Sinhala + English",
    ]
  );
  res.status(201).json(rows[0]);
}));

// Update editable fields (website, about, languages) or refresh the token.
router.patch("/:id", ah(async (req, res) => {
  const { website, about, languages, access_token } = req.body || {};
  const fields = [];
  const vals = [];
  let i = 1;
  if (website !== undefined) { fields.push(`website = $${i++}`); vals.push(website); }
  if (about !== undefined) { fields.push(`about = $${i++}`); vals.push(about); }
  if (languages !== undefined) { fields.push(`languages = $${i++}`); vals.push(languages); }
  if (access_token) { fields.push(`access_token = $${i++}`); vals.push(encrypt(access_token)); }
  if (!fields.length) return res.status(400).json({ error: "Nothing to update." });
  vals.push(req.params.id);
  const { rows } = await query(
    `UPDATE pages SET ${fields.join(", ")} WHERE id = $${i}
     RETURNING id, name, fb_page_id, website, about, languages, created_at`,
    vals
  );
  if (!rows[0]) return res.status(404).json({ error: "Page not found." });
  res.json(rows[0]);
}));

// Remove a page (cascades to its posts + stats).
router.delete("/:id", ah(async (req, res) => {
  await query("DELETE FROM pages WHERE id = $1", [req.params.id]);
  res.json({ ok: true });
}));

export default router;

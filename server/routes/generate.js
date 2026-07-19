import { Router } from "express";
import { loadPage } from "./pages.js";
import { ah } from "../util.js";
import { generatePost, generateAdvice, POST_TYPES } from "../services/gemini.js";
import { query } from "../db.js";

const router = Router();

// List available post types for the UI.
router.get("/types", (_req, res) => {
  res.json(Object.entries(POST_TYPES).map(([id, v]) => ({ id, ...v })));
});

// Generate a bilingual post for a page. Does NOT publish or save.
// Returns { content, headline, type } — headline is a short English hook for
// the creative image.
router.post("/", ah(async (req, res) => {
  const { page_id, type = "promo", extra = "" } = req.body || {};
  const page = await loadPage(page_id);
  if (!page) return res.status(404).json({ error: "Page not found." });
  try {
    const { content, headline } = await generatePost(page, type, extra);
    res.json({ content, headline, type });
  } catch (e) {
    res.status(e.code === "NO_KEY" ? 400 : 502).json({ error: e.message });
  }
}));

// Media-manager advice based on recent post performance.
router.post("/advice", ah(async (req, res) => {
  const { page_id } = req.body || {};
  const page = await loadPage(page_id);
  if (!page) return res.status(404).json({ error: "Page not found." });

  const { rows } = await query(
    `SELECT p.type, p.content,
            COALESCE(s.likes,0) likes, COALESCE(s.comments,0) comments, COALESCE(s.shares,0) shares
       FROM posts p
       LEFT JOIN LATERAL (
         SELECT likes, comments, shares FROM post_stats
         WHERE post_id = p.id ORDER BY fetched_at DESC LIMIT 1
       ) s ON true
      WHERE p.page_id = $1 AND p.status = 'published'
      ORDER BY p.published_at DESC NULLS LAST
      LIMIT 12`,
    [page_id]
  );

  try {
    const advice = await generateAdvice(page, rows);
    res.json({ advice });
  } catch (e) {
    res.status(e.code === "NO_KEY" ? 400 : 502).json({ error: e.message });
  }
}));

export default router;

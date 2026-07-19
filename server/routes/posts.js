import { Router } from "express";
import { query } from "../db.js";
import { ah } from "../util.js";
import { loadPage } from "./pages.js";
import { publishPost, publishPhoto, getPostStats } from "../services/facebook.js";

const router = Router();

// Parse a base64 data URL ("data:image/png;base64,...") into bytes + mime.
function parseImage(dataUrl) {
  if (!dataUrl) return null;
  const m = /^data:(image\/[\w+.-]+);base64,(.+)$/s.exec(String(dataUrl));
  if (!m) return null;
  return { mime: m[1], buf: Buffer.from(m[2], "base64") };
}

// Columns returned to the client for a post (never the raw image bytes).
const POST_COLS = `p.id, p.page_id, p.type, p.content, p.status, p.scheduled_for,
  p.fb_post_id, p.error, p.published_at, p.created_at,
  (p.image IS NOT NULL) AS has_image`;

// List posts for a page, newest first, with their latest stats.
router.get("/", ah(async (req, res) => {
  const { page_id, status } = req.query;
  if (!page_id) return res.status(400).json({ error: "page_id is required." });
  const params = [page_id];
  let where = "p.page_id = $1";
  if (status) { params.push(status); where += ` AND p.status = $2`; }
  const { rows } = await query(
    `SELECT ${POST_COLS},
            COALESCE(s.likes,0) likes, COALESCE(s.comments,0) comments,
            COALESCE(s.shares,0) shares, s.reach, s.impressions
       FROM posts p
       LEFT JOIN LATERAL (
         SELECT * FROM post_stats WHERE post_id = p.id ORDER BY fetched_at DESC LIMIT 1
       ) s ON true
      WHERE ${where}
      ORDER BY COALESCE(p.published_at, p.scheduled_for, p.created_at) DESC`,
    params
  );
  res.json(rows);
}));

// Serve a stored creative image.
router.get("/:id/image", ah(async (req, res) => {
  const { rows } = await query("SELECT image, image_mime FROM posts WHERE id = $1", [req.params.id]);
  if (!rows[0] || !rows[0].image) return res.status(404).end();
  res.set("Content-Type", rows[0].image_mime || "image/png");
  res.set("Cache-Control", "public, max-age=86400");
  res.send(rows[0].image);
}));

// Save a draft OR schedule a post. status: 'draft' | 'scheduled'
// Optional `image` is a base64 data URL of a creative to attach.
router.post("/", ah(async (req, res) => {
  const { page_id, content, type, status = "draft", scheduled_for, image } = req.body || {};
  if (!page_id || !content)
    return res.status(400).json({ error: "page_id and content are required." });
  if (status === "scheduled" && !scheduled_for)
    return res.status(400).json({ error: "scheduled_for is required to schedule." });

  const img = parseImage(image);
  const { rows } = await query(
    `INSERT INTO posts (page_id, type, content, status, scheduled_for, image, image_mime)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING ${POST_COLS.replace(/p\./g, "")}`,
    [page_id, type || null, content, status, scheduled_for || null, img?.buf || null, img?.mime || null]
  );
  res.status(201).json(rows[0]);
}));

// Edit a stored draft/scheduled post.
router.patch("/:id", ah(async (req, res) => {
  const { content, type, status, scheduled_for } = req.body || {};
  const fields = [];
  const vals = [];
  let i = 1;
  if (content !== undefined) { fields.push(`content = $${i++}`); vals.push(content); }
  if (type !== undefined) { fields.push(`type = $${i++}`); vals.push(type); }
  if (status !== undefined) { fields.push(`status = $${i++}`); vals.push(status); }
  if (scheduled_for !== undefined) { fields.push(`scheduled_for = $${i++}`); vals.push(scheduled_for); }
  if (!fields.length) return res.status(400).json({ error: "Nothing to update." });
  vals.push(req.params.id);
  const { rows } = await query(
    `UPDATE posts SET ${fields.join(", ")} WHERE id = $${i} RETURNING *`,
    vals
  );
  if (!rows[0]) return res.status(404).json({ error: "Post not found." });
  res.json(rows[0]);
}));

// Publish a stored post to Facebook right now.
router.post("/:id/publish", ah(async (req, res) => {
  const { rows } = await query("SELECT * FROM posts WHERE id = $1", [req.params.id]);
  const post = rows[0];
  if (!post) return res.status(404).json({ error: "Post not found." });
  const page = await loadPage(post.page_id);
  if (!page) return res.status(404).json({ error: "Page not found." });

  try {
    // If the post has a creative image, publish it as a photo; otherwise text.
    const result = post.image
      ? await publishPhoto(page.fb_page_id, page.access_token, post.content, post.image)
      : await publishPost(page.fb_page_id, page.access_token, post.content);
    const { rows: upd } = await query(
      `UPDATE posts SET status='published', fb_post_id=$1, published_at=now(), error=NULL
       WHERE id=$2 RETURNING ${POST_COLS.replace(/p\./g, "")}`,
      [result.id, post.id]
    );
    // Seed an initial stats row.
    try {
      const stats = await getPostStats(result.id, page.access_token);
      await query(
        `INSERT INTO post_stats (post_id, likes, comments, shares, impressions, reach)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [post.id, stats.likes, stats.comments, stats.shares, stats.impressions, stats.reach]
      );
    } catch { /* stats can lag right after publishing */ }
    res.json(upd[0]);
  } catch (e) {
    await query(`UPDATE posts SET status='failed', error=$1 WHERE id=$2`, [
      e.message,
      post.id,
    ]);
    res.status(502).json({ error: e.message });
  }
}));

// Delete a post record (does not delete from Facebook).
router.delete("/:id", ah(async (req, res) => {
  await query("DELETE FROM posts WHERE id = $1", [req.params.id]);
  res.json({ ok: true });
}));

export default router;

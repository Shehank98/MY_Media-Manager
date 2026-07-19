import { Router } from "express";
import { query } from "../db.js";
import { loadPage } from "./pages.js";
import { publishPost, getPostStats } from "../services/facebook.js";

const router = Router();

// List posts for a page, newest first, with their latest stats.
router.get("/", async (req, res) => {
  const { page_id, status } = req.query;
  if (!page_id) return res.status(400).json({ error: "page_id is required." });
  const params = [page_id];
  let where = "p.page_id = $1";
  if (status) { params.push(status); where += ` AND p.status = $2`; }
  const { rows } = await query(
    `SELECT p.*,
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
});

// Save a draft OR schedule a post. status: 'draft' | 'scheduled'
router.post("/", async (req, res) => {
  const { page_id, content, type, status = "draft", scheduled_for } = req.body || {};
  if (!page_id || !content)
    return res.status(400).json({ error: "page_id and content are required." });
  if (status === "scheduled" && !scheduled_for)
    return res.status(400).json({ error: "scheduled_for is required to schedule." });

  const { rows } = await query(
    `INSERT INTO posts (page_id, type, content, status, scheduled_for)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [page_id, type || null, content, status, scheduled_for || null]
  );
  res.status(201).json(rows[0]);
});

// Edit a stored draft/scheduled post.
router.patch("/:id", async (req, res) => {
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
});

// Publish a stored post (or a fresh one) to Facebook right now.
router.post("/:id/publish", async (req, res) => {
  const { rows } = await query("SELECT * FROM posts WHERE id = $1", [req.params.id]);
  const post = rows[0];
  if (!post) return res.status(404).json({ error: "Post not found." });
  const page = await loadPage(post.page_id);
  if (!page) return res.status(404).json({ error: "Page not found." });

  try {
    const result = await publishPost(page.fb_page_id, page.access_token, post.content);
    const { rows: upd } = await query(
      `UPDATE posts SET status='published', fb_post_id=$1, published_at=now(), error=NULL
       WHERE id=$2 RETURNING *`,
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
});

// Delete a post record (does not delete from Facebook).
router.delete("/:id", async (req, res) => {
  await query("DELETE FROM posts WHERE id = $1", [req.params.id]);
  res.json({ ok: true });
});

export default router;

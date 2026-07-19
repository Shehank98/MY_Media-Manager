import { Router } from "express";
import { query } from "../db.js";
import { loadPage } from "./pages.js";
import { getPageInfo, getPostStats } from "../services/facebook.js";

const router = Router();

// Snapshot page + published-post stats from Facebook and store history.
router.post("/refresh", async (req, res) => {
  const { page_id } = req.body || {};
  const page = await loadPage(page_id);
  if (!page) return res.status(404).json({ error: "Page not found." });

  const out = { page: null, updatedPosts: 0, errors: [] };

  // Page-level stats
  try {
    const info = await getPageInfo(page.fb_page_id, page.access_token);
    await query(
      `INSERT INTO page_stats (page_id, fan_count, followers_count) VALUES ($1,$2,$3)`,
      [page.id, info.fan_count ?? null, info.followers_count ?? null]
    );
    out.page = { fan_count: info.fan_count, followers_count: info.followers_count };
  } catch (e) {
    out.errors.push(`page: ${e.message}`);
  }

  // Per-post stats for everything we've published
  const { rows: published } = await query(
    `SELECT id, fb_post_id FROM posts
      WHERE page_id = $1 AND status = 'published' AND fb_post_id IS NOT NULL`,
    [page.id]
  );
  for (const p of published) {
    try {
      const s = await getPostStats(p.fb_post_id, page.access_token);
      await query(
        `INSERT INTO post_stats (post_id, likes, comments, shares, impressions, reach)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [p.id, s.likes, s.comments, s.shares, s.impressions, s.reach]
      );
      out.updatedPosts++;
    } catch (e) {
      out.errors.push(`post ${p.id}: ${e.message}`);
    }
  }
  res.json(out);
});

// Summary for the dashboard: latest page stats + totals + trend.
router.get("/summary", async (req, res) => {
  const { page_id } = req.query;
  if (!page_id) return res.status(400).json({ error: "page_id is required." });

  const { rows: latest } = await query(
    `SELECT fan_count, followers_count, fetched_at FROM page_stats
      WHERE page_id = $1 ORDER BY fetched_at DESC LIMIT 1`,
    [page_id]
  );

  const { rows: history } = await query(
    `SELECT fan_count, followers_count, fetched_at FROM page_stats
      WHERE page_id = $1 ORDER BY fetched_at ASC LIMIT 60`,
    [page_id]
  );

  const { rows: totals } = await query(
    `SELECT
        COUNT(*) FILTER (WHERE status='published') AS published,
        COUNT(*) FILTER (WHERE status='scheduled') AS scheduled,
        COUNT(*) FILTER (WHERE status='draft') AS drafts
       FROM posts WHERE page_id = $1`,
    [page_id]
  );

  const { rows: engagement } = await query(
    `SELECT COALESCE(SUM(likes),0) likes, COALESCE(SUM(comments),0) comments,
            COALESCE(SUM(shares),0) shares
       FROM (
         SELECT DISTINCT ON (p.id) s.likes, s.comments, s.shares
           FROM posts p JOIN post_stats s ON s.post_id = p.id
          WHERE p.page_id = $1
          ORDER BY p.id, s.fetched_at DESC
       ) t`,
    [page_id]
  );

  res.json({
    page: latest[0] || null,
    history,
    counts: totals[0],
    engagement: engagement[0],
  });
});

export default router;

import cron from "node-cron";
import { query } from "../db.js";
import { decrypt } from "./crypto.js";
import { publishPost, publishPhoto, getPostStats, getPageInfo } from "./facebook.js";

// Publishes any scheduled post whose time has arrived, and periodically
// refreshes stats so the dashboard shows how reach grows over time.

async function publishDuePosts() {
  const { rows } = await query(
    `SELECT p.*, pg.fb_page_id, pg.access_token
       FROM posts p JOIN pages pg ON pg.id = p.page_id
      WHERE p.status = 'scheduled' AND p.scheduled_for <= now()
      ORDER BY p.scheduled_for ASC
      LIMIT 10`
  );
  for (const post of rows) {
    const token = decrypt(post.access_token);
    try {
      const result = post.image
        ? await publishPhoto(post.fb_page_id, token, post.content, post.image)
        : await publishPost(post.fb_page_id, token, post.content);
      await query(
        `UPDATE posts SET status='published', fb_post_id=$1, published_at=now(), error=NULL WHERE id=$2`,
        [result.id, post.id]
      );
      console.log(`📤 Auto-published post ${post.id} → ${result.id}`);
    } catch (e) {
      await query(`UPDATE posts SET status='failed', error=$1 WHERE id=$2`, [
        e.message,
        post.id,
      ]);
      console.warn(`⚠️  Failed to auto-publish post ${post.id}: ${e.message}`);
    }
  }
}

async function refreshAllStats() {
  const { rows: pages } = await query("SELECT * FROM pages");
  for (const page of pages) {
    const token = decrypt(page.access_token);
    try {
      const info = await getPageInfo(page.fb_page_id, token);
      await query(
        `INSERT INTO page_stats (page_id, fan_count, followers_count) VALUES ($1,$2,$3)`,
        [page.id, info.fan_count ?? null, info.followers_count ?? null]
      );
    } catch { /* skip page on error */ }

    const { rows: posts } = await query(
      `SELECT id, fb_post_id FROM posts
        WHERE page_id=$1 AND status='published' AND fb_post_id IS NOT NULL
        ORDER BY published_at DESC LIMIT 25`,
      [page.id]
    );
    for (const p of posts) {
      try {
        const s = await getPostStats(p.fb_post_id, token);
        await query(
          `INSERT INTO post_stats (post_id, likes, comments, shares, impressions, reach)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [p.id, s.likes, s.comments, s.shares, s.impressions, s.reach]
        );
      } catch { /* skip post on error */ }
    }
  }
}

export function startScheduler() {
  // Check for due scheduled posts every minute.
  cron.schedule("* * * * *", () => {
    publishDuePosts().catch((e) => console.warn("scheduler publish error:", e.message));
  });

  // Refresh all stats every 6 hours.
  cron.schedule("0 */6 * * *", () => {
    refreshAllStats().catch((e) => console.warn("scheduler stats error:", e.message));
  });

  console.log("⏰ Scheduler started (publishes due posts every minute, refreshes stats every 6h).");
}

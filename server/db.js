import pg from "pg";

const { Pool } = pg;

// Railway provides DATABASE_URL. Locally you can set it in .env
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn(
    "⚠️  DATABASE_URL is not set. Add a PostgreSQL plugin on Railway, or set DATABASE_URL in .env for local dev."
  );
}

export const pool = new Pool({
  connectionString,
  // Railway internal connections don't need SSL; external ones do.
  ssl:
    connectionString && connectionString.includes("railway")
      ? { rejectUnauthorized: false }
      : process.env.PGSSL === "true"
      ? { rejectUnauthorized: false }
      : undefined,
});

export async function query(text, params) {
  return pool.query(text, params);
}

// ── Schema bootstrap ──────────────────────────────────────────────
// Creates all tables on startup if they don't exist. Idempotent.
export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pages (
      id            SERIAL PRIMARY KEY,
      name          TEXT NOT NULL,
      fb_page_id    TEXT NOT NULL UNIQUE,
      access_token  TEXT NOT NULL,
      website       TEXT,
      about         TEXT,
      languages     TEXT DEFAULT 'Sinhala + English',
      created_at    TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS posts (
      id             SERIAL PRIMARY KEY,
      page_id        INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
      type           TEXT,
      content        TEXT NOT NULL,
      status         TEXT NOT NULL DEFAULT 'draft', -- draft | scheduled | published | failed
      scheduled_for  TIMESTAMPTZ,
      fb_post_id     TEXT,
      error          TEXT,
      published_at   TIMESTAMPTZ,
      created_at     TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS post_stats (
      id          SERIAL PRIMARY KEY,
      post_id     INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      likes       INTEGER DEFAULT 0,
      comments    INTEGER DEFAULT 0,
      shares      INTEGER DEFAULT 0,
      impressions INTEGER,
      reach       INTEGER,
      fetched_at  TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS page_stats (
      id               SERIAL PRIMARY KEY,
      page_id          INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
      fan_count        INTEGER,
      followers_count  INTEGER,
      fetched_at       TIMESTAMPTZ DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_posts_page ON posts(page_id);
    CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
    CREATE INDEX IF NOT EXISTS idx_post_stats_post ON post_stats(post_id);
    CREATE INDEX IF NOT EXISTS idx_page_stats_page ON page_stats(page_id);
  `);
  console.log("✅ Database schema ready.");
}

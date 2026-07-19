import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import { initDb } from "./db.js";
import { startScheduler } from "./services/scheduler.js";

import pagesRouter from "./routes/pages.js";
import generateRouter from "./routes/generate.js";
import postsRouter from "./routes/posts.js";
import analyticsRouter from "./routes/analytics.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Health check + config flags for the frontend.
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    dbConfigured: Boolean(process.env.DATABASE_URL),
  });
});

app.use("/api/pages", pagesRouter);
app.use("/api/generate", generateRouter);
app.use("/api/posts", postsRouter);
app.use("/api/analytics", analyticsRouter);

// Central error handler: any error thrown/rejected in a route lands here and
// returns clean JSON instead of hanging the request (which shows up as a 502).
app.use("/api", (err, req, res, _next) => {
  const msg = err?.message || "Server error";
  const dbDown =
    /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|getaddrinfo|does not support SSL|SSL connection|password authentication|database .* does not exist|no pg_hba|Connection terminated|self.signed/i.test(
      msg
    );
  if (dbDown) {
    console.error("DB error:", msg);
    return res.status(503).json({
      error:
        "Database not reachable. In Railway, add a PostgreSQL database and set DATABASE_URL (reference it as ${{Postgres.DATABASE_URL}}), then redeploy.",
    });
  }
  console.error("API error:", msg);
  res.status(500).json({ error: msg });
});

// Serve the built React frontend in production.
const clientDist = path.join(__dirname, "..", "client", "dist");
app.use(express.static(clientDist));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(clientDist, "index.html"), (err) => {
    if (err) {
      res
        .status(200)
        .send(
          "<h1>My Media Manager API is running.</h1><p>The web dashboard build was not found. Run <code>npm run build</code>.</p>"
        );
    }
  });
});

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await initDb();
  } catch (e) {
    console.error("❌ Database init failed:", e.message);
  }
  startScheduler();
  app.listen(PORT, () => {
    console.log(`🚀 My Media Manager running on port ${PORT}`);
  });
}

start();

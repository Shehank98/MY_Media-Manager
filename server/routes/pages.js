import { Router } from "express";
import { query } from "../db.js";
import { ah } from "../util.js";
import { encrypt, decrypt } from "../services/crypto.js";
import { getPageInfo, getLongLivedPageTokens, whoAmI } from "../services/facebook.js";
import { fetchWebsiteText } from "../services/website.js";
import { summarizeBusiness } from "../services/gemini.js";

const router = Router();

// Helper: load a page row with its decrypted token.
export async function loadPage(id) {
  const { rows } = await query("SELECT * FROM pages WHERE id = $1", [id]);
  if (!rows[0]) return null;
  const page = rows[0];
  page.access_token = decrypt(page.access_token);
  return page;
}

// Token helper: exchange a short-lived user token for never-expiring Page
// tokens. The App Secret is used transiently and never stored.
router.post("/token-tool", ah(async (req, res) => {
  const { app_id, app_secret, user_token } = req.body || {};
  if (!app_id || !app_secret || !user_token) {
    return res
      .status(400)
      .json({ error: "App ID, App Secret and the short-lived token are all required." });
  }
  try {
    const pages = await getLongLivedPageTokens(app_id.trim(), app_secret.trim(), user_token.trim());
    res.json({ pages });
  } catch (e) {
    res.status(424).json({ error: e.message });
  }
}));

// List all managed pages (tokens never returned to the client).
router.get("/", ah(async (_req, res) => {
  const { rows } = await query(
    "SELECT id, name, fb_page_id, website, about, contact, languages, created_at FROM pages ORDER BY created_at ASC"
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
     RETURNING id, name, fb_page_id, website, about, contact, languages, created_at`,
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
  const { website, about, contact, languages, access_token } = req.body || {};
  const fields = [];
  const vals = [];
  let i = 1;
  if (website !== undefined) { fields.push(`website = $${i++}`); vals.push(website); }
  if (about !== undefined) { fields.push(`about = $${i++}`); vals.push(about); }
  if (contact !== undefined) { fields.push(`contact = $${i++}`); vals.push(contact); }
  if (languages !== undefined) { fields.push(`languages = $${i++}`); vals.push(languages); }
  if (access_token) { fields.push(`access_token = $${i++}`); vals.push(encrypt(access_token)); }
  if (!fields.length) return res.status(400).json({ error: "Nothing to update." });
  vals.push(req.params.id);
  const { rows } = await query(
    `UPDATE pages SET ${fields.join(", ")} WHERE id = $${i}
     RETURNING id, name, fb_page_id, website, about, contact, languages, created_at`,
    vals
  );
  if (!rows[0]) return res.status(404).json({ error: "Page not found." });
  res.json(rows[0]);
}));

// Read the page's website, summarise the business with Gemini, and save it as
// the page's "about" so every generated post is grounded in it.
// Optionally accepts { website } in the body to set/override first.
router.post("/:id/learn", ah(async (req, res) => {
  const page = await loadPage(req.params.id);
  if (!page) return res.status(404).json({ error: "Page not found." });

  const website = (req.body?.website || page.website || "").trim();
  if (!website)
    return res.status(400).json({ error: "Set a website for this page first." });

  let fetched;
  try {
    fetched = await fetchWebsiteText(website);
  } catch (e) {
    return res.status(424).json({ error: e.message });
  }
  if (!fetched.text || fetched.text.length < 40) {
    return res.status(422).json({
      error:
        "Couldn't read enough text from the website (it may be JavaScript-only). You can paste your business summary manually instead.",
    });
  }

  let about;
  try {
    about = await summarizeBusiness({ url: fetched.url, text: fetched.text, pageName: page.name });
  } catch (e) {
    return res.status(e.code === "NO_KEY" ? 400 : 424).json({ error: e.message });
  }

  const { rows } = await query(
    `UPDATE pages SET about = $1, website = $2 WHERE id = $3
     RETURNING id, name, fb_page_id, website, about, contact, languages, created_at`,
    [about, website, page.id]
  );
  res.json(rows[0]);
}));

// Diagnose a page's saved token: is it valid, is it a Page token (not a User
// token), and can it read the page? Returns human-readable checks.
router.post("/:id/diagnose", ah(async (req, res) => {
  const page = await loadPage(req.params.id);
  if (!page) return res.status(404).json({ error: "Page not found." });

  const checks = [];
  let tokenType = "unknown";

  // 1. Who owns this token?
  try {
    const me = await whoAmI(page.access_token);
    if (String(me.id) === String(page.fb_page_id)) {
      tokenType = "page";
      checks.push({ ok: true, label: `Saved token is a Page token for "${me.name}". ✅` });
    } else {
      tokenType = "user";
      checks.push({
        ok: false,
        label: `Saved token belongs to "${me.name}" (a personal/User token), NOT the Page. Use “Get a never-expiring token” above to connect the Page token.`,
      });
    }
  } catch (e) {
    checks.push({ ok: false, label: `Token is invalid or expired: ${e.message}` });
  }

  // 2. Can it read the page?
  try {
    const pg = await getPageInfo(page.fb_page_id, page.access_token);
    checks.push({ ok: true, label: `Can read the page: ${pg.name} (${pg.fan_count ?? 0} likes). ✅` });
  } catch (e) {
    checks.push({ ok: false, label: `Cannot read the page: ${e.message}` });
  }

  const ok = checks.every((c) => c.ok);
  res.json({ ok, tokenType, checks });
}));

// Remove a page (cascades to its posts + stats).
router.delete("/:id", ah(async (req, res) => {
  await query("DELETE FROM pages WHERE id = $1", [req.params.id]);
  res.json({ ok: true });
}));

export default router;

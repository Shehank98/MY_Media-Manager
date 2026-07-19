import { Router } from "express";
import { ah } from "../util.js";
import { loadPage } from "./pages.js";
import { renderCreative } from "../services/creative.js";
import { POST_TYPES } from "../services/gemini.js";

const router = Router();

// Clean a website value into a short display target (e.g. "adspot.lk").
function target(page) {
  const w = (page.website || "").trim();
  if (!w) return "Message us";
  return w.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

// Generate a branded creative image and return it as a base64 PNG data URL.
router.post("/preview", ah(async (req, res) => {
  const { page_id, headline, type } = req.body || {};
  const page = await loadPage(page_id);
  if (!page) return res.status(404).json({ error: "Page not found." });
  if (!headline || !headline.trim())
    return res.status(400).json({ error: "A headline is required for the image." });

  const buffer = await renderCreative({
    brandName: page.name || "AdSpot",
    headline: headline.trim(),
    ctaLabel: page.website ? "Book now" : "Message us",
    ctaTarget: target(page),
    typeLabel: POST_TYPES[type]?.label || "",
    logoUrl: page.logo_url || null,
  });

  res.json({ image: `data:image/png;base64,${buffer.toString("base64")}` });
}));

export default router;

// Renders branded "creative" post graphics (poster-style images) with the
// newspaper navy+amber identity. Pure server-side, no browser, using a bundled
// font so text always renders — on Railway too.

import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.join(__dirname, "..", "assets", "fonts");

// Register the bundled fonts once at module load.
let fontsReady = false;
function ensureFonts() {
  if (fontsReady) return;
  const reg = (file, family) => {
    try {
      GlobalFonts.registerFromPath(path.join(FONT_DIR, file), family);
    } catch (e) {
      console.warn(`⚠️  Could not register font ${file}: ${e.message}`);
    }
  };
  reg("Poppins-ExtraBold.ttf", "PoppinsXBold");
  reg("Poppins-Bold.ttf", "PoppinsBold");
  reg("Poppins-SemiBold.ttf", "PoppinsSemi");
  reg("Poppins-Regular.ttf", "PoppinsReg");
  fontsReady = true;
}

const NAVY = "#1A1A2E";
const AMBER = "#F5A623";
const PAPER = "#F7F4EF";

// Word-wrap `text` to fit `maxWidth`, returning an array of lines.
function wrapLines(ctx, text, maxWidth) {
  const words = String(text).trim().split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Render a branded square creative.
 * @returns {Promise<Buffer>} PNG bytes
 */
export async function renderCreative({
  brandName = "AdSpot",
  headline = "Book Your Newspaper Ad Today",
  ctaLabel = "Book now",
  ctaTarget = "adspot.lk",
  typeLabel = "",
  logoUrl = null,
} = {}) {
  ensureFonts();
  const S = 1080;
  const canvas = createCanvas(S, S);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, S, S);

  // Subtle amber corner accents
  ctx.fillStyle = AMBER;
  ctx.fillRect(0, 0, S, 14);
  ctx.fillRect(0, S - 14, S, 14);

  const pad = 90;
  const contentW = S - pad * 2;

  // ── Masthead row ──
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = AMBER;
  ctx.font = "48px PoppinsXBold";
  ctx.textAlign = "left";
  ctx.fillText(brandName.toUpperCase(), pad, 150);

  if (typeLabel) {
    ctx.font = "24px PoppinsSemi";
    ctx.fillStyle = PAPER;
    ctx.textAlign = "right";
    ctx.fillText(typeLabel.toUpperCase(), S - pad, 148);
  }

  // Double rule under masthead (newspaper touch)
  ctx.strokeStyle = "#3A3A55";
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(pad, 178); ctx.lineTo(S - pad, 178); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(pad, 186); ctx.lineTo(S - pad, 186); ctx.stroke();

  // ── Headline (auto-fit) ──
  ctx.textAlign = "left";
  ctx.fillStyle = "#FFFFFF";
  let fontSize = 108;
  let lines = [];
  const maxHeadlineHeight = 560;
  while (fontSize >= 48) {
    ctx.font = `${fontSize}px PoppinsXBold`;
    lines = wrapLines(ctx, headline, contentW);
    const lineH = fontSize * 1.12;
    if (lines.length * lineH <= maxHeadlineHeight && lines.length <= 5) break;
    fontSize -= 6;
  }
  const lineH = fontSize * 1.12;
  const blockH = lines.length * lineH;
  let y = 300 + (maxHeadlineHeight - blockH) / 2 + fontSize;
  for (const l of lines) {
    ctx.fillText(l, pad, y);
    y += lineH;
  }

  // Amber underline accent below headline
  ctx.fillStyle = AMBER;
  ctx.fillRect(pad, Math.min(y + 6, 900), 120, 8);

  // ── CTA pill: [label]  ▸  [target] — arrow drawn as a triangle so it never
  // depends on a font glyph. ──
  ctx.font = "34px PoppinsBold";
  const labelW = ctx.measureText(ctaLabel).width;
  const targetW = ctx.measureText(ctaTarget).width;
  const arrowW = 24;
  const gap = 18;
  const innerW = labelW + gap + arrowW + gap + targetW;
  const pillW = innerW + 80;
  const pillH = 78;
  const pillX = pad;
  const pillY = S - pad - pillH + 20;
  const r = pillH / 2;
  ctx.fillStyle = AMBER;
  ctx.beginPath();
  ctx.moveTo(pillX + r, pillY);
  ctx.arcTo(pillX + pillW, pillY, pillX + pillW, pillY + pillH, r);
  ctx.arcTo(pillX + pillW, pillY + pillH, pillX, pillY + pillH, r);
  ctx.arcTo(pillX, pillY + pillH, pillX, pillY, r);
  ctx.arcTo(pillX, pillY, pillX + pillW, pillY, r);
  ctx.closePath();
  ctx.fill();

  const midY = pillY + pillH / 2;
  ctx.fillStyle = NAVY;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  let cx = pillX + 40;
  ctx.fillText(ctaLabel, cx, midY + 2);
  cx += labelW + gap;
  // triangle arrow
  ctx.beginPath();
  ctx.moveTo(cx, midY - 12);
  ctx.lineTo(cx + arrowW, midY);
  ctx.lineTo(cx, midY + 12);
  ctx.closePath();
  ctx.fill();
  cx += arrowW + gap;
  ctx.fillText(ctaTarget, cx, midY + 2);
  ctx.textBaseline = "alphabetic";

  // ── Optional logo (top-right), if provided ──
  if (logoUrl) {
    try {
      const img = await loadImage(logoUrl);
      const box = 96;
      const scale = Math.min(box / img.width, box / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, S - pad - w, 96, w, h);
    } catch {
      /* ignore logo failures — creative still renders */
    }
  }

  return canvas.toBuffer("image/png");
}

// Content generation using Google Gemini's free tier.
// Get a free key at https://aistudio.google.com/app/apikey and set GEMINI_API_KEY.

// Models are tried in order until one works. If GEMINI_MODEL is set, it's tried
// first. Using a "-latest" alias + concrete fallbacks means a single model being
// retired (as gemini-2.0-flash was) won't break the app.
const MODELS = [
  process.env.GEMINI_MODEL,
  "gemini-flash-latest",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
].filter(Boolean);

// Calls Gemini's generateContent, walking through MODELS. A "model not found /
// not supported" error moves on to the next model; any other error stops.
async function callGemini(key, prompt, generationConfig) {
  let lastErr;
  for (const model of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig,
      }),
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok && !data.error) {
      const text =
        data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
      if (!text.trim()) throw new Error("Gemini returned an empty response. Try again.");
      return text.trim();
    }

    const msg = data.error?.message || `Gemini error (HTTP ${res.status})`;
    lastErr = new Error(msg);
    // Only fall through to the next model when THIS model is unavailable.
    const modelGone =
      res.status === 404 ||
      /not found|not supported|no longer available|is not available|does not exist/i.test(msg);
    if (!modelGone) throw lastErr;
  }
  throw lastErr || new Error("No usable Gemini model.");
}

// Post types the media manager rotates through.
export const POST_TYPES = {
  promo: { label: "Promotion", desc: "Highlight the benefits of the service" },
  tip: { label: "Ad Tip", desc: "A helpful advertising tip for the audience" },
  howto: { label: "How It Works", desc: "Explain the booking / service process" },
  newspaper: { label: "Newspaper Feature", desc: "Feature a specific newspaper" },
  seasonal: { label: "Seasonal / Festival", desc: "Festival or seasonal content" },
  question: { label: "Engagement Post", desc: "A question to boost comments" },
};

function buildPrompt(page, typeId, extra) {
  const pt = POST_TYPES[typeId] || POST_TYPES.promo;
  const website = page.website || "";
  const langs = page.languages || "Sinhala + English";
  const about =
    page.about ||
    `${page.name} is a Sri Lankan business Facebook page.`;
  const contact = (page.contact || "").trim();

  return `You are the Facebook content manager for "${page.name}".

=== WHAT THIS BUSINESS IS (base every post on this — do not invent services) ===
${about}
${website ? `Website: ${website}` : ""}
${contact ? `Contact details:\n${contact}` : ""}
=== END BUSINESS INFO ===

Write ONE Facebook post of type: ${pt.label} — ${pt.desc}.
${extra ? `Extra context from the owner: ${extra}` : ""}

First output a headline for the post's image on ONE line, exactly like this:
HEADLINE: <a short punchy ENGLISH headline, max 7 words, no emoji, Title Case>

Then a blank line, then the COMPLETE post. The post must:
- Be accurate to the business info above — never mention services it doesn't offer.
- Be written in BOTH languages if the audience is bilingual (${langs}). Sinhala first, then English.
- Separate the two languages with this exact line: ═══════════════════
- Use 4-6 natural emojis and sound organic and human, not like a corporate ad.
- Include a question or relatable hook to encourage comments.
- Then finish with a clear closing block IN THIS ORDER:
    1. A call to action.${website ? `\n    2. The website: ${website}` : ""}${contact ? `\n    3. The contact details exactly as given above.` : ""}
    ${website || contact ? "4." : "2."} 5-7 relevant hashtags on the last line, mixing local and English terms (e.g. #AdSpotLK #NewspaperAds).

Return the full caption ready to publish. No preamble, no explanation, no markdown fences.`;
}

// Split the "HEADLINE: ..." first line out of the model's output.
function splitHeadline(raw) {
  const text = raw.trim();
  const m = text.match(/^\s*HEADLINE:\s*(.+?)\s*(?:\n|$)/i);
  if (!m) return { headline: "", content: text };
  const headline = m[1].replace(/^["'“”]|["'“”]$/g, "").trim();
  const content = text.slice(m.index + m[0].length).trim();
  return { headline, content: content || text };
}

const stripSite = (s) =>
  String(s).toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "").trim();

// Fallback headline derived from the post text, so the image headline is never
// empty even if the model forgets the HEADLINE line.
function deriveHeadline(content, page) {
  let text = content;
  const parts = content.split(/═{3,}/); // prefer the English section
  if (parts.length > 1) text = parts[parts.length - 1];
  text = text
    .replace(/https?:\S+/g, " ")
    .replace(/#\S+/g, " ")
    .replace(/[^\x00-\x7F]/g, " ") // drop Sinhala + emoji for a clean Latin headline
    .replace(/\s+/g, " ")
    .trim();
  const words = text.split(" ").filter(Boolean).slice(0, 7);
  let h = words.join(" ").replace(/[.,:;!?-]+$/, "");
  if (!h) h = page.name || "Book Your Ad Today";
  return h.replace(/^\w/, (c) => c.toUpperCase()).slice(0, 60);
}

// Insert `block` just before any trailing hashtag line (so hashtags stay last).
function insertBeforeHashtags(content, block) {
  const lines = content.split("\n");
  let i = lines.length - 1;
  while (i >= 0 && lines[i].trim() === "") i--;
  const isHashtagLine =
    i >= 0 && /#\w/.test(lines[i]) &&
    lines[i].trim().split(/\s+/).every((w) => w === "" || w.startsWith("#"));
  if (isHashtagLine) lines.splice(i, 0, block, "");
  else lines.push(block);
  return lines.join("\n");
}

// Guarantee the website + contact details are present in the caption. If the
// model already included them, do nothing; otherwise append them.
function ensureContactWebsite(content, page) {
  const website = (page.website || "").trim();
  const contact = (page.contact || "").trim();
  const missing = [];

  if (website) {
    const dom = stripSite(website);
    if (dom && !stripSite(content).includes(dom)) missing.push(`🌐 ${website}`);
  }
  if (contact) {
    const cDigits = contact.replace(/\D/g, "");
    const emails = contact.match(/[\w.+-]+@[\w.-]+/g) || [];
    const outDigits = content.replace(/\D/g, "");
    const present =
      (cDigits.length >= 7 && outDigits.includes(cDigits.slice(0, 9))) ||
      emails.some((e) => content.includes(e));
    if (!present) missing.push(contact);
  }

  if (!missing.length) return content;
  return insertBeforeHashtags(content, missing.join("\n"));
}

export async function generatePost(page, typeId, extra = "") {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const err = new Error(
      "GEMINI_API_KEY is not set. Get a free key at https://aistudio.google.com/app/apikey and add it to your environment."
    );
    err.code = "NO_KEY";
    throw err;
  }

  const prompt = buildPrompt(page, typeId, extra);
  const raw = await callGemini(key, prompt, { temperature: 0.9, maxOutputTokens: 1024 });
  const { headline, content } = splitHeadline(raw);
  return {
    // Never return an empty headline — auto-derive one if the model omitted it.
    headline: headline || deriveHeadline(content, page),
    // Guarantee website + contact are in every caption.
    content: ensureContactWebsite(content, page),
  };
}

// Summarise a business from its website text, for use as the page's "about"
// context that grounds every generated post.
export async function summarizeBusiness({ url, text, pageName }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const err = new Error("GEMINI_API_KEY is not set.");
    err.code = "NO_KEY";
    throw err;
  }
  const prompt = `Below is the text scraped from the website of a business (${url || "unknown URL"})${pageName ? ` whose Facebook page is "${pageName}"` : ""}.

Write a clear, factual profile of this business for its social media manager to use when writing posts. Cover, only using what's in the text:
- What the business does and its main service(s)
- Who the customers are
- Key selling points / how it works
- Any newspapers, publications, products, or packages mentioned
- Its tagline if any

Write 4-7 sentences of plain prose (no headings, no bullet symbols). Do not invent anything not supported by the text.

WEBSITE TEXT:
${String(text || "").slice(0, 7000)}`;

  return callGemini(key, prompt, { temperature: 0.3, maxOutputTokens: 600 });
}

// Media-manager advice: looks at recent post performance and suggests
// what to post next. Uses the same free Gemini key.
export async function generateAdvice(page, postsWithStats) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const err = new Error("GEMINI_API_KEY is not set.");
    err.code = "NO_KEY";
    throw err;
  }

  const summary = postsWithStats
    .slice(0, 12)
    .map(
      (p, i) =>
        `${i + 1}. [${p.type || "post"}] likes=${p.likes} comments=${p.comments} shares=${p.shares} :: ${(p.content || "").slice(0, 90).replace(/\n/g, " ")}`
    )
    .join("\n");

  const prompt = `You are a social media manager for the Facebook page "${page.name}" (audience: ${page.languages || "Sinhala + English"}).
Here are recent posts and how they performed:
${summary || "(no posts yet)"}

Give the owner short, practical advice as their media manager. Cover:
1. Which post types/topics performed best and why.
2. 3 concrete post ideas to try next (one line each).
3. Best posting habit (timing/frequency) for organic reach.

Be concise and friendly. Use simple English. Under 180 words.`;

  return callGemini(key, prompt, { temperature: 0.7, maxOutputTokens: 700 });
}

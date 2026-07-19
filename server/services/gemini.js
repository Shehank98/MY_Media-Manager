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

  return `You are the Facebook content manager for "${page.name}".

About the page/business:
${about}
${website ? `Website: ${website}` : ""}

Write ONE Facebook post of type: ${pt.label} — ${pt.desc}.
${extra ? `Extra context from the owner: ${extra}` : ""}

Rules:
- Write in BOTH languages if the audience is bilingual (${langs}). Put Sinhala first, then English.
- Separate the two languages with this exact line: ═══════════════════
- Keep it under 120 words total.
- Use 3-5 natural emojis.
${website ? `- End with a clear call to action pointing to: ${website}` : "- End with a clear call to action."}
- Add 5-7 relevant hashtags mixing local and English terms.
- Sound organic and human, not like a corporate ad.
- Include a question or relatable hook to encourage comments.

Return ONLY the post text. No preamble, no explanation, no markdown fences.`;
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
  return callGemini(key, prompt, { temperature: 0.9, maxOutputTokens: 1024 });
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

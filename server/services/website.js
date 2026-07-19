// Fetches a website and reduces it to plain text, so Gemini can summarise the
// business. Runs server-side (on Railway the open internet is reachable).

export async function fetchWebsiteText(rawUrl) {
  let url = String(rawUrl || "").trim();
  if (!url) throw new Error("No website set for this page.");
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let res;
  try {
    res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        // A normal browser UA — some hosts block unknown clients.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });
  } catch (e) {
    throw new Error(
      `Could not open ${url}: ${e.name === "AbortError" ? "timed out" : e.message}`
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `${url} blocked our reader (HTTP ${res.status}) — many sites block automated requests. Paste your business summary into the box manually instead.`
    );
  }
  if (!res.ok) throw new Error(`Website returned HTTP ${res.status} for ${url}.`);

  const html = await res.text();
  return { url, text: htmlToText(html) };
}

// Very small HTML → text reducer (no dependencies).
function htmlToText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

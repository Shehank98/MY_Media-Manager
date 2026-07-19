// Thin wrapper around the Facebook Graph API.
// All calls are server-side so page access tokens never reach the browser.

const GRAPH = "https://graph.facebook.com/v19.0";

async function graph(path, { method = "GET", token, body, params = {} } = {}) {
  const url = new URL(`${GRAPH}/${path}`);
  if (token) url.searchParams.set("access_token", token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const opts = { method };
  if (body) {
    opts.headers = { "Content-Type": "application/json" };
    opts.body = JSON.stringify({ ...body, access_token: token });
  }

  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (data.error) {
    const msg = data.error.message || "Facebook API error";
    const err = new Error(msg);
    err.fb = data.error;
    throw err;
  }
  if (!res.ok) {
    throw new Error(
      `Facebook request failed (HTTP ${res.status}). Check the Page ID and token.`
    );
  }
  return data;
}

// Verify a token + page and return the page's public info.
export async function getPageInfo(pageId, token) {
  return graph(pageId, {
    token,
    params: { fields: "name,fan_count,followers_count,link,about,category" },
  });
}

// Publish a text post to the page feed. Returns { id }.
export async function publishPost(pageId, token, message) {
  const result = await graph(`${pageId}/feed`, {
    method: "POST",
    token,
    body: { message },
  });
  // A successful publish always returns a post id. If it's missing, Facebook
  // returned an unexpected response — treat it as a failure rather than
  // silently marking the post as published.
  if (!result || !result.id) {
    throw new Error(
      "Facebook did not confirm the post (no post id returned). Check that the token is a valid Page token with pages_manage_posts."
    );
  }
  return result;
}

// Publish a PHOTO post to the page with a caption. `buffer` is PNG/JPEG bytes.
// Returns { id (photo id), post_id }. We use post_id for stats where available.
export async function publishPhoto(pageId, token, caption, buffer) {
  const form = new FormData();
  form.append("caption", caption ?? "");
  form.append("access_token", token);
  form.append("source", new Blob([buffer], { type: "image/png" }), "creative.png");

  const res = await fetch(`${GRAPH}/${pageId}/photos`, {
    method: "POST",
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (data.error) {
    const err = new Error(data.error.message || "Facebook photo upload failed");
    err.fb = data.error;
    throw err;
  }
  if (!res.ok || !(data.post_id || data.id)) {
    throw new Error(
      "Facebook did not confirm the photo post. Check the token has pages_manage_posts."
    );
  }
  // For photo posts, post_id is the feed story we can read stats from.
  return { id: data.post_id || data.id, photo_id: data.id };
}

// Recent posts with engagement counts.
export async function getPagePosts(pageId, token, limit = 15) {
  const data = await graph(`${pageId}/posts`, {
    token,
    params: {
      fields:
        "id,message,created_time,likes.summary(true),comments.summary(true),shares",
      limit,
    },
  });
  return data.data || [];
}

// Engagement + reach for a single post. Reach needs pages_read_engagement.
export async function getPostStats(fbPostId, token) {
  const data = await graph(fbPostId, {
    token,
    params: {
      fields:
        "likes.summary(true),comments.summary(true),shares",
    },
  });
  const stats = {
    likes: data.likes?.summary?.total_count ?? 0,
    comments: data.comments?.summary?.total_count ?? 0,
    shares: data.shares?.count ?? 0,
    impressions: null,
    reach: null,
  };

  // Reach/impressions come from a separate insights edge and may be
  // unavailable on some tokens/pages — fail soft.
  try {
    const ins = await graph(`${fbPostId}/insights`, {
      token,
      params: {
        metric: "post_impressions,post_impressions_unique",
      },
    });
    for (const m of ins.data || []) {
      const val = m.values?.[0]?.value;
      if (m.name === "post_impressions") stats.impressions = val ?? null;
      if (m.name === "post_impressions_unique") stats.reach = val ?? null;
    }
  } catch {
    // insights not available — keep nulls
  }
  return stats;
}

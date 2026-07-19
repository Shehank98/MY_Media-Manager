// Tiny fetch wrapper for the backend API.
const BASE = "/api";

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  health: () => req("/health"),

  // Pages
  listPages: () => req("/pages"),
  addPage: (body) => req("/pages", { method: "POST", body }),
  updatePage: (id, body) => req(`/pages/${id}`, { method: "PATCH", body }),
  deletePage: (id) => req(`/pages/${id}`, { method: "DELETE" }),

  // Generation
  postTypes: () => req("/generate/types"),
  generate: (body) => req("/generate", { method: "POST", body }),
  advice: (page_id) => req("/generate/advice", { method: "POST", body: { page_id } }),
  creativePreview: (body) => req("/creative/preview", { method: "POST", body }),

  // Posts
  listPosts: (page_id, status) =>
    req(`/posts?page_id=${page_id}${status ? `&status=${status}` : ""}`),
  savePost: (body) => req("/posts", { method: "POST", body }),
  updatePost: (id, body) => req(`/posts/${id}`, { method: "PATCH", body }),
  publishPost: (id) => req(`/posts/${id}/publish`, { method: "POST" }),
  deletePost: (id) => req(`/posts/${id}`, { method: "DELETE" }),

  // Analytics
  refreshAnalytics: (page_id) =>
    req("/analytics/refresh", { method: "POST", body: { page_id } }),
  summary: (page_id) => req(`/analytics/summary?page_id=${page_id}`),
};

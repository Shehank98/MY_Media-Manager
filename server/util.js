// Wrap an async Express handler so rejected promises are forwarded to the
// error middleware instead of hanging the request (which shows up as a 502).
export const ah = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// fetch() with a hard timeout, so a slow/hanging upstream (Facebook, Gemini, a
// website) can never leave the request open long enough to become a real 502.
export async function fetchWithTimeout(url, opts = {}, ms = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } catch (e) {
    if (e.name === "AbortError") throw new Error(`Request timed out after ${ms / 1000}s.`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

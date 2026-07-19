// Wrap an async Express handler so rejected promises are forwarded to the
// error middleware instead of hanging the request (which shows up as a 502).
export const ah = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

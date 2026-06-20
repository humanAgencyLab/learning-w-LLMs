const { createProxyMiddleware } = require('http-proxy-middleware');

/**
 * CRA dev-proxy configuration.
 *
 * Phase F rewrites this because the old `onError` message
 * ("Proxy error: Backend unreachable. Is the server running on port 5001?")
 * fired on every proxy socket failure — including Groq-backed agent routes
 * that just took too long. That produced a false "backend is down" banner
 * while the backend was in fact up. The real fix (a Groq timeout that
 * degrades gracefully to `{ degraded: true }` at the API layer) lives in
 * `backend/agents/framework/baseAgent.js` + `routes/analyticsRoutes.js`.
 *
 * This file now:
 *   1. Sets an explicit `proxyTimeout: 20000` so the dev-proxy fails fast
 *      instead of waiting ~120 s for a wedged upstream. 20 s is above our
 *      15 s agent timeout + a few seconds of handler + Mongo overhead.
 *   2. Distinguishes `ECONNREFUSED` (backend truly down) from a mid-request
 *      socket error (ETIMEDOUT / ECONNRESET / etc.) — the latter almost
 *      always means the handler is slow, not that the server crashed.
 *   3. Logs `err.code` + `req.method` + `req.url` so we can tell at a glance
 *      which route is timing out when it happens.
 */
module.exports = function (app) {
  const target = process.env.REACT_APP_PROXY_TARGET || 'http://localhost:5001';
  app.use(
    '/v1',
    createProxyMiddleware({
      target,
      changeOrigin: true,
      secure: false,
      // Hard ceiling on each request. Must be ≥ the agent timeout (15 s)
      // plus handler / Mongo overhead, but short enough that a hung backend
      // doesn't eat an entire browser request slot.
      proxyTimeout: 20000,
      onError(err, req, res) {
        const code = err?.code || 'UNKNOWN';
        const method = req?.method || '?';
        const url = req?.url || '?';
        console.error('[proxy.error]', { code, method, url, msg: err?.message });

        // Happens when nothing is listening on the target port. This is
        // the only case where we want the "is the backend running?" hint —
        // in every other case the backend is up and the handler or Groq
        // is just slow.
        const isTrulyDown = code === 'ECONNREFUSED' || code === 'ENOTFOUND';

        const payload = isTrulyDown
          ? {
              error: 'Backend unreachable',
              hint: 'Is the server running on port 5001?',
              code,
            }
          : {
              error: 'Request to backend interrupted',
              hint: 'This often means an AI call timed out. The server is likely still running — try again in a moment.',
              code,
            };

        try {
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
          }
          res.end(JSON.stringify(payload));
        } catch {
          /* socket already closed — nothing to do */
        }
      },
    })
  );
};

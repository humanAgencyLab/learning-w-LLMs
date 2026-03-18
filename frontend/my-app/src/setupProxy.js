const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  const target = process.env.REACT_APP_PROXY_TARGET || 'http://localhost:5001';
  app.use(
    '/v1',
    createProxyMiddleware({
      target,
      changeOrigin: true,
      secure: false,
      onError(err, req, res) {
        console.error('Proxy error:', err.message);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Proxy error: Backend unreachable. Is the server running on port 5001?' }));
      },
    })
  );
};

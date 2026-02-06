/**
 * Middleware to require admin API key for admin-only routes.
 * Expects header: x-admin-key: <ADMIN_API_KEY>
 */
function requireAdminKey(req, res, next) {
  const key = req.headers['x-admin-key'];
  const expected = process.env.ADMIN_API_KEY;

  if (!expected) {
    return res.status(503).json({
      success: false,
      error: 'Admin export is not configured (ADMIN_API_KEY not set)',
      code: 'ADMIN_NOT_CONFIGURED'
    });
  }

  if (!key || key !== expected) {
    return res.status(403).json({
      success: false,
      error: 'Invalid or missing admin key',
      code: 'ADMIN_FORBIDDEN'
    });
  }

  next();
}

module.exports = { requireAdminKey };

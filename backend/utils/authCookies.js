const { REFRESH_COOKIE_MAX_AGE } = require('./jwt');
function refreshCookieOptions() {
  const production = process.env.NODE_ENV === 'production';
  return { httpOnly: true, secure: production, sameSite: production ? 'none' : 'lax', path: '/' };
}
function setRefreshCookie(res, token) {
  res.cookie('refreshToken', token, { ...refreshCookieOptions(), maxAge: REFRESH_COOKIE_MAX_AGE });
}
function clearRefreshCookie(res) { res.clearCookie('refreshToken', refreshCookieOptions()); }
module.exports = { setRefreshCookie, clearRefreshCookie };

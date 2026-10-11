const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (typeof JWT_SECRET !== 'string' || !JWT_SECRET.trim() ||
    Buffer.byteLength(JWT_SECRET) < 32 || /your[-_ ]|change[-_ ]?in[-_ ]?production/i.test(JWT_SECRET)) {
  throw new Error('JWT_SECRET must be explicitly configured with at least 32 bytes and must not be a placeholder');
}

function expirationSeconds(value, label) {
  const match = /^(\d+)(s|m|h|d)$/.exec(value);
  const seconds = match && Number(match[1]) * ({ s: 1, m: 60, h: 3600, d: 86400 })[match[2]];
  if (!Number.isSafeInteger(seconds) || seconds <= 0) throw new Error(`${label} must be a positive duration with s, m, h, or d units`);
  return seconds;
}
const accessSeconds = expirationSeconds(process.env.JWT_ACCESS_EXPIRES_IN || '15m', 'JWT_ACCESS_EXPIRES_IN');
const refreshSeconds = expirationSeconds(process.env.JWT_REFRESH_EXPIRES_IN || '7d', 'JWT_REFRESH_EXPIRES_IN');
const REFRESH_COOKIE_MAX_AGE = refreshSeconds * 1000;

function generateToken(payload, type, expiresIn) {
  if (!Number.isSafeInteger(payload.authVersion) || payload.authVersion < 0) throw new Error('Authentication version is required');
  return jwt.sign({ userId: payload.userId, username: payload.username, authVersion: payload.authVersion, type }, JWT_SECRET, {
    algorithm: 'HS256', expiresIn, issuer: 'learning-w-llms', audience: 'learning-w-llms-client',
  });
}
const generateAccessToken = payload => generateToken(payload, 'access', accessSeconds);
const generateRefreshToken = payload => generateToken(payload, 'refresh', refreshSeconds);
function verifyToken(token, expectedType = 'access') {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'], issuer: 'learning-w-llms', audience: 'learning-w-llms-client',
    });
    if (decoded.type !== expectedType || !Number.isSafeInteger(decoded.authVersion) || decoded.authVersion < 0 ||
        typeof decoded.userId !== 'string' || !/^[a-f0-9]{24}$/i.test(decoded.userId)) {
      throw new Error('Invalid token');
    }
    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') throw new Error('Token has expired');
    if (error.name === 'JsonWebTokenError') throw new Error('Invalid token');
    throw error;
  }
}
const decodeToken = token => jwt.decode(token);
module.exports = { generateAccessToken, generateRefreshToken, verifyToken, decodeToken, REFRESH_COOKIE_MAX_AGE };

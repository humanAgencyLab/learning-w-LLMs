const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'your-secret-key-change-in-production') {
  console.warn('⚠️  WARNING: Using default JWT_SECRET. Set JWT_SECRET in .env for production!');
}

/**
 * Generate an access token (short-lived)
 * @param {Object} payload - Token payload (typically { userId, email })
 * @returns {string} JWT access token
 */
function generateAccessToken(payload) {
  return jwt.sign(
    {
      userId: payload.userId,
      email: payload.email,
      type: 'access'
    },
    JWT_SECRET,
    {
      expiresIn: JWT_ACCESS_EXPIRES_IN,
      issuer: 'learning-w-llms',
      audience: 'learning-w-llms-client'
    }
  );
}

/**
 * Generate a refresh token (long-lived)
 * @param {Object} payload - Token payload (typically { userId, email })
 * @returns {string} JWT refresh token
 */
function generateRefreshToken(payload) {
  return jwt.sign(
    {
      userId: payload.userId,
      email: payload.email,
      type: 'refresh'
    },
    JWT_SECRET,
    {
      expiresIn: JWT_REFRESH_EXPIRES_IN,
      issuer: 'learning-w-llms',
      audience: 'learning-w-llms-client'
    }
  );
}

/**
 * Verify a JWT token
 * @param {string} token - JWT token to verify
 * @param {string} expectedType - Expected token type ('access' or 'refresh')
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is invalid or expired
 */
function verifyToken(token, expectedType = 'access') {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'learning-w-llms',
      audience: 'learning-w-llms-client'
    });
    
    if (decoded.type !== expectedType) {
      throw new Error(`Invalid token type. Expected ${expectedType}, got ${decoded.type}`);
    }
    
    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Token has expired');
    } else if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid token');
    } else {
      throw error;
    }
  }
}

/**
 * Decode a JWT token without verification (for debugging)
 * @param {string} token - JWT token to decode
 * @returns {Object} Decoded token payload (not verified)
 */
function decodeToken(token) {
  return jwt.decode(token);
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  decodeToken
};










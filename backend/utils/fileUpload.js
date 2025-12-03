const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configuration
const AVATAR_UPLOAD_DIR = process.env.AVATAR_UPLOAD_DIR || './uploads/avatars';
const MAX_FILE_SIZE = parseInt(process.env.MAX_AVATAR_SIZE || '5242880', 10); // 5MB default
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

// Ensure upload directory exists
if (!fs.existsSync(AVATAR_UPLOAD_DIR)) {
  fs.mkdirSync(AVATAR_UPLOAD_DIR, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, AVATAR_UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    // Generate unique filename: userId_timestamp.extension
    const userId = req.user?.id || 'anonymous';
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const filename = `${userId}_${timestamp}${ext}`;
    cb(null, filename);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`), false);
  }
};

// Create multer instance
const upload = multer({
  storage: storage,
  limits: {
    fileSize: MAX_FILE_SIZE
  },
  fileFilter: fileFilter
});

/**
 * Middleware for single avatar upload
 */
const uploadAvatar = upload.single('avatar');

/**
 * Get the URL/path for an avatar file
 * @param {string} filename - Filename of the avatar
 * @returns {string} URL path to the avatar
 */
function getAvatarUrl(filename) {
  if (!filename) {
    return null;
  }
  // Return relative path that can be served as static file
  return `/uploads/avatars/${filename}`;
}

/**
 * Delete an avatar file
 * @param {string} filename - Filename of the avatar to delete
 * @returns {Promise<void>}
 */
async function deleteAvatarFile(filename) {
  if (!filename) {
    return;
  }
  
  const filePath = path.join(AVATAR_UPLOAD_DIR, filename);
  
  return new Promise((resolve, reject) => {
    fs.unlink(filePath, (err) => {
      if (err && err.code !== 'ENOENT') {
        // Ignore file not found errors
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Extract filename from avatar URL
 * @param {string} avatarUrl - Avatar URL (e.g., /uploads/avatars/user123_1234567890.jpg)
 * @returns {string|null} Filename or null
 */
function extractFilenameFromUrl(avatarUrl) {
  if (!avatarUrl) {
    return null;
  }
  
  // Handle both relative and absolute paths
  const parts = avatarUrl.split('/');
  return parts[parts.length - 1] || null;
}

module.exports = {
  uploadAvatar,
  getAvatarUrl,
  deleteAvatarFile,
  extractFilenameFromUrl,
  AVATAR_UPLOAD_DIR
};










const fs = require('fs').promises;
const path = require('path');

/**
 * Extract plain text from supported file types.
 * @param {string} filePath - absolute path on disk
 * @param {string} mimeType
 * @returns {Promise<{ text: string, wordCount: number, pageCount: number }>}
 */
async function extractTextFromFile(filePath, mimeType) {
  const ext = path.extname(filePath).toLowerCase();
  let text = '';
  let pageCount = 0;

  if (mimeType === 'text/plain' || ext === '.txt' || ext === '.md' || ext === '.csv') {
    text = await fs.readFile(filePath, 'utf8');
  } else if (mimeType === 'application/pdf' || ext === '.pdf') {
    try {
      const pdfParse = require('pdf-parse');
      const buf = await fs.readFile(filePath);
      const data = await pdfParse(buf);
      text = data.text || '';
      pageCount = data.numpages || 0;
    } catch (e) {
      if (e.code === 'MODULE_NOT_FOUND') {
        text = '[PDF extraction unavailable: install pdf-parse]';
      } else {
        throw e;
      }
    }
  } else {
    text = `[No text extractor for ${mimeType}; store as attachment only.]`;
  }

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  return { text: text.trim(), wordCount, pageCount };
}

module.exports = { extractTextFromFile };

const PDFDocument = require('pdfkit');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

const CERTIFICATES_DIR = path.join(__dirname, '../uploads/certificates');

// Ensure certificates directory exists
async function ensureCertificatesDir() {
  try {
    await fsPromises.mkdir(CERTIFICATES_DIR, { recursive: true });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to create certificates directory');
    throw error;
  }
}

/**
 * Generate a PDF certificate for course completion
 * @param {Object} options - Certificate options
 * @param {string} options.userName - User's name
 * @param {string} options.topic - Course topic
 * @param {Date} options.issuedAt - Issue date
 * @returns {Promise<{filePath: string, certificateId: string}>}
 */
async function generateCertificatePDF({ userName, topic, issuedAt = new Date() }) {
  await ensureCertificatesDir();
  
  const certificateId = uuidv4();
  const fileName = `certificate_${certificateId}.pdf`;
  const filePath = path.join(CERTIFICATES_DIR, fileName);
  
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        layout: 'landscape',
        margins: { top: 0, bottom: 0, left: 0, right: 0 }
      });
      
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);
      
      // Light blue background (outside borders)
      doc.rect(0, 0, doc.page.width, doc.page.height)
         .fillColor('#e0f2fe')
         .fill();
      
      // Outer dark blue border (thick)
      doc.strokeColor('#1e40af')
         .lineWidth(25)
         .rect(30, 30, doc.page.width - 60, doc.page.height - 60)
         .stroke();
      
      // White content area
      const contentX = 80;
      const contentY = 80;
      const contentWidth = doc.page.width - 160;
      const contentHeight = doc.page.height - 160;
      
      doc.rect(contentX, contentY, contentWidth, contentHeight)
         .fillColor('#ffffff')
         .fill();
      
      // Inner dark blue border
      doc.strokeColor('#1e40af')
         .lineWidth(3)
         .rect(contentX, contentY, contentWidth, contentHeight)
         .stroke();
      
      // Calculate center X position for content area
      const centerXPos = contentX + contentWidth / 2;
      const maxTextWidth = contentWidth - 80; // Leave 40px margin on each side
      
      // Helper function to center text
      const centerText = (text, fontSize, font, y, color) => {
        doc.fillColor(color)
           .fontSize(fontSize)
           .font(font);
        const textWidth = doc.widthOfString(text);
        const x = centerXPos - textWidth / 2;
        doc.text(text, x, y);
        return { x, width: textWidth };
      };
      
      // Title - "CERTIFICATE OF COMPLETION"
      centerText('CERTIFICATE OF COMPLETION', 42, 'Helvetica-Bold', contentY + 60, '#1e40af');
      
      // Subtitle - "This is to certify that"
      centerText('This is to certify that', 18, 'Helvetica', contentY + 140, '#475569');
      
      // User name (with decorative plus sign)
      const nameY = contentY + 200;
      const plusSize = 16;
      const plusColor = '#cbd5e1';
      
      // Calculate name width first to position plus signs correctly
      doc.fillColor('#1e40af')
         .fontSize(38)
         .font('Helvetica-Bold');
      const nameWidth = doc.widthOfString(userName);
      const nameStartX = centerXPos - nameWidth / 2;
      
      // Left decorative plus sign (positioned relative to name)
      doc.fillColor(plusColor)
         .fontSize(plusSize)
         .font('Helvetica')
         .text('+', nameStartX - 30, nameY + 5);
      
      // Right decorative plus sign
      doc.text('+', nameStartX + nameWidth + 10, nameY + 5);
      
      // User name (bold, dark blue) - centered
      doc.fillColor('#1e40af')
         .fontSize(38)
         .font('Helvetica-Bold')
         .text(userName, nameStartX, nameY);
      
      // Course description - "has successfully completed the course"
      centerText('has successfully completed the course', 18, 'Helvetica', contentY + 280, '#475569');
      
      // Topic (purple color, bold) - centered
      centerText(topic, 32, 'Helvetica-Bold', contentY + 330, '#9333ea');
      
      // Date
      const dateStr = issuedAt.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      const dateText = `Issued on ${dateStr}`;
      centerText(dateText, 16, 'Helvetica', contentY + 400, '#475569');
      
      // Certificate ID (small, bottom) - centered
      const certIdText = `Certificate ID: ${certificateId}`;
      centerText(certIdText, 10, 'Helvetica', contentY + contentHeight - 50, '#94a3b8');
      
      // Decorative plus signs at corners
      const cornerPlusSize = 20;
      const cornerPlusColor = '#cbd5e1';
      
      // Top left corner plus
      doc.fillColor(cornerPlusColor)
         .fontSize(cornerPlusSize)
         .text('+', {
           x: contentX + 30,
           y: contentY + 30
         });
      
      // Top right corner plus
      doc.text('+', {
        x: contentX + contentWidth - 50,
        y: contentY + 30
      });
      
      // Bottom left corner plus
      doc.text('+', {
        x: contentX + 30,
        y: contentY + contentHeight - 50
      });
      
      // Bottom right corner plus
      doc.text('+', {
        x: contentX + contentWidth - 50,
        y: contentY + contentHeight - 50
      });
      
      doc.end();
      
      stream.on('finish', () => {
        logger.info({ 
          certificateId, 
          filePath, 
          userName, 
          topic 
        }, 'Certificate PDF generated successfully');
        resolve({ filePath, certificateId });
      });
      
      stream.on('error', (error) => {
        logger.error({ error: error.message, certificateId }, 'Failed to write certificate PDF');
        reject(error);
      });
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to generate certificate PDF');
      reject(error);
    }
  });
}

/**
 * Get certificate file path
 * @param {string} certificateId - Certificate ID
 * @returns {Promise<string>}
 */
async function getCertificatePath(certificateId) {
  const fileName = `certificate_${certificateId}.pdf`;
  const filePath = path.join(CERTIFICATES_DIR, fileName);
  
  try {
    await fsPromises.access(filePath);
    return filePath;
  } catch (error) {
    logger.error({ certificateId, error: error.message }, 'Certificate file not found');
    throw new Error('Certificate not found');
  }
}

module.exports = {
  generateCertificatePDF,
  getCertificatePath
};


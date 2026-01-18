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
      const maxTextWidth = contentWidth - 120; // Leave 60px margin on each side for spacing
      
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
      
      // Title - "CERTIFICATE OF COMPLETION" - moved up with font size 35
      centerText('CERTIFICATE OF COMPLETION', 35, 'Helvetica-Bold', contentY + 70, '#1e40af');
      
      // Subtitle - "This is to certify that"
      // Equal spacing: 50pt between each line
      centerText('This is to certify that', 18, 'Helvetica', contentY + 120, '#475569');
      
      // User name - font size 30 (50pt gap from previous line)
      const nameY = contentY + 160;
      const nameFontSize = 30;
      
      // User name (bold, dark blue) - centered
      doc.fillColor('#1e40af')
         .fontSize(nameFontSize)
         .font('Helvetica-Bold');
      const nameWidth = doc.widthOfString(userName);
      const nameStartX = centerXPos - nameWidth / 2;
      doc.text(userName, nameStartX, nameY);
      
      // Course description - "has successfully completed the course" (50pt gap from name)
      centerText('has successfully completed the course', 18, 'Helvetica', contentY + 210, '#475569');
      
      // Topic (purple color, bold) - font size 28 (50pt gap from previous line)
      centerText(topic, 28, 'Helvetica-Bold', contentY + 260, '#9333ea');
      
      // Bottom section: Provided by (left), Logo (center), Date (right) - three columns
      // Positioned with enough space below the course name to avoid overlap
      // Course name is at contentY + 280 with 28pt font (~40pt height), logo is 60pt tall
      // So we need: 280 + 40 (course name) + 50 (gap) = 370
      const bottomSectionY = contentY + 370;
      const sectionWidth = contentWidth / 3;
      const leftSectionX = contentX;
      const centerSectionX = contentX + sectionWidth;
      const rightSectionX = contentX + (sectionWidth * 2);
      
      // Left section - "Provided by Study Assist"
      doc.fillColor('#475569')
         .fontSize(12)
         .font('Helvetica')
         .text('Provided by', leftSectionX + 30, bottomSectionY, {
           width: sectionWidth - 60,
           align: 'left'
         });
      doc.fillColor('#1e40af')
         .fontSize(20)
         .font('Helvetica-Bold')
         .text('Study Assist', leftSectionX + 30, bottomSectionY + 18, {
           width: sectionWidth - 60,
           align: 'left'
         });
      
      // Center section - Logo (PDFKit doesn't support SVG, so use PNG)
      // Try multiple possible logo paths - prioritize backend assets (works in Docker),
      // then fall back to frontend paths (works in local development)
      const possibleLogoPaths = [
        path.join(__dirname, '../assets/logo.png'), // Backend assets (works in Docker)
        path.join(__dirname, '../../frontend/my-app/public/logo.png'), // Local dev fallback
        path.join(__dirname, '../../frontend/my-app/build/logo.png'), // Local dev fallback
      ];
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/825ca111-d219-4473-9ac8-99c04bfe67f7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'certificateService.js:147',message:'Logo path resolution debug',data:{__dirname,possibleLogoPaths,cwd:process.cwd()},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,B'})}).catch(()=>{});
      // #endregion
      
      let logoLoaded = false;
      for (const logoPath of possibleLogoPaths) {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/825ca111-d219-4473-9ac8-99c04bfe67f7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'certificateService.js:152',message:'Checking logo path',data:{logoPath,exists:fs.existsSync(logoPath)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,B,C'})}).catch(()=>{});
        // #endregion
        try {
          if (fs.existsSync(logoPath)) {
            const logoSize = 60;
            const logoX = centerSectionX + sectionWidth/2 - logoSize/2;
            const logoY = bottomSectionY;
            doc.image(logoPath, logoX, logoY, { 
              width: logoSize, 
              height: logoSize,
              fit: [logoSize, logoSize]
            });
            logoLoaded = true;
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/825ca111-d219-4473-9ac8-99c04bfe67f7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'certificateService.js:168',message:'Logo LOADED successfully',data:{logoPath,logoLoaded:true},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,B'})}).catch(()=>{});
            // #endregion
            logger.info({ logoPath }, 'Logo loaded successfully for certificate');
            break;
          }
        } catch (logoError) {
          // Log error but continue to next path
          logger.warn({ error: logoError.message, logoPath }, 'Failed to load logo, trying next path');
          continue;
        }
      }
      
      // Fallback to text logo if image not found
      if (!logoLoaded) {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/825ca111-d219-4473-9ac8-99c04bfe67f7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'certificateService.js:178',message:'Logo NOT loaded - using fallback SA text',data:{logoLoaded,possibleLogoPaths},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,B,C,D'})}).catch(()=>{});
        // #endregion
        logger.warn('No logo image found, using text fallback');
        const logoText = 'SA';
        doc.fillColor('#1e40af')
           .fontSize(42)
           .font('Helvetica-Bold')
           .text(logoText, centerSectionX + sectionWidth/2, bottomSectionY + 10, {
             width: 60,
             align: 'center'
           });
      }
      
      // Right section - Date
      const dateStr = issuedAt.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      doc.fillColor('#475569')
         .fontSize(12)
         .font('Helvetica')
         .text('Date', rightSectionX + 30, bottomSectionY, {
           width: sectionWidth - 60,
           align: 'right'
         });
      doc.fillColor('#475569')
         .fontSize(14)
         .font('Helvetica')
         .text(dateStr, rightSectionX + 30, bottomSectionY + 18, {
           width: sectionWidth - 60,
           align: 'right'
         });
      
      // Certificate ID - centered below the three sections, within content area
      // Position it properly below the logo and text sections with significant spacing
      // Logo is 60pt tall, "Provided by"/"Date" text extends to ~bottomSectionY + 38
      // Adding much more space to ensure no overlap
      const certIdText = `Certificate ID: ${certificateId}`;
      const logoBottom = bottomSectionY + 60; // Logo ends here (60pt tall)
      const textBottom = bottomSectionY + 38; // Text sections end here (18pt spacing + 20pt font for "Study Assist")
      const bottomSectionEnd = Math.max(logoBottom, textBottom); // Use the lower point
      const certIdY = bottomSectionEnd + 100; // 100pt gap after bottom section to prevent overlap
      // Ensure it's within content area bounds (contentY + contentHeight - 15pt margin from bottom)
      const maxCertIdY = contentY + contentHeight - 15;
      const finalCertIdY = Math.min(certIdY, maxCertIdY);
      centerText(certIdText, 10, 'Helvetica', finalCertIdY, '#94a3b8');
      
      // Decorative plus signs removed as per user request
      
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


// Markdown parser utility for chat messages
// Detects code blocks, sections, lists, headings, etc.

export const parseMarkdown = (content) => {
  const blocks = [];
  let currentBlock = { type: 'text', content: '', language: null };
  let inCodeBlock = false;
  let codeBlockLanguage = '';
  
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check for code block start/end
    const codeBlockMatch = line.match(/^```(\w+)?$/);
    if (codeBlockMatch) {
      if (inCodeBlock) {
        // End of code block
        if (currentBlock.content) {
          blocks.push({
            ...currentBlock,
            content: currentBlock.content.trim()
          });
        }
        currentBlock = { type: 'text', content: '', language: null };
        inCodeBlock = false;
        codeBlockLanguage = '';
      } else {
        // Start of code block
        if (currentBlock.content.trim()) {
          blocks.push({ ...currentBlock, content: currentBlock.content.trim() });
        }
        codeBlockLanguage = codeBlockMatch[1] || 'text';
        currentBlock = { type: 'code', content: '', language: codeBlockLanguage };
        inCodeBlock = true;
      }
      continue;
    }
    
    if (inCodeBlock) {
      // Accumulate code block content
      currentBlock.content += (currentBlock.content ? '\n' : '') + line;
    } else {
      // Accumulate text content
      currentBlock.content += (currentBlock.content ? '\n' : '') + line;
    }
  }
  
  // Push the last block
  if (currentBlock.content.trim()) {
    blocks.push({ ...currentBlock, content: currentBlock.content.trim() });
  }
  
  return blocks;
};

export const detectSections = (content) => {
  // Split by double newlines to get paragraphs
  const paragraphs = content.split('\n\n').filter(p => p.trim());
  
  const sections = {
    intro: [],
    teaching: [],
    assessment: []
  };
  
  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i].trim();
    
    // Check if it's an assessment question (ends with ?)
    if (paragraph.endsWith('?') || paragraph.split('\n').some(line => line.trim().endsWith('?'))) {
      sections.assessment.push(paragraph);
    } else if (i === 0) {
      // First paragraph is usually intro
      sections.intro.push(paragraph);
    } else {
      // Middle paragraphs are teaching content
      sections.teaching.push(paragraph);
    }
  }
  
  return sections;
};

export const extractBoldText = (text) => {
  const parts = [];
  const regex = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.substring(lastIndex, match.index) });
    }
    parts.push({ type: 'bold', content: match[1] });
    lastIndex = regex.lastIndex;
  }
  
  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.substring(lastIndex) });
  }
  
  return parts.length > 0 ? parts : [{ type: 'text', content: text }];
};

export const parseInlineCode = (text) => {
  // Replace `code` with inline code markers
  return text.replace(/`([^`]+)`/g, '<code>$1</code>');
};

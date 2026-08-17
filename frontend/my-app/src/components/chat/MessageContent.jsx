import React, { memo, lazy, Suspense } from 'react';
import CodeBlock from './CodeBlock';
import ProgressIndicator from './ProgressIndicator';
import { parseMarkdown, extractBoldText } from '../../utils/markdownParser';

const MermaidDiagram = lazy(() => import('./MermaidDiagram'));

const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(?<![[("])(https?:\/\/[^\s)<>"]+)/g;

const renderLinksAndCode = (text) => {
  const tokens = [];
  let cursor = 0;

  const combined = new RegExp(
    `(${LINK_RE.source})|(\`[^\`]+\`)`,
    'g'
  );
  let m;
  while ((m = combined.exec(text)) !== null) {
    if (m.index > cursor) {
      tokens.push(<span key={`t-${cursor}`}>{text.substring(cursor, m.index)}</span>);
    }
    if (m[0].startsWith('`')) {
      tokens.push(
        <code
          key={`c-${m.index}`}
          className="bg-gray-100 text-red-600 px-1.5 py-0.5 rounded text-sm font-mono"
          style={{ backgroundColor: '#f3f4f6', color: '#dc2626', padding: '2px 6px', borderRadius: '4px', fontSize: '0.875rem', fontFamily: 'monospace' }}
        >
          {m[0].slice(1, -1)}
        </code>
      );
    } else {
      const mdLink = m[0].match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      const href = mdLink ? mdLink[2] : m[0];
      const label = mdLink ? mdLink[1] : href.replace(/^https?:\/\//, '').slice(0, 40);
      tokens.push(
        <a
          key={`l-${m.index}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#4e81ee] underline hover:text-blue-700 break-all"
        >
          {label}
        </a>
      );
    }
    cursor = m.index + m[0].length;
  }
  if (cursor < text.length) {
    tokens.push(<span key={`t-${cursor}`}>{text.substring(cursor)}</span>);
  }
  return tokens.length ? tokens : [<span key="t">{text}</span>];
};

const renderInlineCode = renderLinksAndCode;

const MessageContent = memo(function MessageContent({ content, isLastMessage = false, points, gems, progressPct, milestoneInfo }) {
  // Answer-choice widgets (True/False, MCQ) and their selection state were
  // removed — milestone questions are open-ended and answered via chat.
  const blocks = parseMarkdown(content);
  
  const allParagraphs = [];
  let paragraphIndex = 0;
  
  blocks.forEach((block, blockIndex) => {
    if (block.type === 'mermaid') {
      allParagraphs.push({ ...block, paragraphIndex: paragraphIndex++ });
    } else if (block.type === 'code') {
      allParagraphs.push({ ...block, paragraphIndex: paragraphIndex++ });
    } else {
      // Split text block by double newlines to get paragraphs
      const paragraphs = block.content.split('\n\n').filter(p => p.trim());
      paragraphs.forEach((para, paraIndex) => {
        allParagraphs.push({
          type: 'text',
          content: para,
          originalBlockIndex: blockIndex,
          paragraphIndex: paragraphIndex++,
          isFirstInBlock: paraIndex === 0,
          isLastInBlock: paraIndex === paragraphs.length - 1
        });
      });
    }
  });
  
  // Find the last paragraph that ends with '?' - this is the assessment question
  const lastQuestionIndex = allParagraphs.length - 1;
  const lastParagraph = allParagraphs[lastQuestionIndex];
  // More robust detection: check if last paragraph is text and ends with '?'
  // Strip bold markers (**text**) before checking, as questions are often wrapped in bold
  const lastParagraphText = lastParagraph?.type === 'text' ? lastParagraph.content.trim() : '';
  // Remove bold markers to check if it ends with ?
  const textWithoutBold = lastParagraphText.replace(/\*\*/g, '').trim();
  // Also check if the content contains a question mark at the end (even with trailing whitespace)
  const isLastParagraphQuestion = lastParagraph?.type === 'text' && 
                                   textWithoutBold.length > 0 &&
                                   textWithoutBold.charAt(textWithoutBold.length - 1) === '?';
  
  return (
    <div className="prose prose-sm max-w-none">
      {allParagraphs.map((item, itemIndex) => {
        if (item.type === 'mermaid') {
          return (
            <Suspense key={item.paragraphIndex} fallback={<div className="my-4 p-4 text-sm text-gray-400">Loading diagram...</div>}>
              <MermaidDiagram chart={item.content} />
            </Suspense>
          );
        }
        if (item.type === 'code') {
          return (
            <CodeBlock 
              key={item.paragraphIndex} 
              code={item.content} 
              language={item.language || 'text'} 
            />
          );
        }
        
        // This is a text paragraph
        const paragraphLines = item.content.split('\n').filter(l => l.trim());
        // Assessment question detection: must be the last item AND end with '?'
        const isAssessmentQuestion = itemIndex === lastQuestionIndex && isLastParagraphQuestion;
        const isFirstParagraph = itemIndex === 0;
        
        return (
          <div key={item.paragraphIndex} className={isAssessmentQuestion ? "mt-6" : "mb-3"}>
            {isAssessmentQuestion && itemIndex > 0 && (
              <div className="border-t border-[#4e81ee] h-px my-6"></div>
            )}
            
            {isAssessmentQuestion ? (() => {
              // Milestone assessment questions are OPEN-ENDED: the student
              // answers with their next chat message, so no answer-choice
              // control is rendered (the True/False and MCQ widgets were
              // removed — they appeared inconsistently on open-ended questions
              // and there is no separate answer channel). The chat input IS the
              // answer box.
              return (
                // Assessment question styling - light blue/grey background with thick left blue bar
                // Disabling prose for this section to prevent style overrides
                <div
                  className="not-prose mt-2 p-5 rounded-lg"
                  style={{
                    backgroundColor: '#F0F4FC',
                    borderLeft: '6px solid #4e81ee',
                    boxSizing: 'border-box'
                  }}
                >
                  {/* Question text (open-ended — answered via the chat input) */}
                  <div className="mb-3">
                    {paragraphLines.map((line, lineIndex) => {
                      const parts = extractBoldText(line);
                      return (
                        <div key={lineIndex} className="text-base" style={{ color: '#030712' }}>
                          {parts.map((part, partIndex) =>
                            part.type === 'bold' ? (
                              <strong key={partIndex} className="font-bold text-lg" style={{ color: '#030712' }}>
                                {part.content}
                              </strong>
                            ) : (
                              <span key={partIndex} style={{ color: '#030712' }}>{renderInlineCode(part.content)}</span>
                            )
                          )}
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* No answer-choice control: milestone questions are
                      open-ended and answered via the chat input. */}
                </div>
              );
            })() : isFirstParagraph ? (
              // Intro paragraph styling with progress indicator
              <div className="pb-2 border-b border-[#f0f0f0]">
                {/* Progress indicator in intro section */}
                {isLastMessage && (points !== undefined || gems !== undefined) && (
                  <ProgressIndicator 
                    points={points || 0} 
                    gems={gems || 0} 
                    progressPct={progressPct || 0}
                    milestoneInfo={milestoneInfo}
                  />
                )}
                {paragraphLines.map((line, lineIndex) => {
                  // Check for topic names, module titles, milestone names in bold
                  const boldLineText = line.trim().startsWith('**') && line.trim().endsWith('**') && line.trim().split('**').length === 3
                    ? line.trim().slice(2, -2)
                    : null;
                  
                  if (boldLineText) {
                    // Color-code based on content - topic names (blue), milestones (purple), modules (teal)
                    let colorClass = 'text-[#4e81ee]'; // Default blue for topic names
                    const lowerText = boldLineText.toLowerCase();
                    if (lowerText.includes('module') || lowerText.includes('getting started') || lowerText.includes('advanced topics') || lowerText.includes('core concepts')) {
                      colorClass = 'text-teal-600'; // Teal for module titles
                    } else if (lowerText.includes('milestone') || lowerText.includes('complete') || lowerText.includes('move on to')) {
                      colorClass = 'text-purple-600'; // Purple for milestones
                    }
                    
                    return (
                      <div key={lineIndex} className={`font-bold ${colorClass} mb-1`}>
                        {boldLineText}
                      </div>
                    );
                  }
                  const parts = extractBoldText(line);
                  return (
                    <div key={lineIndex} className="mb-1">
                      {parts.map((part, partIndex) => 
                        part.type === 'bold' ? (
                          <strong key={partIndex} className="font-bold text-[#030712]">
                            {renderInlineCode(part.content)}
                          </strong>
                        ) : (
                          <span key={partIndex}>{renderInlineCode(part.content)}</span>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              // Teaching content styling with numbered steps support
              <div>
                {(() => {
                  // Detect numbered steps (1., 2., 3. or 1) 2) 3))
                  const numberedLines = paragraphLines.filter(line => /^\d+[.)]\s+/.test(line.trim()));
                  const hasNumberedSteps = numberedLines.length >= 2;
                  
                  return paragraphLines.map((line, lineIndex) => {
                    // Check for numbered steps
                    const stepMatch = line.trim().match(/^(\d+)[.)]\s+(.+)$/);
                    if (stepMatch && hasNumberedSteps) {
                      const stepNum = stepMatch[1];
                      const stepText = stepMatch[2];
                      const parts = extractBoldText(stepText);
                      
                      return (
                        <div key={lineIndex} className="flex items-start gap-3 mb-3 p-2 rounded-lg hover:bg-blue-50/30 transition-colors">
                          {/* Step number badge */}
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#4e81ee] text-white font-bold text-sm flex items-center justify-center">
                            {stepNum}
                          </div>
                          {/* Step content */}
                          <div className="flex-1">
                            {parts.map((part, partIndex) => 
                              part.type === 'bold' ? (
                                <strong key={partIndex} className="font-semibold text-[#030712]">
                                  {part.content}
                                </strong>
                              ) : (
                                <span key={partIndex}>{part.content}</span>
                              )
                            )}
                          </div>
                        </div>
                      );
                    }
                    
                    // Check for bold headings in teaching content
                    const boldLineText = line.trim().startsWith('**') && line.trim().endsWith('**') && line.trim().split('**').length === 3
                      ? line.trim().slice(2, -2)
                      : null;
                    
                    if (boldLineText) {
                      // Color-code important concepts - use blue for emphasis
                      // BUT: Don't style questions as blue here - they should be handled by assessment detection
                      return (
                        <div key={lineIndex} className="font-bold text-[#4e81ee] mb-2">
                          {boldLineText}
                        </div>
                      );
                    }
                    
                    // Regular text with bold and inline code support
                    // IMPORTANT: Don't apply question styling here - questions should be caught by isAssessmentQuestion check above
                    const parts = extractBoldText(line);
                    return (
                      <div key={lineIndex} className="mb-1">
                        {parts.map((part, partIndex) => 
                          part.type === 'bold' ? (
                            <strong key={partIndex} className="font-semibold text-[#030712]">
                              {renderInlineCode(part.content)}
                            </strong>
                          ) : (
                            <span key={partIndex} style={{ color: '#030712' }}>{renderInlineCode(part.content)}</span>
                          )
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

export default MessageContent;

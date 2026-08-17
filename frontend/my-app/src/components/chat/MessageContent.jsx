import React, { memo, lazy, Suspense } from 'react';
import CodeBlock from './CodeBlock';
import ProgressIndicator from './ProgressIndicator';
import { parseMarkdown, extractBoldText } from '../../utils/markdownParser';

const MermaidDiagram = lazy(() => import('./MermaidDiagram'));

const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(?<![[("])(https?:\/\/[^\s)<>"]+)/g;

// *italic* spans: single asterisks around a run whose first/last characters
// are neither whitespace nor '*'. That boundary rule means a `* ` bullet
// marker, leftover `**` from bold, or `5 * 3` arithmetic never matches.
// Applied only to plain-text segments (bold is already split out upstream,
// and inline `code` / links are tokenized before this runs).
const applyItalics = (text) => {
  const italicRe = /\*([^\s*](?:[^*\n]*[^\s*])?)\*/g;
  const out = [];
  let last = 0;
  let i = 0;
  let m;
  while ((m = italicRe.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<em key={`em-${i++}`}>{m[1]}</em>);
    last = italicRe.lastIndex;
  }
  if (out.length === 0) return text;
  if (last < text.length) out.push(text.slice(last));
  return out;
};

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
      tokens.push(<span key={`t-${cursor}`}>{applyItalics(text.substring(cursor, m.index))}</span>);
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
    tokens.push(<span key={`t-${cursor}`}>{applyItalics(text.substring(cursor))}</span>);
  }
  return tokens.length ? tokens : [<span key="t">{applyItalics(text)}</span>];
};

const renderInlineCode = renderLinksAndCode;

// Imperative assessment questions ("In your own words, explain how…") carry
// no question mark, so the ends-with-'?' card detection misses them. This
// heuristic catches the common imperative/interrogative openers. Only ever
// tested against the LAST paragraph of a message.
const IMPERATIVE_QUESTION_RE = /^(in your own words|explain|describe|walk me through|tell me|how|what|why|when|which)\b/i;

const MessageContent = memo(function MessageContent({ content, parts, isLastMessage = false, points, gems, progressPct, milestoneInfo }) {
  // Answer-choice widgets (True/False, MCQ) and their selection state were
  // removed — milestone questions are open-ended and answered via chat.

  // Parts-driven question card: when the backend supplies structured parts
  // with a non-empty question, strip the question off the tail of `content`
  // (it is appended there) and render it in the question card directly —
  // no heuristic needed. If the tail doesn't match exactly, fall back to
  // rendering content as-is with the detection heuristic (never duplicate).
  const partsQuestion = typeof parts?.question === 'string' ? parts.question.trim() : '';
  let bodyContent = content;
  let forcedQuestion = null;
  if (partsQuestion) {
    const fullContent = String(content || '').trimEnd();
    if (fullContent.endsWith(partsQuestion)) {
      forcedQuestion = partsQuestion;
      bodyContent = fullContent.slice(0, fullContent.length - partsQuestion.length).trimEnd();
    }
  }

  const blocks = parseMarkdown(bodyContent);
  
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
  
  // The stripped parts.question renders as its own final paragraph, flagged so
  // the card fires without any heuristic.
  if (forcedQuestion !== null) {
    allParagraphs.push({
      type: 'text',
      content: forcedQuestion,
      paragraphIndex: paragraphIndex++,
      isForcedQuestion: true
    });
  }

  // Find the last paragraph that is the assessment question. Only the LAST
  // paragraph can ever be the question.
  const lastQuestionIndex = allParagraphs.length - 1;
  const lastParagraph = allParagraphs[lastQuestionIndex];
  // More robust detection: check if last paragraph is text and ends with '?'
  // Strip bold markers (**text**) before checking, as questions are often wrapped in bold
  const lastParagraphText = lastParagraph?.type === 'text' ? lastParagraph.content.trim() : '';
  // Remove bold markers to check if it ends with ?
  const textWithoutBold = lastParagraphText.replace(/\*\*/g, '').trim();
  // Question when: backend-supplied via parts (forced), ends with '?', or
  // opens with an imperative-question phrase (tutor often phrases assessment
  // prompts imperatively, with no question mark).
  const isLastParagraphQuestion = lastParagraph?.type === 'text' &&
                                   textWithoutBold.length > 0 &&
                                   (lastParagraph.isForcedQuestion === true ||
                                    textWithoutBold.charAt(textWithoutBold.length - 1) === '?' ||
                                    IMPERATIVE_QUESTION_RE.test(textWithoutBold));
  
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

                  // Group consecutive bullet lines (`- item` / `* item`) into a
                  // single <ul>; everything else stays a standalone line. The
                  // marker must be followed by whitespace, so a line starting
                  // with `**bold**` is never mistaken for a bullet.
                  const segments = [];
                  paragraphLines.forEach((line, lineIndex) => {
                    const bulletMatch = line.trim().match(/^[-*]\s+(.+)$/);
                    if (bulletMatch) {
                      const prev = segments[segments.length - 1];
                      if (prev && prev.type === 'bullets') {
                        prev.items.push(bulletMatch[1]);
                      } else {
                        segments.push({ type: 'bullets', items: [bulletMatch[1]] });
                      }
                    } else {
                      segments.push({ type: 'line', line, lineIndex });
                    }
                  });

                  return segments.map((segment, segmentIndex) => {
                    if (segment.type === 'bullets') {
                      return (
                        <ul key={`ul-${segmentIndex}`} className="list-disc pl-5 mb-3 space-y-1">
                          {segment.items.map((item, itemIndex) => {
                            const parts = extractBoldText(item);
                            return (
                              <li key={itemIndex} style={{ color: '#030712' }}>
                                {parts.map((part, partIndex) =>
                                  part.type === 'bold' ? (
                                    <strong key={partIndex} className="font-semibold text-[#030712]">
                                      {renderInlineCode(part.content)}
                                    </strong>
                                  ) : (
                                    <span key={partIndex} style={{ color: '#030712' }}>{renderInlineCode(part.content)}</span>
                                  )
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      );
                    }

                    const { line, lineIndex } = segment;
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
                                <span key={partIndex}>{applyItalics(part.content)}</span>
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

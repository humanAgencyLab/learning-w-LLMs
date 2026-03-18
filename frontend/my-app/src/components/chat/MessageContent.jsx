import React, { useState, memo } from 'react';
import CodeBlock from './CodeBlock';
import ProgressIndicator from './ProgressIndicator';
import { parseMarkdown, extractBoldText } from '../../utils/markdownParser';
import { detectQuestionType, parseMCQQuestion } from '../../utils/questionParser';

// Helper to render inline code (backticks)
const renderInlineCode = (text) => {
  const parts = [];
  const codeRegex = /`([^`]+)`/g;
  let lastIndex = 0;
  let match;
  
  while ((match = codeRegex.exec(text)) !== null) {
    // Add text before code
    if (match.index > lastIndex) {
      parts.push(<span key={`text-${lastIndex}`}>{text.substring(lastIndex, match.index)}</span>);
    }
    // Add code with styling
    parts.push(
      <code 
        key={`code-${match.index}`}
        className="bg-gray-100 text-red-600 px-1.5 py-0.5 rounded text-sm font-mono"
        style={{ 
          backgroundColor: '#f3f4f6', 
          color: '#dc2626',
          padding: '2px 6px',
          borderRadius: '4px',
          fontSize: '0.875rem',
          fontFamily: 'monospace'
        }}
      >
        {match[1]}
      </code>
    );
    lastIndex = codeRegex.lastIndex;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(<span key={`text-${lastIndex}`}>{text.substring(lastIndex)}</span>);
  }
  
  return parts.length > 0 ? parts : [<span key="text">{text}</span>];
};

const MessageContent = memo(function MessageContent({ content, isLastMessage = false, points, gems, progressPct, milestoneInfo }) {
  // Parse content to separate code blocks and text
  const blocks = parseMarkdown(content);
  
  // Split all text blocks into paragraphs to properly detect assessment questions
  const allParagraphs = [];
  let paragraphIndex = 0;
  
  blocks.forEach((block, blockIndex) => {
    if (block.type === 'code') {
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
              const questionContent = paragraphLines.join('\n');
              const questionType = detectQuestionType(questionContent);
              const isMCQ = questionType === 'multiple-choice';
              const isTrueFalse = questionType === 'true-false';
              const mcqData = isMCQ ? parseMCQQuestion(questionContent) : null;
              
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
                  {/* Question text */}
                  <div className="mb-3">
                    {isMCQ && mcqData ? (
                      <div className="text-base">
                        <strong className="font-bold text-[#030712] text-lg">
                          {extractBoldText(mcqData.question).map((part, idx) => 
                            part.type === 'bold' ? <strong key={idx}>{part.content}</strong> : <span key={idx}>{part.content}</span>
                          )}
                        </strong>
                      </div>
                    ) : (
                      paragraphLines.map((line, lineIndex) => {
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
                      })
                    )}
                  </div>
                  
                  {/* MCQ Options */}
                  {isMCQ && mcqData && mcqData.options.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {mcqData.options.map((option, idx) => (
                        <div key={idx} className="flex items-start gap-2 p-2 bg-white rounded-lg border border-blue-100 hover:border-blue-300 hover:bg-blue-50 transition-colors">
                          <span className="font-semibold text-[#4e81ee] min-w-[24px]">{option.letter}.</span>
                          <span className="text-[#030712]">{option.text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* True/False indicator */}
                  {isTrueFalse && (
                    <div className="mt-3 p-3 bg-white rounded-lg border border-blue-200">
                      <div className="flex gap-3">
                        <button className="px-4 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg font-medium hover:bg-green-100 transition-colors">
                          True
                        </button>
                        <button className="px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg font-medium hover:bg-red-100 transition-colors">
                          False
                        </button>
                      </div>
                    </div>
                  )}
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

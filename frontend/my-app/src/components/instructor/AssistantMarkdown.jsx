import React from 'react';
import { extractBoldText } from '../../utils/markdownParser';

/**
 * Lightweight markdown renderer for Insights Assistant replies.
 *
 * Supports: paragraphs (blank-line separated), single line breaks within a
 * paragraph, **bold**, *italic*, `inline code`, numbered lists (1. / 1)),
 * bulleted lists (- / *), and #-heading lines (rendered as a bold line).
 *
 * Deliberately NOT a general markdown engine — it builds React elements
 * directly (no dangerouslySetInnerHTML) and plain prose with no markdown
 * renders as a single paragraph with the exact same text as before.
 */

// Italic span: single asterisks around a run whose first/last characters are
// neither whitespace nor '*'. That boundary rule means a `* ` list marker,
// a stray `**`, or `5 * 3` arithmetic can never be swallowed as italics.
const italicPattern = () => /\*([^\s*](?:[^*\n]*[^\s*])?)\*/g;

function renderItalics(text, keyBase) {
  const re = italicPattern();
  const nodes = [];
  let last = 0;
  let i = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push(<span key={`${keyBase}-t${i++}`}>{text.slice(last, m.index)}</span>);
    }
    nodes.push(<em key={`${keyBase}-e${i++}`}>{m[1]}</em>);
    last = re.lastIndex;
  }
  if (nodes.length === 0) {
    return [<span key={`${keyBase}-t0`}>{text}</span>];
  }
  if (last < text.length) {
    nodes.push(<span key={`${keyBase}-t${i++}`}>{text.slice(last)}</span>);
  }
  return nodes;
}

function renderBoldItalic(text, keyBase) {
  return extractBoldText(text).flatMap((part, pi) =>
    part.type === 'bold'
      ? [
          <strong key={`${keyBase}-b${pi}`} className="font-semibold text-ink-900">
            {part.content}
          </strong>,
        ]
      : renderItalics(part.content, `${keyBase}-p${pi}`)
  );
}

// Inline pipeline: extract `code` spans first (so markers inside code stay
// literal), then bold, then italics on what remains.
function renderInline(text, keyBase) {
  const codeRe = /`([^`]+)`/g;
  const nodes = [];
  let last = 0;
  let i = 0;
  let m;
  while ((m = codeRe.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push(...renderBoldItalic(text.slice(last, m.index), `${keyBase}-s${i++}`));
    }
    nodes.push(
      <code
        key={`${keyBase}-c${i++}`}
        className="bg-surface border border-hairline rounded px-1 py-px font-mono text-xs text-ink-700"
      >
        {m[1]}
      </code>
    );
    last = codeRe.lastIndex;
  }
  if (last < text.length || nodes.length === 0) {
    nodes.push(...renderBoldItalic(text.slice(last), `${keyBase}-s${i++}`));
  }
  return nodes;
}

/**
 * Split raw content into block-level chunks: paragraphs, ordered lists,
 * unordered lists, and heading lines. Blank lines close the current block.
 */
function parseBlocks(content) {
  const lines = String(content ?? '').split('\n');
  const blocks = [];
  let current = null;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      current = null;
      continue;
    }

    const heading = trimmed.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      blocks.push({ type: 'heading', text: heading[1] });
      current = null;
      continue;
    }

    const ordered = trimmed.match(/^(\d+)[.)]\s+(.*)$/);
    if (ordered) {
      if (!current || current.type !== 'ol') {
        current = { type: 'ol', start: parseInt(ordered[1], 10) || 1, items: [] };
        blocks.push(current);
      }
      current.items.push(ordered[2]);
      continue;
    }

    // `- item` or `* item`. Requires whitespace after the marker, so a line
    // starting with `**bold**` (marker char followed by '*') is NOT a bullet.
    const bullet = trimmed.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      if (!current || current.type !== 'ul') {
        current = { type: 'ul', items: [] };
        blocks.push(current);
      }
      current.items.push(bullet[1]);
      continue;
    }

    if (!current || current.type !== 'p') {
      current = { type: 'p', lines: [] };
      blocks.push(current);
    }
    current.lines.push(trimmed);
  }

  return blocks;
}

export default function AssistantMarkdown({ content }) {
  const blocks = parseBlocks(content);
  if (blocks.length === 0) return null;

  return (
    <div className="space-y-2">
      {blocks.map((block, bi) => {
        if (block.type === 'heading') {
          return (
            <p key={bi} className="font-semibold text-ink-900">
              {renderInline(block.text, `h${bi}`)}
            </p>
          );
        }
        if (block.type === 'ol') {
          return (
            <ol key={bi} start={block.start} className="list-decimal pl-4 space-y-0.5">
              {block.items.map((item, ii) => (
                <li key={ii}>{renderInline(item, `o${bi}-${ii}`)}</li>
              ))}
            </ol>
          );
        }
        if (block.type === 'ul') {
          return (
            <ul key={bi} className="list-disc pl-4 space-y-0.5">
              {block.items.map((item, ii) => (
                <li key={ii}>{renderInline(item, `u${bi}-${ii}`)}</li>
              ))}
            </ul>
          );
        }
        // Paragraph: preserve single line breaks the pre-wrap styling used to.
        return (
          <p key={bi}>
            {block.lines.map((line, li) => (
              <React.Fragment key={li}>
                {li > 0 && <br />}
                {renderInline(line, `p${bi}-${li}`)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

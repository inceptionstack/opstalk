import type { RenderSpan } from './types.js';

export interface StyledLine {
  kind: 'text' | 'meta' | 'code' | 'separator';
  spans: RenderSpan[];
}

function plain(text: string): RenderSpan[] {
  return text ? [{ text }] : [{ text: '' }];
}

function parseInline(text: string): RenderSpan[] {
  const spans: RenderSpan[] = [];
  let index = 0;
  const regex = /(`([^`]+)`)|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > index) {
      spans.push({ text: text.slice(index, match.index) });
    }
    if (match[1]) {
      spans.push({ text: match[2] ?? '', bold: true });
    } else if (match[3]) {
      spans.push({ text: match[4] ?? '', bold: true });
    } else if (match[5]) {
      spans.push({ text: match[6] ?? '', italic: true });
    } else if (match[7]) {
      spans.push({ text: `${match[8] ?? ''} (${match[9] ?? ''})` });
    }
    index = match.index + match[0].length;
  }
  if (index < text.length) {
    spans.push({ text: text.slice(index) });
  }
  return spans.length > 0 ? spans : plain(text);
}

export function renderMarkdownLines(text: string): StyledLine[] {
  if (!text.trim()) {
    return [{ kind: 'text', spans: [{ text: '' }] }];
  }

  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const output: StyledLine[] = [];
  let inCode = false;

  for (const rawLine of lines) {
    if (rawLine.startsWith('```')) {
      inCode = !inCode;
      output.push({ kind: 'meta', spans: [{ text: rawLine || '```', dim: true }] });
      continue;
    }

    if (inCode) {
      output.push({ kind: 'code', spans: [{ text: rawLine || ' ', bold: false }] });
      continue;
    }

    if (!rawLine.trim()) {
      output.push({ kind: 'separator', spans: [{ text: '' }] });
      continue;
    }

    if (/^\s*[-*]\s+/.test(rawLine)) {
      const stripped = rawLine.replace(/^\s*[-*]\s+/, '• ');
      output.push({ kind: 'text', spans: parseInline(stripped) });
      continue;
    }

    output.push({ kind: 'text', spans: parseInline(rawLine) });
  }

  return output;
}

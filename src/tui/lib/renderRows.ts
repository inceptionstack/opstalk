import { renderMarkdownLines } from './markdown.js';
import { wrapSpans } from './wrap.js';
import type { ChatMessage, MessagePart, RenderRow, RenderSpan } from './types.js';

function colorize(spans: RenderSpan[], role: ChatMessage['role'], kind: MessagePart['type'] | 'meta'): RenderSpan[] {
  const color =
    role === 'user'
      ? 'blue'
      : role === 'assistant'
        ? kind === 'thinking'
          ? 'magenta'
          : kind === 'tool_use'
            ? 'cyan'
            : 'green'
        : role === 'error'
          ? 'red'
          : 'yellow';
  const dim = kind === 'thinking' || kind === 'tool_result' || role === 'system';
  return spans.map(span => ({ ...span, color, dim: span.dim ?? dim }));
}

function buildRowsForPart(message: ChatMessage, part: MessagePart, width: number): RenderRow[] {
  let sourceLines: Array<{ kind: RenderRow['kind']; spans: RenderSpan[] }>;

  switch (part.type) {
    case 'text':
      sourceLines = renderMarkdownLines(part.text).map(line => ({ kind: line.kind, spans: colorize(line.spans, message.role, 'text') }));
      break;
    case 'thinking':
      sourceLines = renderMarkdownLines(part.text).map(line => ({ kind: line.kind, spans: colorize(line.spans, message.role, 'thinking') }));
      break;
    case 'tool_use':
      sourceLines = [
        {
          kind: 'meta',
          spans: colorize([{ text: `tool ${part.name}: ${part.argumentsText}` }], message.role, 'tool_use'),
        },
      ];
      break;
    case 'tool_result':
      sourceLines = [
        {
          kind: 'meta',
          spans: colorize(
            [{ text: `result ${part.toolName}: ${part.resultText}${part.truncated ? ' [truncated]' : ''}` }],
            message.role,
            'tool_result'
          ),
        },
      ];
      break;
    default:
      sourceLines = [{ kind: 'text', spans: [{ text: '' }] }];
  }

  const rows: RenderRow[] = [];
  sourceLines.forEach((line, sourceLine) => {
    const wrapped = wrapSpans(line.spans, width);
    wrapped.forEach((spans, wrapRow) => {
      rows.push({
        key: `${message.id}:${part.id}:${sourceLine}:${wrapRow}`,
        messageId: message.id,
        partId: part.id,
        sourceLine,
        wrapRow,
        kind: line.kind,
        spans,
      });
    });
  });
  return rows;
}

export function renderRows(messages: ChatMessage[], width: number): RenderRow[] {
  const rows: RenderRow[] = [];
  for (const message of messages) {
    for (const part of message.parts) {
      rows.push(...buildRowsForPart(message, part, width));
    }
    rows.push({
      key: `${message.id}:separator`,
      messageId: message.id,
      partId: `${message.id}:separator`,
      sourceLine: 0,
      wrapRow: 0,
      kind: 'separator',
      spans: [{ text: '' }],
    });
  }
  return rows;
}

import type { GatewayChatEventPayload, GatewayContentPart, GatewayMessage } from './protocol.js';
import type { ChatMessage, GatewayHistoryMessage, MessagePart, ThinkingMode } from '../tui/lib/types.js';

const TOOL_RESULT_LIMIT = 600;

function stripThinkTags(text: string): string {
  const thinkBlock = /<\s*(think(?:ing)?|thought|antThinking)\b[^<>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;
  const thinkOpen = /<\s*(think(?:ing)?|thought|antThinking)\b[^<>]*>/gi;
  const thinkClose = /<\s*\/\s*(?:think(?:ing)?|thought|antThinking)\s*>/gi;
  const finalTag = /<\s*\/?\s*final\b[^<>]*>/gi;
  let result = text.replace(finalTag, '').replace(thinkBlock, '');
  const matches = [...result.matchAll(thinkOpen)];
  const last = matches.at(-1);
  if (last?.index !== undefined) {
    result = result.slice(0, last.index);
  }
  return result.replace(thinkClose, '').trimStart();
}

function extractThinkingFromText(text: string): string[] {
  const regex = /<\s*(think(?:ing)?|thought|antThinking)\b[^<>]*>([\s\S]*?)<\s*\/\s*\1\s*>/gi;
  return [...text.matchAll(regex)].map(match => (match[2] ?? '').trim()).filter(Boolean);
}

function partId(messageId: string, index: number): string {
  return `${messageId}:part:${index}`;
}

function safeStringify(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function normalizeParts(
  messageId: string,
  source: GatewayMessage,
  thinkingMode: ThinkingMode
): MessagePart[] {
  const parts: MessagePart[] = [];
  const content = source.content ?? [];

  if (content.length > 0) {
    content.forEach((part, index) => {
      const id = partId(messageId, index);
      const normalized = normalizeContentPart(id, part, thinkingMode);
      if (normalized) {
        parts.push(normalized);
      }
    });
  }

  const rawText = typeof source.text === 'string' ? source.text : '';
  const strippedText = stripThinkTags(rawText);
  const hasText = parts.some(p => p.type === 'text');
  if (!hasText && strippedText.trim()) {
    const textPart: MessagePart = { id: partId(messageId, parts.length), type: 'text', text: strippedText };
    parts.unshift(textPart);
  }

  const hasThinking = parts.some(p => p.type === 'thinking');
  if (!hasThinking) {
    extractThinkingFromText(rawText).forEach((thinking, index) => {
      const thinkingPart: MessagePart = { id: `${messageId}:thinking:${index}`, type: 'thinking', text: thinking, collapsedByDefault: thinkingMode === 'concise' };
      parts.push(thinkingPart);
    });
  }

  return parts;
}

function normalizeContentPart(id: string, part: GatewayContentPart, thinkingMode: ThinkingMode): MessagePart | null {
  switch (part.type) {
    case 'text':
      return { id, type: 'text', text: stripThinkTags(part.text) };
    case 'thinking':
      return {
        id,
        type: 'thinking',
        text: part.thinking,
        collapsedByDefault: thinkingMode === 'concise',
      };
    case 'tool_use':
      return {
        id,
        type: 'tool_use',
        name: part.name,
        argumentsText: safeStringify(part.input ?? {}),
      };
    case 'tool_result': {
      const resultText = safeStringify(part.content ?? '');
      return {
        id,
        type: 'tool_result',
        toolName: part.toolName ?? part.tool_use_id ?? 'tool',
        resultText: resultText.length > TOOL_RESULT_LIMIT ? `${resultText.slice(0, TOOL_RESULT_LIMIT)}...` : resultText,
        truncated: resultText.length > TOOL_RESULT_LIMIT,
      };
    }
    case 'image_url':
      return null;
    default:
      return null;
  }
}

function inferRole(message?: GatewayMessage): ChatMessage['role'] {
  if (!message) {
    return 'error';
  }

  if (message.role === 'assistant' || message.role === 'user' || message.role === 'system') {
    return message.role;
  }

  return 'system';
}

function userMessageId(clientRequestId: string): string {
  return `user:${clientRequestId}`;
}

function assistantMessageId(runId: string): string {
  return `assistant:${runId}`;
}

export function createLocalUserMessage(params: {
  clientRequestId: string;
  text: string;
  createdAt?: number;
}): ChatMessage {
  return {
    id: userMessageId(params.clientRequestId),
    role: 'user',
    createdAt: params.createdAt ?? Date.now(),
    clientRequestId: params.clientRequestId,
    state: 'final',
    parts: [{ id: `${userMessageId(params.clientRequestId)}:part:0`, type: 'text', text: params.text }],
  };
}

export function normalizeHistoryMessages(
  response: GatewayHistoryMessage[] | { messages?: GatewayMessage[]; items?: GatewayHistoryMessage[] },
  thinkingMode: ThinkingMode
): ChatMessage[] {
  if (Array.isArray(response)) {
    return response.map(item => item.message);
  }

  if (response.items?.length) {
    return response.items.map(item => item.message);
  }

  return (response.messages ?? []).map((message, index) => {
    const baseId =
      message.role === 'assistant' ? assistantMessageId(`history-${index}`) : message.role === 'user' ? userMessageId(`history-${index}`) : `system:history:${index}`;
    return {
      id: baseId,
      role: inferRole(message),
      createdAt: message.timestamp ?? Date.now(),
      state: 'final',
      parts: normalizeParts(baseId, message, thinkingMode),
    };
  });
}

export function normalizeGatewayEvent(
  payload: GatewayChatEventPayload,
  thinkingMode: ThinkingMode
): ChatMessage | null {
  if (payload.state === 'error') {
    return {
      id: payload.runId ? assistantMessageId(payload.runId) : `error:${Date.now()}`,
      role: 'error',
      createdAt: Date.now(),
      runId: payload.runId,
      state: 'error',
      parts: [
        {
          id: `error:${payload.runId ?? Date.now()}:part:0`,
          type: 'text',
          text: payload.errorMessage ?? 'Gateway reported an unknown error.',
        },
      ],
    };
  }

  if (!payload.message || !payload.runId) {
    return null;
  }

  const role = inferRole(payload.message);
  const id = role === 'assistant' ? assistantMessageId(payload.runId) : payload.clientRequestId ? userMessageId(payload.clientRequestId) : `${role}:${payload.runId}`;
  return {
    id,
    role,
    createdAt: payload.message.timestamp ?? Date.now(),
    runId: payload.runId,
    clientRequestId: payload.clientRequestId,
    state:
      payload.state === 'delta' ? 'streaming' : payload.state === 'aborted' ? 'aborted' : payload.state === 'error' ? 'error' : 'final',
    parts: normalizeParts(id, payload.message, thinkingMode),
  };
}

export function applyChatEvent(messages: ChatMessage[], incoming: ChatMessage): ChatMessage[] {
  const existingIndex = messages.findIndex(message => message.id === incoming.id);
  if (existingIndex === -1) {
    return [...messages, incoming];
  }

  const next = messages.slice();
  next[existingIndex] = {
    ...messages[existingIndex],
    ...incoming,
    parts: incoming.parts,
  };
  return next;
}

import type { ThinkingMode } from '../tui/lib/types.js';

export type GatewayRole = 'user' | 'assistant' | 'system';

export type GatewayContentPart =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool_use'; id?: string; name: string; input?: unknown }
  | { type: 'tool_result'; tool_use_id?: string; toolName?: string; content?: unknown }
  | { type: 'image_url'; image_url: { url: string } };

export interface GatewayMessage {
  role: GatewayRole;
  content?: GatewayContentPart[];
  text?: string;
  timestamp?: number;
}

export interface GatewayChatEventPayload {
  runId?: string;
  sessionKey?: string;
  clientRequestId?: string;
  state: 'delta' | 'final' | 'aborted' | 'error' | string;
  message?: GatewayMessage;
  errorMessage?: string;
}

export interface GatewayHistoryResponse {
  messages?: GatewayMessage[];
  items?: Array<{
    runId?: string;
    clientRequestId?: string;
    timestamp?: number;
    message: GatewayMessage;
  }>;
}

export interface ConnectChallengeEventFrame {
  type: 'event';
  event: 'connect.challenge';
  payload: { nonce: string };
}

export interface ChatEventFrame {
  type: 'event';
  event: 'chat';
  payload: GatewayChatEventPayload;
  seq?: number;
}

export interface GenericEventFrame {
  type: 'event';
  event: string;
  payload: Record<string, unknown>;
  seq?: number;
}

export interface ResponseFrame {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: {
    code?: string;
    message?: string;
  };
}

export interface RequestFrame {
  type: 'req';
  id: string;
  method: 'connect' | 'chat.history' | 'chat.send' | 'chat.abort';
  params: Record<string, unknown>;
}

export type GatewayFrame = ConnectChallengeEventFrame | ChatEventFrame | GenericEventFrame | ResponseFrame;

export interface GatewayConnectRequest {
  minProtocol: 3;
  maxProtocol: 3;
  client: {
    id: 'opstalk';
    version: 'opstalk-1.0';
    platform: 'cli';
    mode: 'webchat';
  };
  role: 'operator';
  scopes: string[];
  caps: ['tool-events'];
  auth: { token: string };
}

export interface GatewaySendChatParams {
  sessionKey: string;
  message: string;
  idempotencyKey: string;
  deliver: false;
  thinking?: Exclude<ThinkingMode, 'off'>;
}

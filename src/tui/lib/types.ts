export type ThinkingMode = 'off' | 'concise' | 'verbose';

export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'authenticating'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'auth_error'
  | 'transport_error';

export type UiMode = 'input' | 'scroll';

export interface OpsTalkConfig {
  gateway: {
    url: string;
    token?: string | undefined;
    connectTimeoutMs: number;
    requestTimeoutMs: number;
  };
  session: {
    lastSessionKey: string;
    autoReconnect: boolean;
    historyLimit: number;
  };
  ui: {
    thinkingMode: ThinkingMode;
    showTimestamps: boolean;
  };
}

export interface ActiveRun {
  runId: string;
  startedAt: number;
  state: 'streaming' | 'aborting';
}

export type MessagePart =
  | { id: string; type: 'text'; text: string }
  | { id: string; type: 'thinking'; text: string; collapsedByDefault: boolean }
  | { id: string; type: 'tool_use'; name: string; argumentsText: string }
  | { id: string; type: 'tool_result'; toolName: string; resultText: string; truncated: boolean };

export interface ChatMessage {
  id: string;
  role: 'system' | 'user' | 'assistant' | 'error';
  createdAt: number;
  runId?: string | undefined;
  clientRequestId?: string | undefined;
  state?: 'streaming' | 'final' | 'aborted' | 'error' | undefined;
  parts: MessagePart[];
}

export interface GatewayHistoryMessage {
  runId?: string | undefined;
  clientRequestId?: string | undefined;
  createdAt?: number | undefined;
  message: ChatMessage;
}

export interface ViewportState {
  topRow: number;
  pinnedToBottom: boolean;
}

export interface ComposerState {
  value: string;
  cursorOffset: number;
  height: number;
}

export interface ChatScreenState {
  mode: UiMode;
  composer: ComposerState;
  viewport: ViewportState;
  collapsedThinking: Record<string, boolean>;
}

export interface RenderSpan {
  text: string;
  color?: string;
  dim?: boolean;
  bold?: boolean;
  italic?: boolean;
}

export interface RenderRow {
  key: string;
  messageId: string;
  partId: string;
  sourceLine: number;
  wrapRow: number;
  kind: 'text' | 'meta' | 'code' | 'separator';
  spans: RenderSpan[];
}

export interface CliOverrides {
  gatewayUrl?: string | undefined;
  token?: string | undefined;
  session?: string | undefined;
}

export interface GatewayConnectOptions {
  url: string;
  token: string;
  minProtocol: 3;
  maxProtocol: 3;
  sessionKey: string;
  connectTimeoutMs: number;
  requestTimeoutMs: number;
}

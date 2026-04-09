import WebSocket from 'ws';
import { EventEmitter } from 'node:events';
import {
  type GatewayChatEventPayload,
  type GatewayFrame,
  type GatewayHistoryResponse,
  type RequestFrame,
} from './protocol.js';
import type { GatewayConnectOptions, GatewayHistoryMessage, ThinkingMode } from '../tui/lib/types.js';

const RECONNECT_DELAYS_MS = [250, 500, 1000, 2000, 5000] as const;
const DEFAULT_SCOPES = [
  'operator.admin', 'operator.read', 'operator.write', 'operator.approvals', 'operator.pairing',
];

class GatewayError extends Error {
  public readonly code?: string | undefined;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'GatewayError';
    this.code = code;
  }
}

interface PendingRequest {
  method: RequestFrame['method'];
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeout: NodeJS.Timeout;
}

export interface GatewayStatusDetail {
  state: string;
  detail?: string | undefined;
  attempts: number;
}

function isAuthError(code?: string, message?: string): boolean {
  if (code && /auth|token|forbidden|unauthorized/i.test(code)) return true;
  return Boolean(message && /auth|token|forbidden|unauthorized/i.test(message));
}

// Use untyped EventEmitter to avoid Node's EventMap constraint issues
export class GatewayClient extends EventEmitter {
  private socket: WebSocket | null = null;
  private connectOptions: GatewayConnectOptions | null = null;
  private connected = false;
  private connecting = false;
  private manualDisconnect = false;
  private pendingRequests = new Map<string, PendingRequest>();
  private connectPromise: Promise<void> | null = null;
  private requestCounter = 0;
  private reconnectAttempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connectTimeout: NodeJS.Timeout | null = null;
  private authRejected = false;

  // Typed listener helpers
  onStatus(cb: (detail: GatewayStatusDetail) => void): this { return this.on('status', cb); }
  onChat(cb: (payload: GatewayChatEventPayload) => void): this { return this.on('chat', cb); }
  onGatewayError(cb: (detail: { message: string; code?: string | undefined }) => void): this { return this.on('error', cb); }
  onReconnecting(cb: (detail: { attempt: number; delayMs: number }) => void): this { return this.on('reconnecting', cb); }
  offChat(cb: (payload: GatewayChatEventPayload) => void): this { return this.off('chat', cb); }

  async connect(options: GatewayConnectOptions): Promise<void> {
    this.connectOptions = options;
    this.manualDisconnect = false;
    if (this.connected) return;
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = new Promise<void>((resolve, reject) => {
      this.connecting = true;
      this.emit('status', { state: this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting', detail: 'Opening WebSocket', attempts: this.reconnectAttempt });

      const socket = new WebSocket(options.url);
      this.socket = socket;
      this.connectTimeout = setTimeout(() => {
        reject(new Error(`connect timed out after ${options.connectTimeoutMs}ms`));
        socket.close();
      }, options.connectTimeoutMs);

      socket.on('open', () => {
        this.emit('status', { state: this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting', detail: 'Awaiting challenge', attempts: this.reconnectAttempt });
      });

      socket.on('message', data => { this.onMessage(String(data), resolve, reject); });

      socket.on('error', error => { this.emit('error', { message: error.message }); });

      socket.on('close', () => {
        this.connected = false;
        this.connecting = false;
        if (this.connectTimeout) { clearTimeout(this.connectTimeout); this.connectTimeout = null; }
        this.rejectAllPending(new Error('Connection closed.'));
        this.connectPromise = null;
        this.emit('status', { state: this.authRejected ? 'auth_error' : 'disconnected', detail: this.authRejected ? 'Authentication failed' : 'Connection closed', attempts: this.reconnectAttempt });
        if (!this.manualDisconnect && !this.authRejected) void this.scheduleReconnect();
      });
    });

    return this.connectPromise;
  }

  async disconnect(_reason?: string): Promise<void> {
    this.manualDisconnect = true;
    this.connected = false;
    this.connecting = false;
    this.connectPromise = null;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.connectTimeout) { clearTimeout(this.connectTimeout); this.connectTimeout = null; }
    this.socket?.close();
    this.socket = null;
  }

  async sendChat(params: { sessionKey: string; text: string; thinkingMode: ThinkingMode; clientRequestId: string }): Promise<{ runId: string }> {
    const reqParams: Record<string, unknown> = {
      sessionKey: params.sessionKey, message: params.text, deliver: false, idempotencyKey: params.clientRequestId,
    };
    if (params.thinkingMode !== 'off') reqParams['thinking'] = params.thinkingMode;
    const response = (await this.request('chat.send', reqParams)) as { runId?: string };
    return { runId: response.runId ?? params.clientRequestId };
  }

  async abortRun(params: { runId: string }): Promise<void> {
    await this.request('chat.abort', { runId: params.runId });
  }

  async fetchHistory(params: { sessionKey: string; limit: number }): Promise<GatewayHistoryMessage[] | GatewayHistoryResponse> {
    return (await this.request('chat.history', { sessionKey: params.sessionKey, limit: params.limit })) as GatewayHistoryMessage[] | GatewayHistoryResponse;
  }

  private async request(method: RequestFrame['method'], params: Record<string, unknown>): Promise<unknown> {
    const options = this.connectOptions;
    if (!options) throw new Error('connect() must be called before making requests.');
    await this.connect(options);
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error('Gateway is not connected.');
    const id = this.nextRequestId();
    return this.sendRequest(socket, { type: 'req', id, method, params }, options.requestTimeoutMs);
  }

  private nextRequestId(): string { this.requestCounter += 1; return `req:${this.requestCounter}`; }

  private onMessage(raw: string, resolveConnect: () => void, rejectConnect: (reason?: unknown) => void): void {
    let frame: GatewayFrame;
    try { frame = JSON.parse(raw) as GatewayFrame; }
    catch { this.emit('error', { message: 'Received invalid JSON from gateway.' }); return; }

    if (frame.type === 'event') {
      if (frame.event === 'connect.challenge') { void this.sendConnect(resolveConnect, rejectConnect); return; }
      if (frame.event === 'chat') this.emit('chat', frame.payload as GatewayChatEventPayload);
      return;
    }

    const pending = this.pendingRequests.get(frame.id);
    if (!pending) return;
    this.pendingRequests.delete(frame.id);
    clearTimeout(pending.timeout);

    if (!frame.ok) {
      const message = frame.error?.message ?? `${pending.method} failed`;
      const error = new GatewayError(message, frame.error?.code);
      if (pending.method === 'connect' && isAuthError(frame.error?.code, message)) this.authRejected = true;
      pending.reject(error);
      if (pending.method === 'connect') rejectConnect(error);
      return;
    }

    pending.resolve(frame.payload);

    if (pending.method === 'connect') {
      this.authRejected = false;
      this.connected = true;
      this.connecting = false;
      this.reconnectAttempt = 0;
      if (this.connectTimeout) { clearTimeout(this.connectTimeout); this.connectTimeout = null; }
      this.emit('status', { state: 'connected', detail: 'Connected', attempts: 0 });
      resolveConnect();
    }
  }

  private async sendConnect(resolveConnect: () => void, rejectConnect: (reason?: unknown) => void): Promise<void> {
    const options = this.connectOptions;
    if (!options) return;
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) { rejectConnect(new Error('Socket not open.')); return; }
    const params: Record<string, unknown> = {
      minProtocol: options.minProtocol, maxProtocol: options.maxProtocol,
      client: { id: 'opstalk', version: 'opstalk-1.0', platform: 'cli', mode: 'webchat' },
      role: 'operator', scopes: DEFAULT_SCOPES, caps: ['tool-events'], auth: { token: options.token },
    };
    const id = this.nextRequestId();
    try { await this.sendRequest(socket, { type: 'req', id, method: 'connect', params }, options.connectTimeoutMs); }
    catch (err) { rejectConnect(err); }
  }

  private sendRequest(socket: WebSocket, frame: RequestFrame, timeoutMs: number): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(frame.id);
        reject(new Error(`${frame.method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pendingRequests.set(frame.id, { method: frame.method, resolve, reject, timeout });
      socket.send(JSON.stringify(frame));
    });
  }

  private async scheduleReconnect(): Promise<void> {
    if (!this.connectOptions || this.reconnectTimer) return;
    const attempt = this.reconnectAttempt;
    const delayMs = RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)] ?? 5000;
    this.emit('reconnecting', { attempt: attempt + 1, delayMs });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectAttempt += 1;
      void this.connect(this.connectOptions!);  // connectOptions guaranteed by guard above
    }, delayMs);
  }

  private rejectAllPending(error: Error): void {
    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
      this.pendingRequests.delete(id);
    }
  }
}

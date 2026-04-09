import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { GatewayClient } from '../../gateway/GatewayClient.js';
import { applyChatEvent, createLocalUserMessage, normalizeGatewayEvent, normalizeHistoryMessages } from '../../gateway/normalize.js';
import type { ActiveRun, ChatMessage, ConnectionState, OpsTalkConfig, ThinkingMode } from '../lib/types.js';

interface GatewaySessionContextValue {
  connectionState: ConnectionState;
  connectionDetail: string | undefined;
  sessionKey: string;
  messages: ChatMessage[];
  activeRun: ActiveRun | undefined;
  thinkingMode: ThinkingMode;
  historyLoaded: boolean;
  connect: () => Promise<void>;
  validateToken: (token: string) => Promise<void>;
  disconnect: () => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  abortRun: () => Promise<void>;
  clearMessages: () => void;
  switchSession: (sessionKey: string) => Promise<void>;
  setThinkingMode: (mode: ThinkingMode) => void;
  reloadHistory: (limit?: number) => Promise<void>;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
}

const GatewaySessionContext = createContext<GatewaySessionContextValue | null>(null);

function randomId(prefix: string): string {
  return `${prefix}:${Date.now()}:${Math.random().toString(16).slice(2, 10)}`;
}

export function GatewaySessionProvider({
  children,
  config,
}: {
  children: React.ReactNode;
  config: OpsTalkConfig | null;
}) {
  const clientRef = useRef<GatewayClient | null>(null);
  const thinkingModeRef = useRef<ThinkingMode>(config?.ui.thinkingMode ?? 'off');
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [connectionDetail, setConnectionDetail] = useState<string>();
  const [sessionKey, setSessionKey] = useState(config?.session.lastSessionKey ?? 'main');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeRun, setActiveRun] = useState<ActiveRun>();
  const [thinkingMode, setThinkingModeState] = useState<ThinkingMode>(config?.ui.thinkingMode ?? 'off');
  const [historyLoaded, setHistoryLoaded] = useState(false);

  useEffect(() => {
    if (!config) {
      return;
    }
    setSessionKey(config.session.lastSessionKey);
    setThinkingModeState(config.ui.thinkingMode);
    thinkingModeRef.current = config.ui.thinkingMode;
  }, [config]);

  useEffect(() => {
    thinkingModeRef.current = thinkingMode;
  }, [thinkingMode]);

  const ensureClient = useCallback(() => {
    if (!clientRef.current) {
      const client = new GatewayClient();
      client.onStatus(detail => {
        setConnectionState(detail.state as ConnectionState);
        setConnectionDetail(detail.detail);
      });
      client.onChat(payload => {
        const normalized = normalizeGatewayEvent(payload, thinkingModeRef.current);
        if (normalized) {
          setMessages(current => applyChatEvent(current, normalized));
          if (normalized.role === 'assistant' && normalized.runId) {
            setActiveRun(
              normalized.state === 'streaming'
                ? { runId: normalized.runId, startedAt: normalized.createdAt, state: 'streaming' }
                : undefined
            );
          }
        }
      });
      client.onGatewayError(detail => {
        setConnectionState('transport_error');
        setConnectionDetail(detail.message);
      });
      clientRef.current = client;
    }
    return clientRef.current;
  }, []);

  const connect = useCallback(async () => {
    if (!config?.gateway.token) {
      throw new Error('Missing gateway token.');
    }
    const client = ensureClient();
    await client.connect({
      url: config.gateway.url,
      token: config.gateway.token,
      sessionKey,
      minProtocol: 3,
      maxProtocol: 3,
      connectTimeoutMs: config.gateway.connectTimeoutMs,
      requestTimeoutMs: config.gateway.requestTimeoutMs,
    });
  }, [config, ensureClient, sessionKey]);

  const validateToken = useCallback(
    async (token: string) => {
      if (!config) {
        throw new Error('Configuration not loaded.');
      }
      const client = ensureClient();
      await client.disconnect();
      await client.connect({
        url: config.gateway.url,
        token,
        sessionKey,
        minProtocol: 3,
        maxProtocol: 3,
        connectTimeoutMs: config.gateway.connectTimeoutMs,
        requestTimeoutMs: config.gateway.requestTimeoutMs,
      });
      await client.disconnect();
      setConnectionState('idle');
      setConnectionDetail(undefined);
    },
    [config, ensureClient, sessionKey]
  );

  const disconnect = useCallback(async () => {
    await clientRef.current?.disconnect();
    setConnectionState('disconnected');
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!config) {
        throw new Error('Configuration not loaded.');
      }
      const client = ensureClient();
      await connect();
      const clientRequestId = randomId('client');
      setMessages(current => [...current, createLocalUserMessage({ clientRequestId, text })]);
      const response = await client.sendChat({
        sessionKey,
        text,
        thinkingMode,
        clientRequestId,
      });
      setActiveRun({ runId: response.runId, startedAt: Date.now(), state: 'streaming' });
    },
    [config, connect, ensureClient, sessionKey, thinkingMode]
  );

  const abort = useCallback(async () => {
    if (!activeRun) {
      return;
    }
    setActiveRun(current => (current ? { ...current, state: 'aborting' } : current));
    await clientRef.current?.abortRun({ runId: activeRun.runId });
  }, [activeRun]);

  const reloadHistory = useCallback(
    async (limit?: number) => {
      if (!config) {
        throw new Error('Configuration not loaded.');
      }
      const client = ensureClient();
      await connect();
      const history = await client.fetchHistory({
        sessionKey,
        limit: limit ?? config.session.historyLimit,
      });
      setMessages(normalizeHistoryMessages(history as Parameters<typeof normalizeHistoryMessages>[0], thinkingMode));
      setHistoryLoaded(true);
    },
    [config, connect, ensureClient, sessionKey, thinkingMode]
  );

  const switchSession = useCallback(
    async (nextSessionKey: string) => {
      setSessionKey(nextSessionKey);
      setMessages([]);
      setHistoryLoaded(false);
    },
    []
  );

  const clearMessages = useCallback(() => setMessages([]), []);
  const setThinkingMode = useCallback((mode: ThinkingMode) => setThinkingModeState(mode), []);

  const value = useMemo<GatewaySessionContextValue>(
    () => ({
      connectionState,
      connectionDetail,
      sessionKey,
      messages,
      activeRun,
      thinkingMode,
      historyLoaded,
      connect,
      validateToken,
      disconnect,
      sendMessage,
      abortRun: abort,
      clearMessages,
      switchSession,
      setThinkingMode,
      reloadHistory,
      setMessages,
    }),
    [
      connectionState,
      connectionDetail,
      sessionKey,
      messages,
      activeRun,
      thinkingMode,
      historyLoaded,
      connect,
      validateToken,
      disconnect,
      sendMessage,
      abort,
      clearMessages,
      switchSession,
      setThinkingMode,
      reloadHistory,
    ]
  );

  return <GatewaySessionContext.Provider value={value}>{children}</GatewaySessionContext.Provider>;
}

export function useGatewaySessionContext(): GatewaySessionContextValue {
  const value = useContext(GatewaySessionContext);
  if (!value) {
    throw new Error('GatewaySessionContext is not available.');
  }
  return value;
}

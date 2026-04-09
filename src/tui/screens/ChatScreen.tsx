import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Text } from 'ink';
import { ChatComposer } from '../components/ChatComposer.js';
import { ChatHeader } from '../components/ChatHeader.js';
import { MessageViewport } from '../components/MessageViewport.js';
import { Panel } from '../components/Panel.js';
import { Screen } from '../components/Screen.js';
import { Spinner } from '../components/Spinner.js';
import { StatusBar } from '../components/StatusBar.js';
import { useConfigContext } from '../context/ConfigContext.js';
import { useLayout } from '../context/LayoutContext.js';
import { useChatViewport } from '../hooks/useChatViewport.js';
import { useComposer } from '../hooks/useComposer.js';
import { useGatewaySession } from '../hooks/useGatewaySession.js';
import { useKeymap } from '../hooks/useKeymap.js';
import type { ThinkingMode, UiMode } from '../lib/types.js';

const HELP_TEXT = '/help /clear /session /thinking /abort /token /new /quit';

export function ChatScreen({ onQuit, onChangeToken }: { onQuit: () => void; onChangeToken: () => void }) {
  const { config, saveConfig } = useConfigContext();
  const {
    connectionState,
    sessionKey,
    messages,
    activeRun,
    thinkingMode,
    connect,
    sendMessage,
    abortRun,
    clearMessages,
    switchSession,
    setThinkingMode,
    reloadHistory,
    setMessages,
  } = useGatewaySession();
  const { terminalHeight, contentWidth } = useLayout();
  const [mode, setMode] = useState<UiMode>('input');
  const [collapsedThinking] = useState<Record<string, boolean>>({});
  const viewportHeight = Math.max(8, terminalHeight - 8);
  const viewport = useChatViewport(messages, contentWidth - 2, viewportHeight);

  useEffect(() => {
    void connect().catch(() => undefined);
    void reloadHistory().catch(() => undefined);
  }, [connect, reloadHistory]);

  const handleSubmit = useCallback(
    (value: string) => {
      if (value.startsWith('/')) {
        void handleCommand(value);
        return;
      }
      void sendMessage(value);
    },
    [sendMessage]
  );

  const composer = useComposer({
    active: mode === 'input',
    onEscape: () => setMode('scroll'),
    onSubmit: handleSubmit,
  });

  const handleAbortOrQuit = useCallback(() => {
    if (activeRun) {
      void abortRun();
      return;
    }
    onQuit();
  }, [abortRun, activeRun, onQuit]);

  useKeymap({
    mode,
    composerValue: composer.value,
    onSwitchToInput: () => setMode('input'),
    onSwitchToScroll: () => setMode('scroll'),
    onScrollUp: amount => viewport.setTopRow(current => Math.max(0, current - (amount ?? 1))),
    onScrollDown: amount => viewport.setTopRow(current => Math.min(viewport.maxTopRow, current + (amount ?? 1))),
    onScrollTop: () => viewport.setTopRow(0),
    onScrollBottom: () => viewport.setTopRow(viewport.maxTopRow),
    onAbortOrQuit: handleAbortOrQuit,
  });

  async function handleCommand(input: string): Promise<void> {
    const [command, ...rest] = input.slice(1).split(/\s+/).filter(Boolean);
    switch (command) {
      case 'help':
        setMessages(current => [
          ...current,
          {
            id: `system:help:${Date.now()}`,
            role: 'system',
            createdAt: Date.now(),
            state: 'final',
            parts: [{ id: `system:help:${Date.now()}:part:0`, type: 'text', text: HELP_TEXT }],
          },
        ]);
        break;
      case 'clear':
      case 'new':
        clearMessages();
        break;
      case 'session': {
        const nextSession = rest[0] ?? 'main';
        await switchSession(nextSession);
        await reloadHistory();
        if (config) {
          await saveConfig({ ...config, session: { ...config.session, lastSessionKey: nextSession } });
        }
        break;
      }
      case 'thinking': {
        const nextMode = (rest[0] as ThinkingMode | undefined) ?? 'off';
        if (nextMode === 'off' || nextMode === 'concise' || nextMode === 'verbose') {
          setThinkingMode(nextMode);
          if (config) {
            await saveConfig({ ...config, ui: { ...config.ui, thinkingMode: nextMode } });
          }
        }
        break;
      }
      case 'abort':
        await abortRun();
        break;
      case 'token':
        onChangeToken();
        break;
      case 'quit':
      case 'exit':
        onQuit();
        break;
      default:
        break;
    }
  }

  const footer = useMemo(
    () => (
      <Text dimColor>{HELP_TEXT}</Text>
    ),
    []
  );

  return (
    <Screen title="OpsTalk" footer={footer}>
      <ChatHeader sessionKey={sessionKey} connectionState={connectionState} />
      <Panel title="Conversation" borderColor="green" height={viewportHeight + 2}>
        <MessageViewport rows={viewport.visibleRows} />
        {activeRun?.state === 'streaming' ? <Spinner label="Streaming" /> : null}
      </Panel>
      <Box marginTop={1}>
        <Panel title={mode === 'input' ? 'Composer' : 'Scroll Mode'} borderColor={mode === 'input' ? 'cyan' : 'gray'}>
          <ChatComposer value={composer.value} cursor={composer.cursor} active={mode === 'input'} />
        </Panel>
      </Box>
      <StatusBar
        connectionState={connectionState}
        sessionKey={sessionKey}
        mode={mode}
        activeRun={activeRun?.state}
        thinkingMode={thinkingMode}
      />
    </Screen>
  );
}

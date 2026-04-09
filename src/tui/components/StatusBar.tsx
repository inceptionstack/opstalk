import React from 'react';
import { Box, Text } from 'ink';
import type { ConnectionState, ThinkingMode, UiMode } from '../lib/types.js';

export function StatusBar({
  connectionState,
  sessionKey,
  mode,
  activeRun,
  thinkingMode,
}: {
  connectionState: ConnectionState;
  sessionKey: string;
  mode: UiMode;
  activeRun?: string | undefined;
  thinkingMode: ThinkingMode;
}) {
  return (
    <Box justifyContent="space-between">
      <Text dimColor>conn={connectionState}</Text>
      <Text dimColor>session={sessionKey}</Text>
      <Text dimColor>mode={mode}</Text>
      <Text dimColor>run={activeRun ?? 'idle'}</Text>
      <Text dimColor>thinking={thinkingMode}</Text>
    </Box>
  );
}

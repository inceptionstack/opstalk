import React from 'react';
import { Box, Text } from 'ink';
import type { ConnectionState } from '../lib/types.js';

function dotColor(state: ConnectionState): string {
  switch (state) {
    case 'connected':
      return 'green';
    case 'auth_error':
    case 'transport_error':
      return 'red';
    case 'connecting':
    case 'reconnecting':
    case 'authenticating':
      return 'yellow';
    default:
      return 'gray';
  }
}

export function ChatHeader({
  sessionKey,
  connectionState,
}: {
  sessionKey: string;
  connectionState: ConnectionState;
}) {
  return (
    <Box justifyContent="space-between">
      <Text bold color="green">
        OpsTalk
      </Text>
      <Text>
        <Text color={dotColor(connectionState)}>●</Text> {connectionState}  session={sessionKey}
      </Text>
    </Box>
  );
}

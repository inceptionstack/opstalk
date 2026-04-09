import React from 'react';
import { Box, Text } from 'ink';
import type { ChatMessage } from '../lib/types.js';

export function MessageBlock({ message }: { message: ChatMessage }) {
  const color = message.role === 'user' ? 'blue' : message.role === 'error' ? 'red' : message.role === 'system' ? 'yellow' : 'green';
  const text = message.parts.map(part => ('text' in part ? (part as { text: string }).text : '')).join('\n');
  return (
    <Box>
      <Text color={color}>{text}</Text>
    </Box>
  );
}

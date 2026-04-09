import React from 'react';
import { Box, Text } from 'ink';

export function ChatComposer({
  value,
  cursor,
  active,
}: {
  value: string;
  cursor: number;
  active: boolean;
}) {
  const before = value.slice(0, cursor);
  const at = value[cursor] ?? ' ';
  const after = value.slice(cursor + 1);
  return (
    <Box>
      <Text color={active ? 'cyan' : 'gray'}>&gt; </Text>
      <Text>{before}</Text>
      <Text inverse={active}>{at}</Text>
      <Text>{after}</Text>
      {!value ? (
        <Text dimColor>{active ? 'Type a message or /command' : 'Press i to focus input'}</Text>
      ) : null}
    </Box>
  );
}

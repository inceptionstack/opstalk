import React from 'react';
import { Box, Text } from 'ink';

export function ToolUseBlock({ name, argumentsText }: { name: string; argumentsText: string }) {
  return (
    <Box>
      <Text color="cyan">
        tool {name}: <Text dimColor>{argumentsText}</Text>
      </Text>
    </Box>
  );
}

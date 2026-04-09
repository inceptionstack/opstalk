import React from 'react';
import { Box, Text } from 'ink';

export function ToolResultBlock({
  toolName,
  resultText,
  truncated,
}: {
  toolName: string;
  resultText: string;
  truncated: boolean;
}) {
  return (
    <Box>
      <Text dimColor>
        result {toolName}: {resultText}
        {truncated ? ' [truncated]' : ''}
      </Text>
    </Box>
  );
}

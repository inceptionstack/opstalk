import React from 'react';
import { Box, Text } from 'ink';

export function ThinkingBlock({
  text,
  collapsed,
}: {
  text: string;
  collapsed: boolean;
}) {
  if (collapsed) {
    const hiddenLines = text.split('\n').length;
    return (
      <Box>
        <Text color="magenta" dimColor>
          [thinking: {hiddenLines} lines hidden]
        </Text>
      </Box>
    );
  }
  return (
    <Box>
      <Text color="magenta" dimColor>
        {text}
      </Text>
    </Box>
  );
}

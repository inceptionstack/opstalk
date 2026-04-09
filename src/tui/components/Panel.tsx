import React from 'react';
import { Box, Text } from 'ink';

export function Panel({
  title,
  children,
  borderColor,
  flexGrow,
  height,
}: {
  title?: string;
  children: React.ReactNode;
  borderColor?: string;
  flexGrow?: number;
  height?: number;
}) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={borderColor} paddingX={1} height={height} flexGrow={flexGrow}>
      {title ? (
        <Text bold dimColor>
          {title}
        </Text>
      ) : null}
      {children}
    </Box>
  );
}

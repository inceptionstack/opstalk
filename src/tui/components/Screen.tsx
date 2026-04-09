import React from 'react';
import { Box, Text } from 'ink';

export function Screen({
  title,
  children,
  footer,
}: {
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Text bold>{title}</Text>
      {children}
      {footer ? <Box marginTop={1}>{footer}</Box> : null}
    </Box>
  );
}

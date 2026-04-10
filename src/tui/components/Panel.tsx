import React from "react";
import { Box, Text } from "ink";

export function Panel({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} paddingY={0}>
      {title ? <Text bold>{title}</Text> : null}
      {children}
    </Box>
  );
}

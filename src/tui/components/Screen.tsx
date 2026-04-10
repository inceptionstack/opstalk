import React from "react";
import { Box } from "ink";

export function Screen({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <Box flexDirection="column" paddingX={1} paddingY={0}>
      {children}
    </Box>
  );
}

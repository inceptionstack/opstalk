import React from "react";
import { Box, Text } from "ink";

export function ChatComposer(props: {
  value: string;
  cursor: number;
  disabled?: boolean;
}): React.ReactElement {
  const before = props.value.slice(0, props.cursor);
  const current = props.value[props.cursor] ?? " ";
  const after = props.value.slice(props.cursor + 1);

  return (
    <Box flexDirection="column">
      <Text dimColor>Enter to send. Ctrl+J inserts a newline.</Text>
      <Text>
        <Text color="cyan">&gt; </Text>
        <Text>{before}</Text>
        <Text inverse>{current}</Text>
        <Text>{after}</Text>
        {!props.value && <Text dimColor>{props.disabled ? "Streaming..." : "Ask the DevOps Agent"}</Text>}
      </Text>
    </Box>
  );
}

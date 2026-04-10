import React from "react";
import { Box, Text } from "ink";

export function ChatComposer(props: {
  value: string;
  cursor: number;
  disabled?: boolean;
  statusLine?: string;
}): React.ReactElement {
  const before = props.value.slice(0, props.cursor);
  const current = props.value[props.cursor] ?? " ";
  const after = props.value.slice(props.cursor + 1);
  const cols = process.stdout.columns ?? 80;

  return (
    <Box flexDirection="column">
      <Text dimColor>{"─".repeat(cols)}</Text>
      <Box>
        <Text color="cyan">{"› "}</Text>
        {props.value ? (
          <Text>
            {before}
            <Text inverse>{current}</Text>
            {after}
          </Text>
        ) : (
          <Text>
            <Text inverse>{" "}</Text>
            <Text dimColor>{props.disabled ? " streaming..." : " Ask the DevOps Agent"}</Text>
          </Text>
        )}
      </Box>
      <Text dimColor>{"─".repeat(cols)}</Text>
      <Text dimColor>
        {props.statusLine ?? ""}
        {"  "}
        <Text dimColor>enter to send · ctrl+j newline · /help commands</Text>
      </Text>
    </Box>
  );
}

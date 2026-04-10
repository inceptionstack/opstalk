import React from "react";
import { Box, Text } from "ink";

export function StatusBar(props: {
  region: string;
  agentSpaceId?: string;
  executionId?: string;
  status: string;
}): React.ReactElement {
  return (
    <Box justifyContent="space-between">
      <Text dimColor>Region: {props.region}</Text>
      <Text dimColor>Space: {props.agentSpaceId ?? "-"}</Text>
      <Text dimColor>Execution: {props.executionId ?? "-"}</Text>
      <Text dimColor>Status: {props.status}</Text>
    </Box>
  );
}

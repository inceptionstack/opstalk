import React from "react";
import { Box, Text } from "ink";

export function ChatHeader(props: {
  region: string;
  agentSpaceId?: string;
  executionId?: string;
  status: string;
}): React.ReactElement {
  return (
    <Box justifyContent="space-between">
      <Text bold>OpsTalk</Text>
      <Text>
        {props.region} | {props.agentSpaceId ?? "no-space"} | {props.executionId ?? "new"} | {props.status}
      </Text>
    </Box>
  );
}

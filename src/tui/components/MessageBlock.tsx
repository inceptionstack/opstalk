import React from "react";
import { Box, Text } from "ink";

import type { ChatMessage } from "../lib/types.js";
import { AssistantMessage } from "./AssistantMessage.js";

export function MessageBlock({ message }: { message: ChatMessage }): React.ReactElement {
  const label =
    message.role === "user"
      ? <Text color="blue">&gt; </Text>
      : message.role === "error"
        ? <Text color="red">! </Text>
        : null;

  return (
    <Box>
      {label}
      {message.role === "assistant" ? (
        <AssistantMessage text={message.text || (message.streaming ? "…" : "")} />
      ) : message.role === "error" ? (
        <Text color="red">{message.text}</Text>
      ) : message.kind === "json" ? (
        <Text color="cyan">{message.text}</Text>
      ) : (
        <Text>{message.text}</Text>
      )}
    </Box>
  );
}

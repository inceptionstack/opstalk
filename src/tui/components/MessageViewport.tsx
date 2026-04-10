import React from "react";
import { Box } from "ink";

import type { ChatMessage } from "../lib/types.js";
import { Panel } from "./Panel.js";
import { MessageBlock } from "./MessageBlock.js";

export function MessageViewport({
  messages,
  title,
}: {
  messages: ChatMessage[];
  title?: string;
}): React.ReactElement {
  return (
    <Panel title={title}>
      <Box flexDirection="column">
        {messages.map((message) => (
          <MessageBlock key={message.id} message={message} />
        ))}
      </Box>
    </Panel>
  );
}

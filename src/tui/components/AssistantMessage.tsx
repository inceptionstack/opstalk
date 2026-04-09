import React from 'react';
import { Box, Text } from 'ink';
import { ThinkingBlock } from './ThinkingBlock.js';
import { ToolResultBlock } from './ToolResultBlock.js';
import { ToolUseBlock } from './ToolUseBlock.js';
import type { ChatMessage } from '../lib/types.js';

export function AssistantMessage({
  message,
  collapsedThinking,
}: {
  message: ChatMessage;
  collapsedThinking: Record<string, boolean>;
}) {
  return (
    <Box flexDirection="column">
      {message.parts.map(part => {
        if (part.type === 'text') {
          return (
            <Text key={part.id} color="green">
              {part.text}
            </Text>
          );
        }
        if (part.type === 'thinking') {
          return <ThinkingBlock key={part.id} text={part.text} collapsed={collapsedThinking[part.id] ?? part.collapsedByDefault} />;
        }
        if (part.type === 'tool_use') {
          return <ToolUseBlock key={part.id} name={part.name} argumentsText={part.argumentsText} />;
        }
        if (part.type === 'tool_result') {
          return <ToolResultBlock key={part.id} toolName={part.toolName} resultText={part.resultText} truncated={part.truncated} />;
        }
        return null;
      })}
    </Box>
  );
}

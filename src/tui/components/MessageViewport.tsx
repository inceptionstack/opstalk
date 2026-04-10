import React, { useMemo } from "react";
import { Box, Text, useStdout } from "ink";

import type { ChatMessage } from "../lib/types.js";
import { Panel } from "./Panel.js";
import { safeWidth } from "../lib/width.js";
import { wrapText } from "../lib/wrap.js";

interface MessageLine {
  key: string;
  text: string;
  color: string | undefined;
}

function buildLines(messages: ChatMessage[], width: number): MessageLine[] {
  const lines: MessageLine[] = [];

  for (const msg of messages) {
    const color =
      msg.role === "user"
        ? "blue"
        : msg.role === "assistant"
          ? "green"
          : msg.role === "error"
            ? "red"
            : "gray";

    const prefix = msg.role === "user" ? "> " : "";
    const raw = `${prefix}${msg.text}`;
    const wrapped = wrapText(raw, Math.max(10, width));

    for (let i = 0; i < wrapped.length; i++) {
      lines.push({
        key: `${msg.id}:${i}`,
        text: wrapped[i] ?? "",
        color,
      });
    }
  }

  return lines;
}

export function MessageViewport({
  messages,
  title,
  height: heightOverride,
  offset: offsetOverride,
}: {
  messages: ChatMessage[];
  title?: string;
  height?: number;
  offset?: number;
}): React.ReactElement {
  const { stdout } = useStdout();
  const width = safeWidth(stdout?.columns, 80) - 6;
  const viewHeight = heightOverride ?? Math.max(4, (stdout?.rows ?? 24) - 12);

  const allLines = useMemo(() => buildLines(messages, width), [messages, width]);

  // Default offset = stick to bottom
  const maxOffset = Math.max(0, allLines.length - viewHeight);
  const offset = offsetOverride ?? maxOffset;
  const effectiveOffset = Math.min(Math.max(0, offset), maxOffset);

  // Slice visible lines, then pad with empty lines to keep fixed height
  const visible = allLines.slice(effectiveOffset, effectiveOffset + viewHeight);
  const padCount = Math.max(0, viewHeight - visible.length);

  return (
    <Panel title={title}>
      <Box flexDirection="column">
        {visible.map((line) => (
          <Text key={line.key} color={line.color}>
            {line.text}
          </Text>
        ))}
        {Array.from({ length: padCount }, (_, i) => (
          <Text key={`pad-${i}`}>{" "}</Text>
        ))}
      </Box>
    </Panel>
  );
}

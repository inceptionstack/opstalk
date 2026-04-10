import React, { useEffect } from "react";
import { Box, Text, useStdout } from "ink";

import type { ChatMessage } from "../lib/types.js";
import { renderRows, type RenderedRow } from "../lib/renderRows.js";
import { Panel } from "./Panel.js";
import { safeWidth } from "../lib/width.js";

function RowLine({ row }: { row: RenderedRow }): React.ReactElement {
  const color =
    row.message.role === "user"
      ? "blue"
      : row.message.role === "assistant"
        ? "green"
        : row.message.role === "error"
          ? "red"
          : row.message.role === "system"
            ? "gray"
            : undefined;

  return <Text color={color}>{row.line}</Text>;
}

export function MessageViewport({
  messages,
  title,
  height,
  offset,
}: {
  messages: ChatMessage[];
  title?: string;
  height?: number;
  offset?: number;
}): React.ReactElement {
  const { stdout } = useStdout();
  const width = safeWidth(stdout?.columns, 80) - 4;
  const rows = React.useMemo(() => renderRows(messages, width), [messages, width]);

  const effectiveHeight = height ?? Math.max(6, (stdout?.rows ?? 24) - 10);
  const maxOffset = Math.max(0, rows.length - effectiveHeight);
  const effectiveOffset = Math.min(offset ?? maxOffset, maxOffset);
  const visibleRows = rows.slice(effectiveOffset, effectiveOffset + effectiveHeight);

  return (
    <Panel title={title}>
      <Box flexDirection="column" height={effectiveHeight}>
        {visibleRows.map((row) => (
          <RowLine key={row.key} row={row} />
        ))}
      </Box>
    </Panel>
  );
}

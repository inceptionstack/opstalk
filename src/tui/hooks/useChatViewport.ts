import { useInput, useStdout } from "ink";
import { useMemo, useState } from "react";

import { renderRows } from "../lib/renderRows.js";
import type { ChatMessage } from "../lib/types.js";
import { safeWidth } from "../lib/width.js";

export function useChatViewport(messages: ChatMessage[], reservedHeight = 8) {
  const { stdout } = useStdout();
  const width = safeWidth(stdout?.columns, 80) - 2;
  const height = Math.max(6, (stdout?.rows ?? 24) - reservedHeight);
  const rows = useMemo(() => renderRows(messages, width), [messages, width]);
  const [offset, setOffset] = useState(0);
  const maxOffset = Math.max(0, rows.length - height);
  const effectiveOffset = Math.min(offset, maxOffset);
  const visibleRows = rows.slice(effectiveOffset, effectiveOffset + height);

  useInput((_input, key) => {
    if (key.pageUp || key.upArrow) {
      setOffset((current) => Math.max(0, current - 1));
    }

    if (key.pageDown || key.downArrow) {
      setOffset((current) => Math.min(maxOffset, current + 1));
    }
  });

  return {
    width,
    height,
    rows: visibleRows,
    offset: effectiveOffset,
    maxOffset,
    stickToBottom(): void {
      setOffset(maxOffset);
    },
  };
}

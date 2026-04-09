import { useEffect, useMemo, useRef, useState } from 'react';
import { renderRows } from '../lib/renderRows.js';
import type { ChatMessage } from '../lib/types.js';

export function useChatViewport(messages: ChatMessage[], width: number, height: number) {
  const rows = useMemo(() => renderRows(messages, width), [messages, width]);
  const [topRow, setTopRow] = useState(0);
  const maxTopRow = Math.max(0, rows.length - height);
  const previousRowCountRef = useRef(rows.length);

  useEffect(() => {
    const previousRowCount = previousRowCountRef.current;
    previousRowCountRef.current = rows.length;
    setTopRow(current => {
      const previousMaxTopRow = Math.max(0, previousRowCount - height);
      if (current >= previousMaxTopRow) {
        return maxTopRow;
      }
      return Math.min(current, maxTopRow);
    });
  }, [height, maxTopRow, rows.length]);

  const visibleRows = rows.slice(Math.min(topRow, maxTopRow), Math.min(topRow, maxTopRow) + height);

  return {
    rows,
    visibleRows,
    topRow: Math.min(topRow, maxTopRow),
    maxTopRow,
    setTopRow,
  };
}

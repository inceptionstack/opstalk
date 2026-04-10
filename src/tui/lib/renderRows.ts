import type { ChatMessage } from "./types.js";
import { wrapText } from "./wrap.js";

export interface RenderedRow {
  key: string;
  message: ChatMessage;
  line: string;
}

export function renderRows(messages: ChatMessage[], width: number): RenderedRow[] {
  const rows: RenderedRow[] = [];

  for (const message of messages) {
    const prefix = message.role === "user" ? "> " : message.role === "error" ? "! " : "";
    const lines = wrapText(`${prefix}${message.text}`, Math.max(10, width));

    lines.forEach((line, index) => {
      rows.push({
        key: `${message.id}:${index}`,
        message,
        line,
      });
    });
  }

  return rows;
}

import type { ChatMessage } from "./types.js";
import { wrapText } from "./wrap.js";

export interface RenderedRow {
  key: string;
  message: ChatMessage;
  line: string;
}

function formatToolMessage(msg: ChatMessage): string {
  // Show as: → tool_name(args)
  if (msg.toolName) {
    let inputSummary = "";
    if (msg.toolInput) {
      try {
        const input = JSON.parse(msg.toolInput) as Record<string, unknown>;
        inputSummary = Object.entries(input)
          .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
          .join(", ");
      } catch {
        inputSummary = msg.toolInput;
      }
    }
    const icon = msg.toolStatus === "success" ? "✓" : msg.toolStatus === "error" ? "✗" : "…";
    return `  → ${msg.toolName}(${inputSummary}) ${icon}`;
  }

  // Fallback: just show the summary text without "Done"
  return (msg.text || "").replace(/\s*Done\s*$/g, "").trim();
}

export function renderRows(messages: ChatMessage[], width: number): RenderedRow[] {
  const rows: RenderedRow[] = [];
  let prevRole: string | undefined;

  for (let mi = 0; mi < messages.length; mi++) {
    const message = messages[mi]!;

    // Add blank line between message groups (user→assistant transition, or between user messages)
    if (mi > 0 && (message.role === "user" || (prevRole === "user" && message.kind !== "tool"))) {
      rows.push({
        key: `spacer-${message.id}`,
        message,
        line: "",
      });
    }

    let raw: string;
    let prefix: string;

    if (message.kind === "tool") {
      raw = formatToolMessage(message);
      prefix = "";  // tool lines are already indented
    } else if (message.role === "user") {
      raw = message.text;
      prefix = "> ";
    } else {
      raw = message.text;
      prefix = "";
    }

    const lines = wrapText(`${prefix}${raw}`, Math.max(10, width));

    lines.forEach((line, index) => {
      rows.push({
        key: `${message.id}:${index}`,
        message,
        line,
      });
    });

    prevRole = message.role;
  }

  return rows;
}

import type { ChatMessage } from "./types.js";
import { wrapText } from "./wrap.js";

export interface RenderedRow {
  key: string;
  message: ChatMessage;
  line: string;
}

function formatToolMessage(msg: ChatMessage): string {
  const parts: string[] = [];

  // Show the human-readable summary text (without "Done" suffix)
  const summary = (msg.text || "").replace(/\s*Done\s*$/, "").trim();
  if (summary) {
    parts.push(summary);
  }

  // Show tool call
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
    parts.push(`  🔧 ${msg.toolName}(${inputSummary})`);
  }

  // Show result
  if (msg.toolStatus) {
    const icon = msg.toolStatus === "success" ? "✅" : "❌";
    let resultDisplay = msg.toolResult || msg.toolStatus;
    if (resultDisplay.length > 100) {
      resultDisplay = resultDisplay.slice(0, 97) + "...";
    }
    parts.push(`  ${icon} ${resultDisplay}`);
  }

  return parts.join("\n");
}

export function renderRows(messages: ChatMessage[], width: number): RenderedRow[] {
  const rows: RenderedRow[] = [];

  for (let mi = 0; mi < messages.length; mi++) {
    const message = messages[mi]!;

    // Add blank line between messages (not before first)
    if (mi > 0) {
      rows.push({
        key: `spacer-${message.id}`,
        message,
        line: "",
      });
    }

    // Role icon prefix for first line of each message
    const icon =
      message.role === "user"
        ? "💬 "
        : message.role === "assistant" && message.kind === "tool"
          ? "⚙️  "
          : message.role === "assistant"
            ? "🤖 "
            : message.role === "error"
              ? "❌ "
              : "ℹ️  ";

    let raw: string;
    if (message.kind === "tool") {
      raw = formatToolMessage(message);
    } else {
      raw = message.text;
    }

    const lines = wrapText(raw, Math.max(10, width - 4));

    lines.forEach((line, index) => {
      const prefix = index === 0 ? icon : "   ";
      rows.push({
        key: `${message.id}:${index}`,
        message,
        line: `${prefix}${line}`,
      });
    });
  }

  return rows;
}

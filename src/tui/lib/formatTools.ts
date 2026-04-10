/**
 * Parse and format tool_call / tool_result JSON fragments embedded in message text.
 * Returns formatted text with tool calls shown as:
 *   🔧 tool_name(arg1, arg2, ...)
 *   ✅ result summary
 */
export function formatToolBlocks(text: string): string {
  // Match tool_call JSON blocks
  let result = text.replace(
    /\{"type":\s*"tool_call"[^}]*"name":\s*"([^"]*)"[^}]*"input":\s*(\{[^}]*\})\s*\}/g,
    (_match, name: string, inputJson: string) => {
      try {
        const input = JSON.parse(inputJson) as Record<string, unknown>;
        const args = Object.entries(input)
          .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
          .join(", ");
        return `\n🔧 ${name}(${args})`;
      } catch {
        return `\n🔧 ${name}(...)`;
      }
    },
  );

  // Match tool_result JSON blocks
  result = result.replace(
    /\{"type":\s*"tool_result"[^}]*"status":\s*"([^"]*)"[^}]*"content":\s*\[([^\]]*)\]\s*\}/g,
    (_match, status: string, contentStr: string) => {
      let summary = "";
      try {
        // contentStr looks like: {"text": "..."}
        const textMatch = /"text":\s*"([^"]*(?:\\.[^"]*)*)"/.exec(contentStr);
        if (textMatch?.[1]) {
          const parsed = JSON.parse(`"${textMatch[1]}"`) as string;
          // Try to parse the inner JSON for a cleaner display
          try {
            const inner = JSON.parse(parsed) as Record<string, unknown>;
            summary = JSON.stringify(inner, null, 0);
            if (summary.length > 120) {
              summary = summary.slice(0, 117) + "...";
            }
          } catch {
            summary = parsed.length > 120 ? parsed.slice(0, 117) + "..." : parsed;
          }
        }
      } catch {
        summary = "...";
      }
      const icon = status === "success" ? "✅" : "❌";
      return `\n${icon} ${summary || status}`;
    },
  );

  // Clean up "Done" that often follows tool results
  result = result.replace(/\n?Done\s*$/, "");

  return result;
}

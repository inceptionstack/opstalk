import { marked } from "marked";
import { markedTerminal } from "marked-terminal";

marked.use(markedTerminal({
  showSectionPrefix: false,
  reflowText: true,
  tab: 2,
}));

export function renderMarkdown(text: string): string {
  try {
    const result = marked(text);
    if (typeof result === "string") {
      // Trim trailing newlines
      return result.replace(/\n+$/, "");
    }
    return text;
  } catch {
    return text;
  }
}

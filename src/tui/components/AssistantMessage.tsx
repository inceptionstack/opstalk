import React from "react";
import { Text } from "ink";

import { getRenderedMarkdownLines, renderMarkdown } from "../lib/markdown.js";

export function AssistantMessage({ text }: { text: string }): React.ReactElement {
  const rendered = renderMarkdown(text);
  const lines = getRenderedMarkdownLines(rendered);

  return (
    <>
      {lines.map((line, index) => {
        const isMermaidBox = line.text.includes("📊 Mermaid") || /^[┌│└]/.test(line.text.trimStart());
        const color = isMermaidBox ? "cyan" : "green";
        return (
          <Text key={`${index}:${line.text.slice(0, 40)}`} color={color}>{line.text}</Text>
        );
      })}
    </>
  );
}

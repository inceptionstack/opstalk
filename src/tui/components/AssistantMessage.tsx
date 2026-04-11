import React from "react";
import { Text } from "ink";

import { getRenderedMarkdownLines, renderMarkdown } from "../lib/markdown.js";

export function AssistantMessage({ text }: { text: string }): React.ReactElement {
  const rendered = renderMarkdown(text);
  const lines = getRenderedMarkdownLines(rendered);

  return (
    <>
      {lines.map((line, index) => {
        const isMermaidInfo = line.text.startsWith("📊 Mermaid diagram");
        const isMermaidSource = line.text.trimStart().startsWith("mermaid>");
        const color = (isMermaidInfo || isMermaidSource) ? "cyan" : "green";
        return (
          <Text key={`${index}:${line.text.slice(0, 40)}`} color={color} dimColor={isMermaidSource}>{line.text}</Text>
        );
      })}
    </>
  );
}

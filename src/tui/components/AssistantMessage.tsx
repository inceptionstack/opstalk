import React from "react";
import { Text } from "ink";

import { getRenderedMarkdownLines, renderMarkdown } from "../lib/markdown.js";

export function AssistantMessage({ text }: { text: string }): React.ReactElement {
  const rendered = renderMarkdown(text);
  const lines = getRenderedMarkdownLines(rendered);

  return (
    <>
      {lines.map((line, index) => (
        <Text key={`${index}:${line.text}`} color="green" dimColor={line.dim}>{line.text}</Text>
      ))}
    </>
  );
}

import React from "react";
import { Text } from "ink";

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  const patterns: Array<{ regex: RegExp; render: (value: string) => React.ReactNode }> = [
    { regex: /\*\*(.+?)\*\*/, render: (value) => <Text key={key++} bold>{value}</Text> },
    { regex: /\*(.+?)\*/, render: (value) => <Text key={key++} italic>{value}</Text> },
    { regex: /`(.+?)`/, render: (value) => <Text key={key++} color="yellow">{value}</Text> },
  ];

  while (remaining.length > 0) {
    let matched = false;

    for (const pattern of patterns) {
      const match = pattern.regex.exec(remaining);

      if (!match || match.index === undefined) {
        continue;
      }

      if (match.index > 0) {
        nodes.push(<Text key={key++}>{remaining.slice(0, match.index)}</Text>);
      }

      nodes.push(pattern.render(match[1] ?? ""));
      remaining = remaining.slice(match.index + match[0].length);
      matched = true;
      break;
    }

    if (!matched) {
      nodes.push(<Text key={key++}>{remaining}</Text>);
      break;
    }
  }

  return nodes;
}

export function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split("\n");

  return (
    <>
      {lines.map((line, index) => {
        const trimmed = line.trim();
        const prefix = trimmed.startsWith("- ") ? "• " : "";
        const content = trimmed.startsWith("- ") ? trimmed.slice(2) : line;

        return (
          <Text key={`${index}:${line}`}>
            {prefix}
            {renderInline(content)}
          </Text>
        );
      })}
    </>
  );
}

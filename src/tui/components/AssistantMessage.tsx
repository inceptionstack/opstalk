import React from "react";
import { Text } from "ink";

import { renderMarkdown } from "../lib/markdown.js";

export function AssistantMessage({ text }: { text: string }): React.ReactElement {
  return <Text color="green">{renderMarkdown(text)}</Text>;
}

import { marked } from "marked";
import { markedTerminal } from "marked-terminal";

import { ensureMermaidBrowserOpen, extractMermaidBlocks, type MermaidOpenState } from "./mermaid.js";

marked.use(markedTerminal({
  showSectionPrefix: false,
  reflowText: true,
  tab: 2,
  // Suppress "Could not find the language 'mermaid'" warnings from cli-highlight.
  // We handle mermaid blocks ourselves; any that leak through (e.g. during streaming)
  // should render as plain indented text, not trigger console warnings.
  highlight: (code: string, _lang: string) => code,
}));

export interface MarkdownRenderOptions {
  mermaidTitle?: string;
}

export interface RenderedMarkdownLine {
  text: string;
  dim: boolean;
}

function buildMermaidTitle(baseTitle: string | undefined, blockIndex: number, totalBlocks: number): string | undefined {
  if (!baseTitle) {
    return totalBlocks > 1 ? `Mermaid Diagram ${blockIndex + 1}` : undefined;
  }
  return totalBlocks > 1 ? `${baseTitle} (${blockIndex + 1})` : baseTitle;
}

/**
 * Preprocess text: extract mermaid blocks, create browser-ready HTML files,
 * and replace the fenced blocks with a placeholder. Mermaid source lines are
 * re-attached AFTER the marked pass to avoid mangling.
 */
function preprocessMermaidMarkdown(text: string, options?: MarkdownRenderOptions): {
  markedText: string;
  mermaidSections: Array<{ state: MermaidOpenState; sourceLines: string[] }>;
  states: MermaidOpenState[];
} {
  const mermaidBlocks = extractMermaidBlocks(text);
  if (mermaidBlocks.length === 0) {
    return { markedText: text, mermaidSections: [], states: [] };
  }

  const mermaidSections: Array<{ state: MermaidOpenState; sourceLines: string[] }> = [];
  const states: MermaidOpenState[] = [];
  let processedText = text;

  // Walk in reverse so indices stay valid
  for (let i = mermaidBlocks.length - 1; i >= 0; i--) {
    const block = mermaidBlocks[i]!;
    const title = buildMermaidTitle(options?.mermaidTitle, i, mermaidBlocks.length);
    const state = ensureMermaidBrowserOpen(block.mermaidCode, title);
    states.unshift(state);
    mermaidSections.unshift({
      state,
      sourceLines: block.mermaidCode.split(/\r?\n/),
    });

    const before = processedText.slice(0, block.index);
    const after = processedText.slice(block.index);
    const fenceMatch = /```mermaid[^\S\r\n]*\r?\n[\s\S]*?```/.exec(after);
    if (fenceMatch) {
      const placeholder = `\n\nMERMAIDPLACEHOLDER${i}XEND\n\n`;
      processedText = before + placeholder + after.slice(fenceMatch[0].length);
    }
  }

  return { markedText: processedText, mermaidSections, states };
}

export function getRenderedMarkdownLines(text: string): RenderedMarkdownLine[] {
  return text.split("\n").map((line) => ({
    text: line,
    dim: false,
  }));
}

export function renderMarkdown(text: string, options?: MarkdownRenderOptions): string {
  try {
    const { markedText, mermaidSections } = preprocessMermaidMarkdown(text, options);
    let result = marked(markedText);
    if (typeof result !== "string") {
      return text;
    }

    // Replace placeholders with mermaid info blocks (NOT passed through marked)
    for (let i = 0; i < mermaidSections.length; i++) {
      const section = mermaidSections[i]!;
      const placeholder = `MERMAIDPLACEHOLDER${i}XEND`;
      const filePath = section.state.filePath;
      const fileName = filePath.split("/").pop() ?? filePath;
      const fileUrl = `file://${encodeURI(filePath)}`;

      const infoBlock = [
        `┌─ 📊 Mermaid Diagram ──────────────────────`,
        `│  ${fileName}`,
        `│  ${fileUrl}`,
        `└────────────────────────────────────────────`,
      ].join("\n");

      result = result.replace(placeholder, infoBlock);
    }

    return result.replace(/\n+$/, "");
  } catch {
    return text;
  }
}

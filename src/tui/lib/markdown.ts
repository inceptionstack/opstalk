import { marked } from "marked";
import { markedTerminal } from "marked-terminal";

import { ensureMermaidBrowserOpen, extractMermaidBlocks, type MermaidOpenState } from "./mermaid.js";

marked.use(markedTerminal({
  showSectionPrefix: false,
  reflowText: true,
  tab: 2,
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
 * Preprocess text: extract mermaid blocks, create browser-ready HTML files (without auto-opening),
 * and replace the fenced blocks with a simple placeholder. The mermaid source lines are NOT
 * passed through marked — they're re-attached after rendering to avoid mangling.
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
      // Replace with a unique placeholder that marked won't mangle
      const placeholder = `\n\n_MERMAID_PLACEHOLDER_${i}_\n\n`;
      processedText = before + placeholder + after.slice(fenceMatch[0].length);
    }
  }

  return { markedText: processedText, mermaidSections, states };
}

export function preprocessMermaid(text: string, options?: MarkdownRenderOptions): { text: string; states: MermaidOpenState[] } {
  const result = preprocessMermaidMarkdown(text, options);
  return { text: result.markedText, states: result.states };
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
      const placeholder = `_MERMAID_PLACEHOLDER_${i}_`;
      const filePath = section.state.filePath;
      const fileUrl = `file://${filePath}`;

      const infoBlock = [
        `📊 Mermaid diagram rendered → ${fileUrl}`,
        ...section.sourceLines.map((line) => `  mermaid> ${line}`),
      ].join("\n");

      result = result.replace(placeholder, infoBlock);
    }

    return result.replace(/\n+$/, "");
  } catch {
    return text;
  }
}

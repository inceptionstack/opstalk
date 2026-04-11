import { marked } from "marked";
import { markedTerminal } from "marked-terminal";

import { ensureMermaidBrowserOpen, extractMermaidBlocks, type MermaidOpenState } from "./mermaid.js";

marked.use(markedTerminal({
  showSectionPrefix: false,
  reflowText: true,
  tab: 2,
}));

const MERMAID_DIM_PREFIX = "[[OPSTALK_MERMAID_DIM]]";
const MERMAID_DIM_SUFFIX = "[[/OPSTALK_MERMAID_DIM]]";

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

function renderMermaidSourceLines(mermaidCode: string): string[] {
  const sourceLines = mermaidCode.split(/\r?\n/);
  return sourceLines.map((line) => `${MERMAID_DIM_PREFIX}mermaid> ${line}${MERMAID_DIM_SUFFIX}`);
}

function preprocessMermaidMarkdown(text: string, options?: MarkdownRenderOptions): { text: string; states: MermaidOpenState[] } {
  const mermaidBlocks = extractMermaidBlocks(text);
  if (mermaidBlocks.length === 0) {
    return { text, states: [] };
  }

  const states: MermaidOpenState[] = [];
  // Walk blocks in reverse so string indices stay valid after replacement
  let processedText = text;
  for (let i = mermaidBlocks.length - 1; i >= 0; i--) {
    const block = mermaidBlocks[i]!;
    const title = buildMermaidTitle(options?.mermaidTitle, i, mermaidBlocks.length);
    const state = ensureMermaidBrowserOpen(block.mermaidCode, title);
    states.unshift(state);

    // Find the full fenced block around this index
    const before = processedText.slice(0, block.index);
    const after = processedText.slice(block.index);
    const fenceMatch = /```mermaid[^\S\r\n]*\r?\n[\s\S]*?```/.exec(after);
    if (fenceMatch) {
      const replacement = [
        "[📊 Mermaid diagram - opening in browser...]",
        ...renderMermaidSourceLines(block.mermaidCode),
      ].join("\n");
      processedText = before + replacement + after.slice(fenceMatch[0].length);
    }
  }

  return { text: processedText, states };
}

export function preprocessMermaid(text: string, options?: MarkdownRenderOptions): { text: string; states: MermaidOpenState[] } {
  return preprocessMermaidMarkdown(text, options);
}

export function getRenderedMarkdownLines(text: string): RenderedMarkdownLine[] {
  return text.split("\n").map((line) => ({
    text: line.replace(MERMAID_DIM_PREFIX, "").replace(MERMAID_DIM_SUFFIX, ""),
    dim: line.includes(MERMAID_DIM_PREFIX),
  }));
}

export function renderMarkdown(text: string, options?: MarkdownRenderOptions): string {
  try {
    const preprocessed = preprocessMermaidMarkdown(text, options).text;
    const result = marked(preprocessed);
    if (typeof result === "string") {
      // Trim trailing newlines
      return result.replace(/\n+$/, "");
    }
    return text;
  } catch {
    return text;
  }
}

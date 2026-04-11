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
const MERMAID_BLOCK_REGEX = /```mermaid[^\S\r\n]*\r?\n([\s\S]*?)```/g;

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

  let blockIndex = 0;
  const states: MermaidOpenState[] = [];
  const processedText = text.replace(MERMAID_BLOCK_REGEX, (_match, rawCode: string) => {
    const mermaidCode = rawCode.trim();
    const title = buildMermaidTitle(options?.mermaidTitle, blockIndex, mermaidBlocks.length);
    const state = ensureMermaidBrowserOpen(mermaidCode, title);
    states.push(state);
    blockIndex += 1;

    return [
      "[📊 Mermaid diagram - opening in browser...]",
      ...renderMermaidSourceLines(mermaidCode),
    ].join("\n");
  });

  return { text: processedText, states };
}

export function getMarkdownMermaidStates(text: string, options?: MarkdownRenderOptions): MermaidOpenState[] {
  return preprocessMermaidMarkdown(text, options).states;
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

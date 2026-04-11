import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export interface MermaidOpenState {
  key: string;
  mermaidCode: string;
  title?: string;
  filePath: string;
  status: "opening" | "opened" | "error";
  error?: string;
}

const MERMAID_BLOCK_REGEX = /```mermaid[^\S\r\n]*\r?\n([\s\S]*?)```/g;
const openStateCache = new Map<string, MermaidOpenState>();
let mermaidFileCounter = 0;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeMermaidCode(mermaidCode: string): string {
  return mermaidCode.replace(/^\s+|\s+$/g, "");
}

/**
 * Sanitize mermaid code to fix common issues that cause parse failures.
 * - `default` is a reserved keyword in mermaid; rename subgraph/node IDs that use it.
 * - Other reserved words: `end`, `graph`, `subgraph`, `style`, `class`, `click`.
 *   We only fix `default` since it's the most common AI-generated collision.
 */
function sanitizeMermaidCode(code: string): string {
  // Replace `subgraph default[` or `subgraph default ` with `subgraph defaultVpc[` etc.
  // Only replace bare `default` used as a node/subgraph ID, not inside strings
  let result = code;
  // Fix subgraph default → subgraph _default
  result = result.replace(/\bsubgraph\s+default\b/g, "subgraph _default");
  // Fix references to the renamed node (standalone `default` at start of connection lines)
  // e.g. `default -->` or `--> default`
  result = result.replace(/^(\s*)default(\s*[-<>.~=|])/gm, "$1_default$2");
  result = result.replace(/([-<>.~=|]\s*)default(\s*)$/gm, "$1_default$2");
  return result;
}

function buildMermaidHtml(mermaidCode: string, title?: string): string {
  const safeTitle = title ? escapeHtml(title) : "";
  const sanitizedCode = sanitizeMermaidCode(mermaidCode);
  const escapedCode = JSON.stringify(sanitizedCode);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle || "Mermaid Diagram"}</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #1a1a2e;
      --panel: #16213e;
      --panel-border: #26406b;
      --text: #e8eefc;
      --muted: #96a0bf;
      --accent: #66d9ef;
      --accent-strong: #7ee787;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at top, rgba(102, 217, 239, 0.12), transparent 40%),
        linear-gradient(180deg, #1d2340 0%, var(--bg) 100%);
      color: var(--text);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .page {
      max-width: 1200px;
      margin: 0 auto;
      padding: 32px 24px 40px;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      margin-bottom: 24px;
    }

    h1 {
      margin: 0;
      font-size: 1.4rem;
      font-weight: 700;
    }

    .subtitle {
      margin-top: 6px;
      color: var(--muted);
      font-size: 0.95rem;
    }

    button {
      border: 1px solid var(--panel-border);
      border-radius: 10px;
      background: linear-gradient(180deg, rgba(102, 217, 239, 0.18), rgba(102, 217, 239, 0.08));
      color: var(--text);
      padding: 10px 14px;
      font-size: 0.95rem;
      cursor: pointer;
    }

    button:hover {
      border-color: var(--accent);
    }

    .layout {
      display: grid;
      grid-template-columns: minmax(0, 3fr) minmax(280px, 1fr);
      gap: 20px;
    }

    .panel {
      background: rgba(22, 33, 62, 0.9);
      border: 1px solid rgba(38, 64, 107, 0.85);
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.24);
      overflow: hidden;
    }

    .diagram {
      padding: 24px;
      min-height: 240px;
      overflow: auto;
    }

    .source {
      padding: 18px 20px 20px;
      border-top: 1px solid rgba(38, 64, 107, 0.75);
    }

    .label {
      margin: 0 0 12px;
      color: var(--muted);
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      color: var(--accent-strong);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.9rem;
      line-height: 1.45;
    }

    .error {
      color: #ff9aa2;
      padding: 20px 24px;
    }

    @media (max-width: 900px) {
      .layout {
        grid-template-columns: 1fr;
      }

      .header {
        flex-direction: column;
        align-items: flex-start;
      }
    }
  </style>
</head>
<body>
  <main class="page">
    <section class="header">
      <div>
        ${safeTitle ? `<h1>${safeTitle}</h1>` : "<h1>Mermaid Diagram</h1>"}
        <div class="subtitle">Rendered with Mermaid dark theme</div>
      </div>
      <button id="copy-source" type="button">Copy Mermaid Source</button>
    </section>

    <section class="layout">
      <article class="panel">
        <div class="diagram" id="diagram">Rendering diagram...</div>
      </article>

      <aside class="panel">
        <div class="source">
          <p class="label">Source</p>
          <pre id="source"></pre>
        </div>
      </aside>
    </section>
  </main>

  <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
  <script>
    const mermaidSource = ${escapedCode};
    const sourceElement = document.getElementById("source");
    const diagramElement = document.getElementById("diagram");
    const copyButton = document.getElementById("copy-source");

    if (sourceElement) {
      sourceElement.textContent = mermaidSource;
    }

    if (copyButton) {
      copyButton.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(mermaidSource);
          copyButton.textContent = "Copied";
          window.setTimeout(() => {
            copyButton.textContent = "Copy Mermaid Source";
          }, 1600);
        } catch {
          copyButton.textContent = "Copy failed";
          window.setTimeout(() => {
            copyButton.textContent = "Copy Mermaid Source";
          }, 1600);
        }
      });
    }

    async function renderDiagram() {
      try {
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          securityLevel: "strict",
        });
        const renderId = "mermaid-diagram-" + Date.now();
        const { svg } = await mermaid.render(renderId, mermaidSource);
        if (diagramElement) {
          diagramElement.innerHTML = svg;
        }
      } catch (error) {
        if (diagramElement) {
          diagramElement.innerHTML = "";
        }
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorNode = document.createElement("div");
        errorNode.className = "error";
        errorNode.textContent = "Mermaid render failed: " + errorMessage;
        if (diagramElement) {
          diagramElement.appendChild(errorNode);
        }
      }
    }

    void renderDiagram();
  </script>
</body>
</html>`;
}

function createMermaidFilePath(): string {
  mermaidFileCounter += 1;
  return path.join(tmpdir(), `opstalk-mermaid-${Date.now()}-${mermaidFileCounter}.html`);
}

function startOpen(state: MermaidOpenState): void {
  const html = buildMermaidHtml(state.mermaidCode, state.title);

  void writeFile(state.filePath, html, "utf8")
    .then(() => {
      state.status = "opened";
    })
    .catch((error: unknown) => {
      state.status = "error";
      state.error = error instanceof Error ? error.message : String(error);
    });
}

function buildKey(mermaidCode: string, title?: string): string {
  return createHash("sha1")
    .update(title ?? "")
    .update("\u0000")
    .update(mermaidCode)
    .digest("hex");
}

export function extractMermaidBlocks(text: string): { mermaidCode: string; index: number }[] {
  const blocks: { mermaidCode: string; index: number }[] = [];

  for (const match of text.matchAll(MERMAID_BLOCK_REGEX)) {
    const fullMatch = match[0];
    const mermaidCode = normalizeMermaidCode(match[1] ?? "");
    const index = match.index ?? text.indexOf(fullMatch);
    blocks.push({ mermaidCode, index });
  }

  return blocks;
}

export function ensureMermaidBrowserOpen(mermaidCode: string, title?: string): MermaidOpenState {
  const normalizedCode = normalizeMermaidCode(mermaidCode);
  const key = buildKey(normalizedCode, title);
  const existing = openStateCache.get(key);
  if (existing) {
    return existing;
  }

  const state: MermaidOpenState = {
    key,
    mermaidCode: normalizedCode,
    title,
    filePath: createMermaidFilePath(),
    status: "opening",
  };
  openStateCache.set(key, state);
  startOpen(state);
  return state;
}


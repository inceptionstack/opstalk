/**
 * Convert markdown text to terminal-friendly plain text with ANSI markers.
 * We use simple markers that the viewport renderer can pick up:
 * - ### headers → UPPERCASE with underline
 * - **bold** → kept as-is (Ink Text handles it)
 * - | tables → cleaned up with padding
 * - - bullets → • bullets
 * - ``` code blocks → indented
 */

interface StyledSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  dim?: boolean;
  color?: string;
}

export interface StyledLine {
  segments: StyledSegment[];
}

// Format markdown table rows: align columns by padding
export function formatTableRows(lines: string[]): string[] {
  // Find all table row lines (contain |)
  const tableRanges: Array<{ start: number; end: number }> = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i]!.includes("|")) {
      const start = i;
      while (i < lines.length && lines[i]!.includes("|")) {
        i++;
      }
      tableRanges.push({ start, end: i });
    } else {
      i++;
    }
  }

  if (tableRanges.length === 0) return lines;

  const result = [...lines];

  for (const range of tableRanges) {
    // Parse each row into cells
    const rows: string[][] = [];
    const separatorIndices: number[] = [];

    for (let r = range.start; r < range.end; r++) {
      const line = result[r]!;
      // Check if it's a separator line (|---|---|)
      if (/^\|[\s\-:|]+\|$/.test(line.trim())) {
        separatorIndices.push(r - range.start);
        rows.push([]);
        continue;
      }
      const cells = line.split("|")
        .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1)
        .map((c) => c.trim());
      if (cells.length === 0) {
        // Fallback: split by | including edges
        const allCells = line.split("|").map((c) => c.trim()).filter(Boolean);
        rows.push(allCells);
      } else {
        rows.push(cells);
      }
    }

    // Find max width per column
    const maxCols = Math.max(...rows.map((r) => r.length));
    const colWidths: number[] = Array(maxCols).fill(0) as number[];
    for (const row of rows) {
      for (let c = 0; c < row.length; c++) {
        colWidths[c] = Math.max(colWidths[c] ?? 0, (row[c] ?? "").length);
      }
    }

    // Rebuild formatted lines
    let rowIdx = 0;
    for (let r = range.start; r < range.end; r++) {
      if (separatorIndices.includes(rowIdx)) {
        // Rebuild separator
        const sep = colWidths.map((w) => "─".repeat(w + 2)).join("┼");
        result[r] = `├${sep}┤`;
      } else {
        const cells = rows[rowIdx]!;
        const padded = colWidths.map((w, ci) => {
          const cell = cells[ci] ?? "";
          return ` ${cell.padEnd(w)} `;
        }).join("│");
        result[r] = `│${padded}│`;
      }
      rowIdx++;
    }
  }

  return result;
}

export function parseMarkdownLine(line: string): StyledLine {
  const trimmed = line.trimStart();
  const indent = line.length - trimmed.length;
  const indentStr = " ".repeat(indent);

  // Headers
  if (trimmed.startsWith("### ")) {
    return { segments: [{ text: `${indentStr}${trimmed.slice(4)}`, bold: true }] };
  }
  if (trimmed.startsWith("## ")) {
    return { segments: [{ text: `${indentStr}${trimmed.slice(3)}`, bold: true }] };
  }
  if (trimmed.startsWith("# ")) {
    return { segments: [{ text: `${indentStr}${trimmed.slice(2)}`, bold: true }] };
  }

  // Horizontal rule
  if (/^-{3,}$/.test(trimmed) || /^\*{3,}$/.test(trimmed)) {
    return { segments: [{ text: "─".repeat(40), dim: true }] };
  }

  // Table separator lines (|---|---|)
  if (/^\|[\s\-:|]+\|$/.test(trimmed)) {
    return { segments: [{ text: `${indentStr}${"─".repeat(40)}`, dim: true }] };
  }

  // Bullet points
  let processLine = line;
  if (trimmed.startsWith("- ")) {
    processLine = `${indentStr}• ${trimmed.slice(2)}`;
  } else if (trimmed.startsWith("* ")) {
    processLine = `${indentStr}• ${trimmed.slice(2)}`;
  }

  // Parse inline formatting
  return { segments: parseInlineFormatting(processLine) };
}

function parseInlineFormatting(text: string): StyledSegment[] {
  const segments: StyledSegment[] = [];
  let remaining = text;

  const patterns: Array<{
    regex: RegExp;
    style: Partial<StyledSegment>;
    group: number;
  }> = [
    { regex: /\*\*(.+?)\*\*/, style: { bold: true }, group: 1 },
    { regex: /\*(.+?)\*/, style: { italic: true }, group: 1 },
    { regex: /`(.+?)`/, style: { code: true, color: "yellow" }, group: 1 },
  ];

  while (remaining.length > 0) {
    let earliest: { index: number; match: RegExpExecArray; style: Partial<StyledSegment>; group: number } | null = null;

    for (const pattern of patterns) {
      const match = pattern.regex.exec(remaining);
      if (match && match.index !== undefined) {
        if (!earliest || match.index < earliest.index) {
          earliest = { index: match.index, match, style: pattern.style, group: pattern.group };
        }
      }
    }

    if (!earliest) {
      segments.push({ text: remaining });
      break;
    }

    if (earliest.index > 0) {
      segments.push({ text: remaining.slice(0, earliest.index) });
    }

    segments.push({
      text: earliest.match[earliest.group] ?? "",
      ...earliest.style,
    });

    remaining = remaining.slice(earliest.index + earliest.match[0].length);
  }

  return segments;
}

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

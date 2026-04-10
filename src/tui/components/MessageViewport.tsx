import React, { useMemo, useEffect } from "react";
import { Box, Text, useStdout } from "ink";
import { debug } from "../../debug.js";

import type { ChatMessage } from "../lib/types.js";
import { Panel } from "./Panel.js";
import { safeWidth } from "../lib/width.js";
import { wrapText } from "../lib/wrap.js";
import { parseMarkdownLine, type StyledLine } from "../lib/terminalMarkdown.js";

interface ViewportRow {
  key: string;
  message: ChatMessage;
  styledLine: StyledLine;
}

function buildRows(messages: ChatMessage[], width: number): ViewportRow[] {
  const rows: ViewportRow[] = [];
  let prevRole: string | undefined;

  for (let mi = 0; mi < messages.length; mi++) {
    const message = messages[mi]!;

    // Add blank line between message groups
    if (mi > 0 && (message.role === "user" || (prevRole === "user" && message.kind !== "tool"))) {
      rows.push({
        key: `spacer-${message.id}`,
        message,
        styledLine: { segments: [{ text: "" }] },
      });
    }

    let raw: string;
    let prefix: string;

    if (message.kind === "tool") {
      // Format tool messages
      if (message.toolName) {
        let inputSummary = "";
        if (message.toolInput) {
          try {
            const input = JSON.parse(message.toolInput) as Record<string, unknown>;
            inputSummary = Object.entries(input)
              .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
              .join(", ");
          } catch {
            inputSummary = message.toolInput;
          }
        }
        const icon = message.toolStatus === "success" ? "✓" : message.toolStatus === "error" ? "✗" : "…";
        raw = `  → ${message.toolName}(${inputSummary}) ${icon}`;
      } else {
        raw = (message.text || "").replace(/\s*Done\s*$/g, "").trim();
      }
      prefix = "";
    } else if (message.role === "user") {
      raw = message.text;
      prefix = "> ";
    } else {
      raw = message.text;
      prefix = "";
    }

    // For tool messages, just wrap plain
    if (message.kind === "tool") {
      const lines = wrapText(`${prefix}${raw}`, Math.max(10, width));
      for (let i = 0; i < lines.length; i++) {
        rows.push({
          key: `${message.id}:${i}`,
          message,
          styledLine: { segments: [{ text: lines[i] ?? "", dim: true }] },
        });
      }
    } else {
      // For regular messages, split by newlines and parse markdown per line
      const fullText = `${prefix}${raw}`;
      const textLines = fullText.split("\n");

      let lineIdx = 0;
      for (const textLine of textLines) {
        // Wrap long lines first
        const wrapped = wrapText(textLine, Math.max(10, width));
        for (const wl of wrapped) {
          const styled = parseMarkdownLine(wl);
          rows.push({
            key: `${message.id}:${lineIdx}`,
            message,
            styledLine: styled,
          });
          lineIdx++;
        }
      }
    }

    prevRole = message.role;
  }

  return rows;
}

function StyledText({ row }: { row: ViewportRow }): React.ReactElement {
  const baseColor =
    row.message.role === "user"
      ? "blue"
      : row.message.kind === "tool"
        ? "gray"
        : row.message.role === "assistant"
          ? "green"
          : row.message.role === "error"
            ? "red"
            : "gray";

  return (
    <Text color={baseColor}>
      {row.styledLine.segments.map((seg, i) => (
        <Text
          key={i}
          bold={seg.bold}
          italic={seg.italic}
          dimColor={seg.dim}
          color={seg.color ?? baseColor}
        >
          {seg.text}
        </Text>
      ))}
    </Text>
  );
}

export function MessageViewport({
  messages,
  title,
  height: heightOverride,
  offset: offsetOverride,
}: {
  messages: ChatMessage[];
  title?: string;
  height?: number;
  offset?: number;
}): React.ReactElement {
  const { stdout } = useStdout();
  const width = safeWidth(stdout?.columns, 80) - 6;
  const viewHeight = heightOverride ?? Math.max(4, (stdout?.rows ?? 24) - 12);

  const allRows = useMemo(() => buildRows(messages, width), [messages, width]);

  useEffect(() => {
    debug("VIEWPORT", `render: messages=${messages.length} lines=${allRows.length} viewHeight=${viewHeight} width=${width}`);
    if (allRows.length > 0) {
      const last = allRows[allRows.length - 1]!;
      debug("VIEWPORT", `lastLine: ${JSON.stringify({ key: last.key, text: last.styledLine.segments.map(s => s.text).join("") })}`);
    }
  });

  // Default offset = stick to bottom
  const maxOffset = Math.max(0, allRows.length - viewHeight);
  const offset = offsetOverride ?? maxOffset;
  const effectiveOffset = Math.min(Math.max(0, offset), maxOffset);

  const visible = allRows.slice(effectiveOffset, effectiveOffset + viewHeight);
  const padCount = Math.max(0, viewHeight - visible.length);

  debug("VIEWPORT", `showing offset=${effectiveOffset} visible=${visible.length} pad=${padCount} maxOffset=${maxOffset}`);

  return (
    <Panel title={title}>
      <Box flexDirection="column">
        {visible.map((row) => (
          <StyledText key={row.key} row={row} />
        ))}
        {Array.from({ length: padCount }, (_, i) => (
          <Text key={`pad-${i}`}>{" "}</Text>
        ))}
      </Box>
    </Panel>
  );
}

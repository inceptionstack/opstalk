/**
 * Export chat conversations to Markdown format.
 *
 * Supports both CLI export (from journal records) and TUI export (from in-memory messages).
 */

export interface ExportableMessage {
  role: "user" | "assistant" | "system" | "error";
  text: string;
  createdAt: string;
  toolName?: string;
  toolInput?: string;
  toolStatus?: string;
  toolResult?: string;
  artifactContent?: string;
}

export interface ExportMetadata {
  executionId: string;
  region: string;
  agentSpaceId: string;
  exportedAt?: string;
}

function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return iso;
  }
}

function escapeForMarkdown(text: string): string {
  // Don't escape — we want to preserve any markdown the assistant already wrote
  return text;
}

function formatToolCall(msg: ExportableMessage): string {
  const parts: string[] = [];
  const icon = msg.toolStatus === "success" ? "✅" : msg.toolStatus === "error" ? "❌" : "🔧";

  parts.push(`${icon} **Tool:** \`${msg.toolName}\``);

  if (msg.toolInput) {
    try {
      const input = JSON.parse(msg.toolInput) as Record<string, unknown>;
      const summary = Object.entries(input)
        .filter(([k]) => k !== "content")
        .map(([k, v]) => {
          const val = JSON.stringify(v);
          return val.length > 80 ? `${k}: ...` : `${k}: ${val}`;
        })
        .join(", ");
      if (summary) {
        parts.push(`  Input: ${summary}`);
      }
    } catch {
      // skip
    }
  }

  if (msg.toolResult) {
    const result = msg.toolResult.length > 500
      ? msg.toolResult.slice(0, 500) + "…"
      : msg.toolResult;
    parts.push(`  Result: ${result}`);
  }

  return parts.join("\n");
}

export function formatChatAsMarkdown(
  messages: ExportableMessage[],
  metadata: ExportMetadata,
): string {
  const lines: string[] = [];
  const exportTime = metadata.exportedAt ?? new Date().toISOString();

  // Header
  lines.push("# OpsTalk Chat Export");
  lines.push("");
  lines.push(`- **Exported:** ${formatTimestamp(exportTime)}`);
  lines.push(`- **Region:** ${metadata.region}`);
  lines.push(`- **Agent Space:** ${metadata.agentSpaceId}`);
  lines.push(`- **Chat ID:** ${metadata.executionId}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const msg of messages) {
    // Tool messages
    if (msg.toolName) {
      lines.push(formatToolCall(msg));
      lines.push("");
      continue;
    }

    // Role header
    const roleLabel = msg.role === "user" ? "👤 **You**" : msg.role === "assistant" ? "🤖 **DevOps Agent**" : `🔔 **${msg.role}**`;
    const timestamp = formatTimestamp(msg.createdAt);

    lines.push(`### ${roleLabel}`);
    lines.push(`*${timestamp}*`);
    lines.push("");

    // Message content
    const text = escapeForMarkdown(msg.text.trim());
    lines.push(text);
    lines.push("");

    // Artifact content
    if (msg.artifactContent) {
      lines.push("**Artifact:**");
      lines.push("```");
      lines.push(msg.artifactContent);
      lines.push("```");
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  }

  // Footer
  lines.push(`*Exported by [OpsTalk](https://github.com/inceptionstack/opstalk) on ${formatTimestamp(exportTime)}*`);
  lines.push("");

  return lines.join("\n");
}

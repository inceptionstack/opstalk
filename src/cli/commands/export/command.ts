import fs from "node:fs";
import path from "node:path";

import { DevOpsAgentClient } from "../../../agent/client.js";
import { formatChatAsMarkdown, type ExportableMessage } from "../../../agent/export.js";
import { loadConfig, mergeConfig } from "../../../config/storage.js";
import type { AppConfig } from "../../../tui/lib/types.js";

/**
 * Extract readable text from a journal record's structured content.
 * Journal records wrap messages in `{ role, content: [{ type, text }] }` format.
 */
function parseJournalContent(
  content: unknown,
  recordType: string,
  recordCreatedAt: string,
): ExportableMessage | null {
  if (!content) return null;

  // Skip final_response (duplicate of message) and chat_title
  const rt = recordType.toLowerCase();
  if (rt === "final_response" || rt === "chat_title") return null;

  // Content may be a JSON string — parse it
  let obj: Record<string, unknown> | null = null;
  if (typeof content === "string") {
    try {
      obj = JSON.parse(content) as Record<string, unknown>;
    } catch {
      // Plain text
      return content.trim()
        ? { role: rt.includes("user") ? "user" : "assistant", text: content, createdAt: recordCreatedAt }
        : null;
    }
  } else if (typeof content === "object" && content !== null) {
    obj = content as Record<string, unknown>;
  }

  if (!obj) return null;

  // Determine role from the record content's own role field
  const recordRole = (obj.role as string | undefined) ?? "";
  const role: ExportableMessage["role"] =
    recordRole === "user" ? "user"
      : recordRole === "assistant" ? "assistant"
        : rt.includes("user") ? "user"
          : rt.includes("error") ? "error"
            : "assistant";

  // Extract text from content array: { content: [{ type: "text", text: "..." }] }
  const contentArray = obj.content as Array<{ type?: string; text?: string; title?: string }> | undefined;
  if (Array.isArray(contentArray)) {
    // Skip chat_title records
    if (contentArray.some((c) => c.type === "chat_title")) return null;

    const textParts = contentArray
      .filter((c) => (c.type === "text" || !c.type) && c.text)
      .map((c) => c.text as string);

    if (textParts.length > 0) {
      return { role, text: textParts.join("\n\n"), createdAt: recordCreatedAt };
    }
  }

  return null;
}

export async function runExportCommand(
  outPath: string | undefined,
  options: Partial<AppConfig> & { chatId?: string; latest?: boolean },
): Promise<void> {
  const base = await loadConfig();
  const config = mergeConfig({
    ...base,
    ...Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined)),
  });

  if (!config.agentSpaceId) {
    throw new Error("No agent space configured. Run `opstalk` first to pick one.");
  }

  const client = new DevOpsAgentClient({ region: config.region });

  let executionId = options.chatId;

  if (!executionId) {
    // Pick the latest chat
    const chats = await client.listChats({
      agentSpaceId: config.agentSpaceId,
      userId: config.userId,
      maxResults: 1,
    });

    if (chats.executions.length === 0) {
      console.error("No chats found. Start a conversation first.");
      process.exit(1);
    }
    executionId = chats.executions[0]!.executionId;
    console.error(`Exporting latest chat: ${chats.executions[0]!.summary ?? executionId}`);
  }

  // Fetch journal records
  const allRecords: ExportableMessage[] = [];
  let nextToken: string | undefined;

  do {
    const response = await client.listJournalRecords({
      agentSpaceId: config.agentSpaceId,
      executionId,
      nextToken,
      limit: 100,
    });

    for (const record of response.records) {
      const parsed = parseJournalContent(record.content, record.recordType, record.createdAt);
      if (parsed) {
        allRecords.push(parsed);
      }
    }

    nextToken = response.nextToken;
  } while (nextToken);

  const markdown = formatChatAsMarkdown(allRecords, {
    executionId,
    region: config.region,
    agentSpaceId: config.agentSpaceId,
  });

  if (outPath) {
    const resolved = path.resolve(outPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, markdown, "utf-8");
    console.log(`Exported ${allRecords.length} messages → ${resolved}`);
  } else {
    process.stdout.write(markdown);
  }
}

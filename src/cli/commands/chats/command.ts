import { DevOpsAgentClient } from "../../../agent/client.js";
import { loadConfig, mergeConfig } from "../../../config/storage.js";
import type { AppConfig } from "../../../tui/lib/types.js";

export async function runChatsCommand(overrides: Partial<AppConfig>): Promise<void> {
  const base = await loadConfig();
  const config = mergeConfig({ ...base, ...Object.fromEntries(Object.entries(overrides).filter(([,v]) => v !== undefined)) });

  if (!config.agentSpaceId) {
    throw new Error("No agent space configured.");
  }

  const client = new DevOpsAgentClient({ region: config.region });
  const response = await client.listChats({
    agentSpaceId: config.agentSpaceId,
    userId: config.userId,
    maxResults: 20,
  });

  for (const chat of response.executions) {
    process.stdout.write(`${chat.executionId}\t${chat.updatedAt ?? chat.createdAt}\t${chat.summary ?? ""}\n`);
  }
}

import { DevOpsAgentClient } from "../../../agent/client.js";
import { loadConfig, mergeConfig } from "../../../config/storage.js";
import type { AppConfig } from "../../../tui/lib/types.js";

export async function runSpacesCommand(overrides: Partial<AppConfig>): Promise<void> {
  const base = await loadConfig();
  const config = mergeConfig({ ...base, ...Object.fromEntries(Object.entries(overrides).filter(([,v]) => v !== undefined)) });

  const client = new DevOpsAgentClient({ region: config.region });
  const response = await client.listAgentSpaces();

  for (const space of response.agentSpaces) {
    process.stdout.write(`${space.agentSpaceId}\t${space.name ?? ""}\t${space.status ?? ""}\n`);
  }
}

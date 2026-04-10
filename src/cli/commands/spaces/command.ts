import { DevOpsAgentClient } from "../../../agent/client.js";
import { loadConfig, mergeConfig } from "../../../config/storage.js";
import type { AppConfig } from "../../../tui/lib/types.js";

export async function runSpacesCommand(overrides: Partial<AppConfig>): Promise<void> {
  const config = mergeConfig({
    ...(await loadConfig()),
    ...overrides,
  });

  const client = new DevOpsAgentClient({ region: config.region });
  const response = await client.listAgentSpaces();

  for (const space of response.agentSpaces) {
    process.stdout.write(`${space.agentSpaceId}\t${space.name ?? ""}\t${space.status ?? ""}\n`);
  }
}

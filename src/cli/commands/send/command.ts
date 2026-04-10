import { DevOpsAgentClient } from "../../../agent/client.js";
import { loadConfig, mergeConfig } from "../../../config/storage.js";
import type { AppConfig } from "../../../tui/lib/types.js";

export async function runSendCommand(content: string, overrides: Partial<AppConfig>): Promise<void> {
  const config = mergeConfig({
    ...(await loadConfig()),
    ...overrides,
  });

  if (!config.agentSpaceId) {
    throw new Error("No agent space configured. Run `opstalk` first to pick one.");
  }

  const client = new DevOpsAgentClient({ region: config.region });
  const chat = await client.createChat({
    agentSpaceId: config.agentSpaceId,
    userId: config.userId,
    userType: config.userType,
  });

  process.stdout.write(`> ${content}\n`);

  for await (const event of client.sendMessage({
    agentSpaceId: config.agentSpaceId,
    executionId: chat.executionId,
    content,
    userId: config.userId,
  })) {
    if (event.type === "contentBlockDelta") {
      const delta = event.payload.delta?.textDelta?.text ?? event.payload.delta?.jsonDelta?.partialJson ?? "";
      if (delta) {
        process.stdout.write(delta);
      }
    }

    if (event.type === "responseFailed") {
      process.stderr.write(`\n${event.payload.errorCode ?? "ERROR"}: ${event.payload.errorMessage ?? "unknown"}\n`);
    }
  }

  process.stdout.write("\n");
}

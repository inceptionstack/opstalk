import React from "react";
import { render } from "ink";

import { DevOpsAgentController } from "../../../agent/controller.js";
import { loadConfig, mergeConfig } from "../../../config/storage.js";
import { App } from "../../../tui/App.js";
import { startChat } from "../../../tui/chat.js";
import { formatHeader, writeLine } from "../../../tui/lib/consoleOutput.js";
import type { AppConfig } from "../../../tui/lib/types.js";

async function runSetup(controller: DevOpsAgentController): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const app = render(
      React.createElement(App, {
        loadSpaces: async () => {
          const response = await controller.client.listAgentSpaces();
          return response.agentSpaces;
        },
        onSelect: async (space) => {
          app.unmount();
          try {
            await controller.selectAgentSpace(space);
            resolve();
          } catch (error) {
            reject(error);
          }
        },
      }),
    );
  });
}

export async function runChatCommand(overrides: Partial<AppConfig>): Promise<void> {
  const config = mergeConfig({
    ...(await loadConfig()),
    ...overrides,
  });

  for (const line of formatHeader(config.region, config.agentSpaceId)) {
    writeLine(line);
  }
  writeLine();

  const controller = new DevOpsAgentController(config);
  if (!config.agentSpaceId) {
    await runSetup(controller);
  }

  await startChat(controller.config, controller);
}

import { useEffect, useMemo, useState } from "react";

import { DevOpsAgentController } from "../../agent/controller.js";
import type { AppConfig } from "../lib/types.js";

export function useDevOpsAgent(config: AppConfig, setConfig: (next: AppConfig) => void) {
  const controller = useMemo(
    () => new DevOpsAgentController(config, setConfig),
    [config.agentSpaceId, config.region, config.ui.thinkingMode, config.userId, config.userType, setConfig],
  );
  const [state, setState] = useState(controller.state);

  useEffect(() => controller.subscribe(setState), [controller]);

  return useMemo(
    () => ({
      client: controller.client,
      state,
      sendMessage: controller.sendMessage,
      createNewChat: controller.createNewChat,
      loadChats: controller.loadChats,
      resumeChat: controller.resumeChat,
      selectAgentSpace: controller.selectAgentSpace,
      clearMessages: controller.clearMessages,
      appendSystemMessage: controller.appendSystemMessage,
    }),
    [controller, state],
  );
}

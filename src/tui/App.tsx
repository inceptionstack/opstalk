import React, { useMemo, useState } from "react";

import { ConfigProvider } from "./context/ConfigContext.js";
import { DevOpsAgentProvider } from "./context/DevOpsAgentContext.js";
import { useDevOpsAgent } from "./hooks/useDevOpsAgent.js";
import { ChatScreen } from "./screens/ChatScreen.js";
import { SetupScreen } from "./screens/SetupScreen.js";
import type { AppConfig } from "./lib/types.js";

export function App({ initialConfig }: { initialConfig: AppConfig }): React.ReactElement {
  const [config, setConfig] = useState(initialConfig);
  const agent = useDevOpsAgent(config, setConfig);

  const configValue = useMemo(
    () => ({
      config,
      setConfig,
    }),
    [config],
  );

  const loadSpaces = async () => {
    const response = await agent.client.listAgentSpaces();
    return response.agentSpaces;
  };

  return (
    <ConfigProvider value={configValue}>
      <DevOpsAgentProvider value={agent}>
        {config.agentSpaceId ? (
          <ChatScreen agent={agent} />
        ) : (
          <SetupScreen loadSpaces={loadSpaces} onSelect={agent.selectAgentSpace} />
        )}
      </DevOpsAgentProvider>
    </ConfigProvider>
  );
}

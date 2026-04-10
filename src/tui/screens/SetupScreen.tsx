import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";

import type { AgentSpace } from "../../agent/types.js";
import { Panel } from "../components/Panel.js";
import { Screen } from "../components/Screen.js";
import { Spinner } from "../components/Spinner.js";

export function SetupScreen(props: {
  loadSpaces: () => Promise<AgentSpace[]>;
  onSelect: (space: AgentSpace) => Promise<void>;
}): React.ReactElement {
  const [spaces, setSpaces] = useState<AgentSpace[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    void (async () => {
      try {
        const result = await props.loadSpaces();
        setSpaces(result);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      } finally {
        setLoading(false);
      }
    })();
  }, [props]);

  useInput(async (_input, key) => {
    if (loading || spaces.length === 0) {
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((current) => Math.max(0, current - 1));
    }

    if (key.downArrow) {
      setSelectedIndex((current) => Math.min(spaces.length - 1, current + 1));
    }

    if (key.return) {
      const selected = spaces[selectedIndex];
      if (selected) {
        await props.onSelect(selected);
      }
    }
  });

  return (
    <Screen>
      <Panel title="Setup">
        <Box flexDirection="column">
          <Text>Select an AWS DevOps Agent space to continue.</Text>
          {loading ? <Spinner label="Loading agent spaces" /> : null}
          {error ? <Text color="red">{error}</Text> : null}
          {!loading &&
            spaces.map((space, index) => (
              <Text key={space.agentSpaceId} color={index === selectedIndex ? "cyan" : undefined}>
                {index === selectedIndex ? "›" : " "} {space.name ?? space.agentSpaceId} [{space.status ?? "UNKNOWN"}]
              </Text>
            ))}
          {!loading && spaces.length === 0 ? <Text dimColor>No agent spaces available.</Text> : null}
        </Box>
      </Panel>
    </Screen>
  );
}

import React from "react";

import type { AgentSpace } from "../agent/types.js";
import { SetupScreen } from "./screens/SetupScreen.js";

export function App(props: {
  loadSpaces: () => Promise<AgentSpace[]>;
  onSelect: (space: AgentSpace) => Promise<void>;
}): React.ReactElement {
  return <SetupScreen loadSpaces={props.loadSpaces} onSelect={props.onSelect} />;
}

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";

import { DevOpsAgentClient } from "../../agent/client.js";
import { createAgentSpaceRole, createOperatorAppRole, getAccountId } from "../../agent/setup.js";
import type { AgentSpace } from "../../agent/types.js";
import { saveConfig } from "../../config/storage.js";
import { Panel } from "../components/Panel.js";
import { Screen } from "../components/Screen.js";
import { Spinner } from "../components/Spinner.js";
import { useConfig } from "../context/ConfigContext.js";

type SetupMode = "list" | "create-form" | "creating";
type FormFieldKey = "name" | "description" | "region";

interface CreateFormState {
  name: string;
  description: string;
  region: string;
}

interface PendingSelection {
  region: string;
  space: AgentSpace;
}

interface ProgressState {
  message: string;
}

const CREATE_SPACE_ENTRY_ID = "__create__";
const CREATE_SPACE_LABEL = "+ Create new agent space";
const DEFAULT_NAME = "MyAgentSpace";
const DEFAULT_DESCRIPTION = "DevOps Agent space created by opstalk";
const FORM_FIELDS: Array<{ key: FormFieldKey; label: string; optional?: boolean }> = [
  { key: "name", label: "Agent space name" },
  { key: "description", label: "Description", optional: true },
  { key: "region", label: "Region" },
];

function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createDefaultForm(region: string): CreateFormState {
  return {
    name: DEFAULT_NAME,
    description: DEFAULT_DESCRIPTION,
    region,
  };
}

function getFormField(index: number): { key: FormFieldKey; label: string; optional?: boolean } {
  return FORM_FIELDS[index] ?? FORM_FIELDS[0]!;
}

export function SetupScreen(props: {
  loadSpaces: () => Promise<AgentSpace[]>;
  onSelect: (space: AgentSpace) => Promise<void>;
}): React.ReactElement {
  const { config, setConfig } = useConfig();
  const [mode, setMode] = useState<SetupMode>("list");
  const [spaces, setSpaces] = useState<AgentSpace[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [progress, setProgress] = useState<ProgressState>();
  const [form, setForm] = useState<CreateFormState>(() => createDefaultForm(config.region));
  const [formIndex, setFormIndex] = useState(0);
  const [inputValue, setInputValue] = useState(DEFAULT_NAME);
  const [pendingSelection, setPendingSelection] = useState<PendingSelection>();

  const listEntries = useMemo(
    () => [...spaces, { agentSpaceId: CREATE_SPACE_ENTRY_ID, name: CREATE_SPACE_LABEL, status: "ACTION" }],
    [spaces],
  );

  const loadSpaces = useCallback(async () => {
    setLoading(true);
    setError(undefined);

    try {
      const result = await props.loadSpaces();
      setSpaces(result);
      setSelectedIndex((current) => Math.min(current, result.length));
      if (result.length === 0) {
        setMode("create-form");
        setFormIndex(0);
      } else if (mode !== "creating") {
        setMode("list");
      }
    } catch (loadError) {
      setError(normalizeError(loadError));
    } finally {
      setLoading(false);
    }
  }, [props.loadSpaces]);

  useEffect(() => {
    void loadSpaces();
  }, [loadSpaces]);

  useEffect(() => {
    if (mode !== "create-form") {
      return;
    }
    const currentField = getFormField(formIndex);
    setInputValue(form[currentField.key]);
  }, [form, formIndex, mode]);

  useEffect(() => {
    if (!pendingSelection || config.region !== pendingSelection.region) {
      return;
    }

    void (async () => {
      try {
        await props.onSelect(pendingSelection.space);
      } catch (selectionError) {
        setError(normalizeError(selectionError));
        setMode("list");
      } finally {
        setPendingSelection(undefined);
      }
    })();
  }, [config.region, pendingSelection, props.onSelect]);

  const resetForm = useCallback((region: string) => {
    const nextForm = createDefaultForm(region);
    setForm(nextForm);
    setFormIndex(0);
    setInputValue(nextForm.name);
  }, []);

  const beginCreateFlow = useCallback(() => {
    setError(undefined);
    setSuccess(undefined);
    setProgress(undefined);
    setMode("create-form");
    resetForm(config.region);
  }, [config.region, resetForm]);

  const backToList = useCallback(() => {
    setMode("list");
    setError(undefined);
    setProgress(undefined);
    setFormIndex(0);
    setInputValue(form.name);
  }, [form.name]);

  const finishCreateFlow = useCallback(async (nextForm: CreateFormState) => {
    setMode("creating");
    setError(undefined);
    setSuccess(undefined);
    setProgress({ message: "Getting AWS account ID..." });

    try {
      const accountId = await getAccountId(nextForm.region);

      setProgress({ message: "Creating IAM roles..." });
      const [agentSpaceRoleArn, operatorAppRoleArn] = await Promise.all([
        createAgentSpaceRole(accountId, nextForm.region),
        createOperatorAppRole(accountId, nextForm.region),
      ]);

      setProgress({ message: "Creating agent space..." });
      const creationClient = new DevOpsAgentClient({ region: nextForm.region });
      const agentSpace = await creationClient.createAgentSpace({
        name: nextForm.name,
        description: nextForm.description,
      });

      setProgress({ message: "Associating AWS account..." });
      await creationClient.associateMonitorAccount({
        agentSpaceId: agentSpace.agentSpaceId,
        accountId,
        assumableRoleArn: agentSpaceRoleArn,
      });

      setProgress({ message: "Enabling operator app..." });
      await creationClient.enableOperatorApp({
        agentSpaceId: agentSpace.agentSpaceId,
        authFlow: "iam",
        operatorAppRoleArn,
      });

      setSuccess(`✓ Agent space created: ${agentSpace.name ?? nextForm.name} (${agentSpace.agentSpaceId})`);
      setSpaces((current) => [...current, agentSpace]);
      setSelectedIndex(spaces.length);

      if (nextForm.region !== config.region) {
        const nextConfig = {
          ...config,
          region: nextForm.region,
        };
        setConfig(nextConfig);
        await saveConfig(nextConfig);
        setPendingSelection({ region: nextForm.region, space: agentSpace });
        return;
      }

      await props.onSelect(agentSpace);
    } catch (createError) {
      setError(normalizeError(createError));
      setMode("list");
    } finally {
      setProgress(undefined);
    }
  }, [config, props.onSelect, setConfig, spaces.length]);

  const submitField = useCallback(async (value: string) => {
    const currentField = getFormField(formIndex);
    const trimmedValue = value.trim();
    const nextValue =
      trimmedValue.length > 0
        ? trimmedValue
        : currentField.optional
          ? ""
          : form[currentField.key];

    const nextForm: CreateFormState = {
      ...form,
      [currentField.key]: nextValue,
    };
    setForm(nextForm);

    if (formIndex === FORM_FIELDS.length - 1) {
      const normalizedForm: CreateFormState = {
        name: nextForm.name.trim() || DEFAULT_NAME,
        description: nextForm.description.trim() || DEFAULT_DESCRIPTION,
        region: nextForm.region.trim() || config.region,
      };
      setForm(normalizedForm);
      await finishCreateFlow(normalizedForm);
      return;
    }

    const nextIndex = formIndex + 1;
    setFormIndex(nextIndex);
    setInputValue(nextForm[getFormField(nextIndex).key]);
  }, [config.region, finishCreateFlow, form, formIndex]);

  useInput(async (_input, key) => {
    if (loading || mode === "creating") {
      return;
    }

    if (mode === "create-form") {
      if (key.escape && spaces.length > 0) {
        backToList();
      }
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((current) => Math.max(0, current - 1));
    }

    if (key.downArrow) {
      setSelectedIndex((current) => Math.min(listEntries.length - 1, current + 1));
    }

    if (key.return) {
      const selected = listEntries[selectedIndex];
      if (!selected) {
        return;
      }
      if (selected.agentSpaceId === CREATE_SPACE_ENTRY_ID) {
        beginCreateFlow();
        return;
      }
      await props.onSelect(selected);
    }
  });

  const currentField = getFormField(formIndex);
  const previewValues: CreateFormState = {
    name: formIndex === 0 ? inputValue || DEFAULT_NAME : form.name || DEFAULT_NAME,
    description: formIndex === 1 ? inputValue || DEFAULT_DESCRIPTION : form.description || DEFAULT_DESCRIPTION,
    region: formIndex === 2 ? inputValue || config.region : form.region || config.region,
  };

  return (
    <Screen>
      <Panel title="Setup">
        <Box flexDirection="column">
          <Text>Select an AWS DevOps Agent space to continue.</Text>
          {loading ? <Spinner label="Loading agent spaces" /> : null}
          {!loading && spaces.length === 0 ? <Text color="yellow">No agent spaces found. Lets create one!</Text> : null}
          {error ? <Text color="red">{error}</Text> : null}
          {success ? <Text color="green">{success}</Text> : null}
          {mode === "creating" ? (
            <Box flexDirection="column" marginTop={1}>
              <Text>Setting up agent space...</Text>
              <Spinner label={progress?.message ?? "Working"} />
            </Box>
          ) : null}
          {!loading && mode === "list"
            ? listEntries.map((space, index) => (
                <Text key={`${space.agentSpaceId}-${index}`} color={index === selectedIndex ? "cyan" : undefined}>
                  {index === selectedIndex ? "›" : " "}{" "}
                  {space.agentSpaceId === CREATE_SPACE_ENTRY_ID
                    ? CREATE_SPACE_LABEL
                    : `${space.name ?? space.agentSpaceId} [${space.status ?? "UNKNOWN"}]`}
                </Text>
              ))
            : null}
          {!loading && mode === "create-form" ? (
            <Box flexDirection="column" marginTop={1}>
              <Text>Guided setup</Text>
              <Text dimColor>
                Step {formIndex + 1} of {FORM_FIELDS.length}
              </Text>
              <Text>
                {currentField.label}
                {currentField.optional ? " (optional)" : ""}
              </Text>
              <TextInput value={inputValue} onChange={setInputValue} onSubmit={(value) => void submitField(value)} />
              <Text dimColor>Press Enter to continue. Press Esc to return to the list.</Text>
              <Box flexDirection="column" marginTop={1}>
                <Text dimColor>Name: {previewValues.name}</Text>
                <Text dimColor>Description: {previewValues.description}</Text>
                <Text dimColor>Region: {previewValues.region}</Text>
              </Box>
            </Box>
          ) : null}
        </Box>
      </Panel>
    </Screen>
  );
}

import { Box, Text, useInput } from "ink";
import { useCallback, useEffect, useState } from "react";
import { type Client, errorMessage } from "../client";
import type { DetectedSkill, Detection } from "../types";

interface DetectScreenProps {
  client: Client;
  isActive: boolean;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; detection: Detection };

type StatusMessage = { text: string; kind: "success" | "error" } | null;

const STATE_COLOR: Record<DetectedSkill["state"], string> = {
  managed: "green",
  unmanaged: "cyan",
  duplicate: "yellow",
  drifted: "yellow",
  invalid: "red",
};

/** Detection census: cursor-navigable skill list, enter adopts the highlighted row. */
export function DetectScreen({ client, isActive }: DetectScreenProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [cursor, setCursor] = useState(0);
  const [adopting, setAdopting] = useState(false);
  const [status, setStatus] = useState<StatusMessage>(null);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const detection = await client.getScan();
      setState({ kind: "ready", detection });
      setCursor((current) => Math.min(current, Math.max(0, detection.skills.length - 1)));
    } catch (error) {
      setState({ kind: "error", message: errorMessage(error) });
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  const adopt = useCallback(
    async (skill: DetectedSkill) => {
      setAdopting(true);
      setStatus(null);
      try {
        const results = await client.postAdopt([
          { name: skill.name, path: skill.path, scope: skill.registryScope ?? "global" },
        ]);
        const result = results[0];
        if (result?.ok) {
          setStatus({ text: `adopted ${skill.name}`, kind: "success" });
        } else {
          setStatus({ text: `${skill.name}: ${result?.error ?? "adopt failed"}`, kind: "error" });
        }
        await load();
      } catch (error) {
        setStatus({ text: errorMessage(error), kind: "error" });
      } finally {
        setAdopting(false);
      }
    },
    [client, load],
  );

  useInput(
    (_input, key) => {
      if (state.kind !== "ready") return;
      const { skills } = state.detection;
      if (key.upArrow) setCursor((current) => Math.max(0, current - 1));
      if (key.downArrow) setCursor((current) => Math.min(skills.length - 1, current + 1));
      if (key.return && !adopting) {
        const skill = skills[cursor];
        if (skill) void adopt(skill);
      }
    },
    { isActive },
  );

  return (
    <Box flexDirection="column">
      <Text bold>Detect</Text>
      {state.kind === "loading" ? <Text dimColor>scanning…</Text> : null}
      {state.kind === "error" ? <Text color="red">{state.message}</Text> : null}
      {state.kind === "ready" ? (
        <Box flexDirection="column">
          <Text dimColor>
            global token estimate: ~{state.detection.tokenEstimate.global} ·{" "}
            {state.detection.skills.length} skills across {state.detection.clientsFound.length}{" "}
            clients
          </Text>
          {state.detection.skills.length === 0 ? (
            <Text dimColor>no skills detected</Text>
          ) : (
            state.detection.skills.map((skill, index) => (
              <Text key={`${skill.client}:${skill.surface}:${skill.path}`}>
                {index === cursor ? "> " : "  "}
                {`[${skill.client}/${skill.surface}] ${skill.name}  `}
                <Text color={STATE_COLOR[skill.state]}>{skill.state}</Text>
              </Text>
            ))
          )}
        </Box>
      ) : null}
      {adopting ? <Text dimColor>adopting…</Text> : null}
      {status ? (
        <Text color={status.kind === "success" ? "green" : "red"}>{status.text}</Text>
      ) : null}
    </Box>
  );
}

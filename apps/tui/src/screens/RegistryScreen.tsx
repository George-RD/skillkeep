import { Box, Text, useInput } from "ink";
import { useEffect, useState } from "react";
import { type Client, errorMessage } from "../client";
import type { RegistryScope, RegistrySkill } from "../types";

interface RegistryScreenProps {
  client: Client;
  isActive: boolean;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; scopes: RegistryScope[] };

/** Flattened (scope, skill) pair with its index in cursor-navigation order. */
interface FlatEntry {
  scope: string;
  skill: RegistrySkill;
}

function flatten(scopes: readonly RegistryScope[]): FlatEntry[] {
  return scopes.flatMap((scope) => scope.skills.map((skill) => ({ scope: scope.scope, skill })));
}

/** Registry browser: scoped tree, cursor selects a skill to show its description/hash. */
export function RegistryScreen({ client, isActive }: RegistryScreenProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    client
      .getRegistry()
      .then((scopes) => {
        if (!cancelled) setState({ kind: "ready", scopes });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ kind: "error", message: errorMessage(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const flat = state.kind === "ready" ? flatten(state.scopes) : [];

  useInput(
    (_input, key) => {
      if (key.upArrow) setCursor((current) => Math.max(0, current - 1));
      if (key.downArrow) setCursor((current) => Math.min(flat.length - 1, current + 1));
    },
    { isActive },
  );

  const selected = flat[cursor];

  return (
    <Box flexDirection="column">
      <Text bold>Registry</Text>
      {state.kind === "loading" ? <Text dimColor>loading registry…</Text> : null}
      {state.kind === "error" ? <Text color="red">{state.message}</Text> : null}
      {state.kind === "ready" ? (
        <Box flexDirection="column">
          {state.scopes.length === 0 ? (
            <Text dimColor>registry is empty</Text>
          ) : (
            state.scopes.map((scope, scopeIndex) => {
              const before = state.scopes
                .slice(0, scopeIndex)
                .reduce((total, s) => total + s.skills.length, 0);
              return (
                <Box key={scope.scope} flexDirection="column">
                  <Text bold>
                    {scope.scope} ({scope.skills.length})
                  </Text>
                  {scope.skills.map((skill, skillIndex) => (
                    <Text key={skill.name}>
                      {before + skillIndex === cursor ? "  > " : "    "}
                      {skill.name}
                    </Text>
                  ))}
                </Box>
              );
            })
          )}
          <Box flexDirection="column" marginTop={1}>
            <Text bold>selected</Text>
            {selected ? (
              <Box flexDirection="column">
                <Text>
                  {selected.scope}/{selected.skill.name}
                </Text>
                <Text dimColor>hash {selected.skill.hash}</Text>
                <Text>{selected.skill.description ?? "(no description)"}</Text>
              </Box>
            ) : (
              <Text dimColor>none</Text>
            )}
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}

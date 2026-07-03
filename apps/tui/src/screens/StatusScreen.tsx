import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import { type Client, errorMessage } from "../client";
import { ListSection } from "../components/ListSection";
import type { StatusReport } from "../types";

interface StatusScreenProps {
  client: Client;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; report: StatusReport };

/** Read-only census summary: counts, duplicates, misplacements, drift, token estimate. */
export function StatusScreen({ client }: StatusScreenProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    client
      .getStatus()
      .then((report) => {
        if (!cancelled) setState({ kind: "ready", report });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ kind: "error", message: errorMessage(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  return (
    <Box flexDirection="column">
      <Text bold>Status</Text>
      {state.kind === "loading" ? <Text dimColor>loading status…</Text> : null}
      {state.kind === "error" ? <Text color="red">{state.message}</Text> : null}
      {state.kind === "ready" ? (
        <Box flexDirection="column">
          <Box flexDirection="column">
            <Text bold>counts</Text>
            {Object.entries(state.report.counts).length === 0 ? (
              <Text dimColor> none</Text>
            ) : (
              Object.entries(state.report.counts).map(([key, value]) => (
                <Text key={key}>
                  {" "}
                  {key}: {value}
                </Text>
              ))
            )}
          </Box>
          <Text>global-only token estimate: ~{state.report.globalOnlyTokenEstimate}</Text>
          <ListSection label="duplicates" items={state.report.duplicates} color="yellow" />
          <ListSection label="misplacements" items={state.report.misplacements} color="yellow" />
          <ListSection label="drift" items={state.report.drift} color="red" />
        </Box>
      ) : null}
    </Box>
  );
}

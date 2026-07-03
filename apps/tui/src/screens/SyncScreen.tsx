import { Box, Text, useInput } from "ink";
import { useCallback, useState } from "react";
import { type Client, errorMessage } from "../client";
import { ListSection } from "../components/ListSection";
import type { SyncReport } from "../types";

interface SyncScreenProps {
  client: Client;
  isActive: boolean;
}

type Phase =
  | { kind: "idle" }
  | { kind: "loading"; action: "dryRun" | "apply" }
  | { kind: "preview"; report: SyncReport }
  | { kind: "applied"; report: SyncReport }
  | { kind: "error"; message: string };

function reportSections(report: SyncReport) {
  return (
    <Box flexDirection="column">
      <ListSection label="created" items={report.created} color="green" />
      <ListSection label="fixed" items={report.fixed} color="yellow" />
      <ListSection label="pruned" items={report.pruned} color="yellow" />
      <ListSection label="config reminders" items={report.configReminders} />
      <ListSection label="errors" items={report.errors} color="red" />
    </Box>
  );
}

/** Sync report: "s" runs a dry-run preview, "y"/"n" confirm or discard applying it for real. */
export function SyncScreen({ client, isActive }: SyncScreenProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const runDryRun = useCallback(async () => {
    setPhase({ kind: "loading", action: "dryRun" });
    try {
      const report = await client.postSync(true);
      setPhase({ kind: "preview", report });
    } catch (error) {
      setPhase({ kind: "error", message: errorMessage(error) });
    }
  }, [client]);

  const runApply = useCallback(async () => {
    setPhase({ kind: "loading", action: "apply" });
    try {
      const report = await client.postSync(false);
      setPhase({ kind: "applied", report });
    } catch (error) {
      setPhase({ kind: "error", message: errorMessage(error) });
    }
  }, [client]);

  useInput(
    (input, key) => {
      if (phase.kind === "loading") return;
      if (phase.kind === "preview") {
        if (input === "y" || key.return) void runApply();
        if (input === "n") setPhase({ kind: "idle" });
        return;
      }
      if (input === "s") void runDryRun();
    },
    { isActive },
  );

  return (
    <Box flexDirection="column">
      <Text bold>Sync</Text>
      <Text dimColor>press s to preview a sync (dry run)</Text>
      {phase.kind === "loading" ? (
        <Text dimColor>{phase.action === "dryRun" ? "previewing…" : "applying…"}</Text>
      ) : null}
      {phase.kind === "error" ? <Text color="red">{phase.message}</Text> : null}
      {phase.kind === "preview" ? (
        <Box flexDirection="column">
          {reportSections(phase.report)}
          <Text bold>Apply? (y/n, or enter to confirm)</Text>
        </Box>
      ) : null}
      {phase.kind === "applied" ? (
        <Box flexDirection="column">
          <Text color="green">sync applied</Text>
          {reportSections(phase.report)}
        </Box>
      ) : null}
    </Box>
  );
}

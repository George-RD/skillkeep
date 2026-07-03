import { Box, Text } from "ink";
import type { HealthState } from "../hooks/useHealth";
import { SCREEN_LABELS, SCREEN_ORDER, type Screen } from "../navigation";

interface TopBarProps {
  url: string;
  screen: Screen;
  health: HealthState;
}

function healthDot(health: HealthState): { symbol: string; color: string } {
  if (health.status === "ok") return { symbol: "●", color: "green" };
  if (health.status === "checking") return { symbol: "●", color: "yellow" };
  return { symbol: "●", color: "red" };
}

/** Connection target, health dot (polled by the caller), and screen tabs. */
export function TopBar({ url, screen, health }: TopBarProps) {
  const dot = healthDot(health);
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box gap={2}>
        <Text bold>skillkeep tui</Text>
        <Text color={dot.color}>{dot.symbol}</Text>
        <Text dimColor>{url}</Text>
      </Box>
      <Box gap={2}>
        {SCREEN_ORDER.map((id) => (
          <Text key={id} bold={id === screen} inverse={id === screen}>
            {SCREEN_LABELS[id]}
          </Text>
        ))}
      </Box>
      {health.status === "unreachable" ? <Text color="red">disconnected from {url}</Text> : null}
    </Box>
  );
}

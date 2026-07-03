import { Box, useApp, useInput, useStdin } from "ink";
import { useState } from "react";
import { createClient } from "./client";
import { TopBar } from "./components/TopBar";
import { useHealth } from "./hooks/useHealth";
import { nextScreen, type Screen, screenForDigit } from "./navigation";
import { DetectScreen } from "./screens/DetectScreen";
import { RegistryScreen } from "./screens/RegistryScreen";
import { StatusScreen } from "./screens/StatusScreen";
import { SyncScreen } from "./screens/SyncScreen";

export interface AppProps {
  url: string;
  token: string;
}

/** Root component: connects once, owns the active screen, and wires global keybindings. */
export function App({ url, token }: AppProps) {
  const { exit } = useApp();
  const { isRawModeSupported } = useStdin();
  // `isTTY` (what isRawModeSupported mirrors) is `undefined`, not `false`, off a TTY —
  // useInput's `isActive` only treats a strict `false` as inactive, so coerce here once.
  const inputActive = isRawModeSupported === true;
  const [screen, setScreen] = useState<Screen>("detect");
  const [client] = useState(() => createClient({ url, token }));
  const health = useHealth(client);

  useInput(
    (input, key) => {
      if (input === "q" || (key.ctrl && input === "c")) {
        exit();
        return;
      }
      if (key.tab) {
        setScreen((current) => nextScreen(current));
        return;
      }
      const target = screenForDigit(input);
      if (target) setScreen(target);
    },
    { isActive: inputActive },
  );

  return (
    <Box flexDirection="column">
      <TopBar url={url} screen={screen} health={health} />
      {screen === "detect" ? <DetectScreen client={client} isActive={inputActive} /> : null}
      {screen === "registry" ? <RegistryScreen client={client} isActive={inputActive} /> : null}
      {screen === "sync" ? <SyncScreen client={client} isActive={inputActive} /> : null}
      {screen === "status" ? <StatusScreen client={client} /> : null}
    </Box>
  );
}

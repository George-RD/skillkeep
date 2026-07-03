/** The TUI's four screens, keyboard-switchable with tab (cycle) or 1-4 (jump). */
export type Screen = "detect" | "registry" | "sync" | "status";

export const SCREEN_ORDER: readonly Screen[] = ["detect", "registry", "sync", "status"];

export const SCREEN_LABELS: Record<Screen, string> = {
  detect: "1 Detect",
  registry: "2 Registry",
  sync: "3 Sync",
  status: "4 Status",
};

/** Maps a "1".."4" keypress to its screen, in SCREEN_ORDER's order; null for anything else. */
export function screenForDigit(digit: string): Screen | null {
  const index = Number(digit) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= SCREEN_ORDER.length) return null;
  const screen = SCREEN_ORDER[index];
  return screen ?? null;
}

/** The screen tab cycles to next, wrapping around. */
export function nextScreen(current: Screen): Screen {
  const index = SCREEN_ORDER.indexOf(current);
  const screen = SCREEN_ORDER[(index + 1) % SCREEN_ORDER.length];
  if (!screen) throw new Error("unreachable: SCREEN_ORDER is non-empty");
  return screen;
}

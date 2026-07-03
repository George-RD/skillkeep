import { Text } from "ink";

interface FatalErrorProps {
  message: string;
}

/** Rendered instead of the app when startup (argv parsing, token resolution) fails. */
export function FatalError({ message }: FatalErrorProps) {
  return <Text color="red">skillkeep-tui: {message}</Text>;
}

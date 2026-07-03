import { Box, Text } from "ink";

interface ListSectionProps {
  label: string;
  items: readonly string[];
  color?: string;
}

/** A labelled, compact list of strings — used by Sync's report and Status's census. */
export function ListSection({ label, items, color }: ListSectionProps) {
  return (
    <Box flexDirection="column">
      <Text bold color={color}>
        {label} ({items.length})
      </Text>
      {items.length === 0 ? (
        <Text dimColor> none</Text>
      ) : (
        items.map((item) => <Text key={item}> {item}</Text>)
      )}
    </Box>
  );
}

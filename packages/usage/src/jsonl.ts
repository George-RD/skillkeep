/**
 * Streaming JSONL reader with crash-safe incremental offsets.
 *
 * Reads `file` from byte `fromOffset` and yields one `{ record, nextOffset }`
 * per line. `nextOffset` is the absolute byte offset immediately AFTER the
 * record's terminating newline (or EOF for a final unterminated line that is
 * still valid JSON), so a caller can persist a cursor after every yield.
 *
 * Trailing-line handling: the final segment after the last `\n` is emitted only
 * if it parses as valid JSON. A segment that fails to parse (a line cut
 * mid-write during a crash, or a genuinely partial append) is held back — the
 * cursor is left at the start of that segment so the next run re-reads it once
 * the writer flushes the rest. Empty / blank lines advance over the newline but
 * yield a `null` record.
 */
export interface JsonlRecord {
  record: unknown;
  nextOffset: number;
}

export async function* jsonlRecords(file: string, fromOffset: number): AsyncGenerator<JsonlRecord> {
  const bunFile = Bun.file(file);
  const size = bunFile.size;
  if (fromOffset >= size) return;

  const text = await bunFile.slice(fromOffset).text();
  const parts = text.split("\n");
  const lastIndex = parts.length - 1;
  let abs = fromOffset;

  for (let i = 0; i < parts.length; i++) {
    const line = parts[i];
    if (line === undefined) continue;
    const isLast = i === lastIndex;

    if (line.length === 0) {
      // Blank line. A trailing newline surfaces as a final "" segment with
      // nothing left to consume; an interior blank advances over its newline.
      if (!isLast) abs += 1;
      continue;
    }

    let record: unknown = null;
    try {
      record = JSON.parse(line);
    } catch {
      record = null;
    }

    if (isLast && record === null) {
      // Possibly a partial write at EOF — do not advance; re-read next time.
      continue;
    }

    abs += line.length;
    if (!isLast) abs += 1; // consume the trailing newline of a complete line
    yield { record, nextOffset: abs };
  }
}

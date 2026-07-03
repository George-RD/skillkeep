/**
 * The one place allowed to write to stdout for CLI-visible output. Every subcommand routes its
 * human-readable output through this instead of `console.log`, so output is easy to intercept
 * (test doubles) and stays free of console's implicit formatting quirks.
 */
export function report(line: string): void {
  process.stdout.write(`${line}\n`);
}

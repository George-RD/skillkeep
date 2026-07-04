import { describe, expect, test } from "bun:test";
import { buildLaunchAgentPlist } from "../src/doctor";

describe("buildLaunchAgentPlist", () => {
  test("contains the cron argument and the script path", () => {
    const plist = buildLaunchAgentPlist("/usr/local/bin/skillkeep");
    expect(plist).toContain("<string>/usr/local/bin/skillkeep</string>");
    expect(plist).toContain("<string>cron</string>");
    expect(plist).not.toContain("<string>sync</string>");
  });
});

import { describe, expect, test } from "bun:test";
import { buildDaemonLaunchAgentPlist, buildLaunchAgentPlist } from "../src/doctor";

describe("buildLaunchAgentPlist", () => {
  test("embeds the program arguments in order with a PATH for launchd's minimal env", () => {
    const plist = buildLaunchAgentPlist(["/opt/bun", "/repo/main.ts", "cron"]);
    expect(plist).toContain("<string>/opt/bun</string>");
    expect(plist).toContain("<string>/repo/main.ts</string>");
    expect(plist).toContain("<string>cron</string>");
    expect(plist).not.toContain("<string>sync</string>");
    expect(plist.indexOf("/opt/bun")).toBeLessThan(plist.indexOf("/repo/main.ts"));
    expect(plist.indexOf("/repo/main.ts")).toBeLessThan(plist.indexOf("<string>cron</string>"));
    expect(plist).toContain("<key>PATH</key>");
    expect(plist).toContain("/opt/homebrew/bin");
    expect(plist).toContain("/usr/bin");
  });

  test("escapes &, <, and > in arguments", () => {
    const plist = buildLaunchAgentPlist(["/home/a & b/x <y>z", "cron"]);
    expect(plist).toContain("<string>/home/a &amp; b/x &lt;y&gt;z</string>");
  });
});

describe("buildDaemonLaunchAgentPlist", () => {
  test("embeds the program arguments in order with a PATH for launchd's minimal env", () => {
    const plist = buildDaemonLaunchAgentPlist(["/opt/bun", "/repo/main.ts", "daemon"]);
    expect(plist).toContain("<string>/opt/bun</string>");
    expect(plist).toContain("<string>/repo/main.ts</string>");
    expect(plist).toContain("<string>daemon</string>");
    expect(plist.indexOf("/opt/bun")).toBeLessThan(plist.indexOf("/repo/main.ts"));
    expect(plist).toContain("<key>PATH</key>");
  });

  test("sets RunAtLoad and KeepAlive instead of a weekly StartCalendarInterval", () => {
    const plist = buildDaemonLaunchAgentPlist(["/opt/bun", "/repo/main.ts", "daemon"]);
    expect(plist).toContain("<key>RunAtLoad</key>");
    expect(plist).toContain("<key>KeepAlive</key>");
    expect(plist).not.toContain("StartCalendarInterval");
    expect(plist).not.toContain("<key>Weekday</key>");
  });

  test("escapes &, <, and > in arguments", () => {
    const plist = buildDaemonLaunchAgentPlist(["/home/a & b/x <y>z", "daemon"]);
    expect(plist).toContain("<string>/home/a &amp; b/x &lt;y&gt;z</string>");
  });
});

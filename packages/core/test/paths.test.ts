import { expect, test } from "bun:test";
import * as os from "node:os";
import * as path from "node:path";
import { dataDir } from "../src/paths";

test("dataDir returns macOS Application Support path on darwin", () => {
  expect(dataDir("darwin")).toBe(
    path.join(os.homedir(), "Library", "Application Support", "skillkeep"),
  );
});

test("dataDir uses XDG_DATA_HOME on linux when set", () => {
  const saved = process.env.XDG_DATA_HOME;
  process.env.XDG_DATA_HOME = "/custom/xdg";
  try {
    expect(dataDir("linux")).toBe(path.join("/custom/xdg", "skillkeep"));
  } finally {
    if (saved) process.env.XDG_DATA_HOME = saved;
    else delete process.env.XDG_DATA_HOME;
  }
});

test("dataDir falls back to ~/.local/share on linux without XDG_DATA_HOME", () => {
  const saved = process.env.XDG_DATA_HOME;
  delete process.env.XDG_DATA_HOME;
  try {
    expect(dataDir("linux")).toBe(path.join(os.homedir(), ".local", "share", "skillkeep"));
  } finally {
    if (saved) process.env.XDG_DATA_HOME = saved;
  }
});

test("dataDir throws a clear error on win32 when APPDATA is unset", () => {
  const saved = process.env.APPDATA;
  delete process.env.APPDATA;
  try {
    expect(() => dataDir("win32")).toThrow(/APPDATA/);
  } finally {
    if (saved) process.env.APPDATA = saved;
  }
});

test("dataDir returns APPDATA path on win32 when set", () => {
  const saved = process.env.APPDATA;
  process.env.APPDATA = "C:\\Users\\test\\AppData\\Roaming";
  try {
    expect(dataDir("win32")).toBe(path.join("C:\\Users\\test\\AppData\\Roaming", "skillkeep"));
  } finally {
    if (saved) process.env.APPDATA = saved;
    else delete process.env.APPDATA;
  }
});

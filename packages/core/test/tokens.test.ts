import { expect, test } from "bun:test";
import { estimateTokens } from "../src/tokens";

test("estimateTokens computes chars/4 rounded to nearest integer", () => {
  // name "foo" (3) + description "bar" (3) + 4 overhead = 10 chars → round(10/4) = 3
  expect(estimateTokens([{ name: "foo", description: "bar" }])).toBe(3);
});

test("estimateTokens handles null description (0 chars)", () => {
  // name "ab" (2) + null (0) + 4 = 6 → round(6/4) = 2
  expect(estimateTokens([{ name: "ab", description: null }])).toBe(2);
});

test("estimateTokens sums multiple skills", () => {
  // (1+1+4) + (1+1+4) = 12 → round(12/4) = 3
  expect(
    estimateTokens([
      { name: "a", description: "b" },
      { name: "c", description: "d" },
    ]),
  ).toBe(3);
});

test("estimateTokens returns 0 for empty input", () => {
  expect(estimateTokens([])).toBe(0);
});

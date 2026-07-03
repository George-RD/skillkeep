import { expect, test } from "bun:test";
import { createDrainingHandler } from "../src/drain";

test("drain() waits for an in-flight request to settle before resolving", async () => {
  const inner = Promise.withResolvers<Response>();
  const handler = createDrainingHandler(() => inner.promise);

  const fetchPromise = handler.fetch(new Request("http://localhost/x"));
  // Give the in-flight request a tick to register before racing drain() against it.
  await Promise.resolve();

  const sentinel = Symbol("still-pending");
  const drainPromise = handler.drain();
  const raceResult = await Promise.race([drainPromise, Promise.resolve(sentinel)]);
  expect(raceResult).toBe(sentinel);

  inner.resolve(new Response("ok"));
  await fetchPromise;
  await drainPromise; // must now resolve
});

test("returns 503 and never invokes inner once beginClose() is called", async () => {
  let innerCalls = 0;
  const handler = createDrainingHandler(() => {
    innerCalls++;
    return new Response("ok");
  });

  handler.beginClose();
  const res = await handler.fetch(new Request("http://localhost/x"));

  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({ error: "shutting down" });
  expect(innerCalls).toBe(0);
});

test("a rejected in-flight request is cleaned up and never rejects drain()", async () => {
  const handler = createDrainingHandler(() => Promise.reject(new Error("boom")));

  await expect(handler.fetch(new Request("http://localhost/x"))).rejects.toThrow("boom");
  await expect(handler.drain()).resolves.toBeUndefined();
});

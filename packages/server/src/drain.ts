/** Fetch handler wrapping `inner` with in-flight request tracking and graceful-shutdown draining. */
export interface DrainingHandler {
  fetch: (req: Request) => Promise<Response>;
  beginClose: () => void;
  drain: () => Promise<void>;
}

/**
 * Wrap a fetch handler so `close()` can wait for in-flight requests to settle before releasing
 * shared resources (the sqlite handle) out from under a still-running handler.
 *
 * `beginClose()` flips a synchronous flag; every `fetch` after that returns 503
 * `{ error: "shutting down" }` without invoking `inner` (the closing check happens before any
 * await, so it is atomic relative to `inFlight` set membership -- no request can slip in between
 * the flag flip and the set snapshot `drain()` awaits). Requests already in flight when
 * `beginClose()` runs are tracked in `inFlight` and awaited via `Promise.allSettled` (a rejected
 * in-flight request, e.g. `/api/events`'s SSE handler settling as soon as it returns the stream,
 * must never make `drain()` itself reject).
 */
export function createDrainingHandler(
  inner: (req: Request) => Promise<Response> | Response,
): DrainingHandler {
  let closing = false;
  const inFlight = new Set<Promise<Response>>();
  return {
    fetch: (req) => {
      if (closing) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: "shutting down" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      const p = Promise.resolve(inner(req));
      inFlight.add(p);
      p.finally(() => inFlight.delete(p)).catch(() => {});
      return p;
    },
    beginClose: () => {
      closing = true;
    },
    drain: async () => {
      await Promise.allSettled([...inFlight]);
    },
  };
}

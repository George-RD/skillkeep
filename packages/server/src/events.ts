const encoder = new TextEncoder();
const subscribers = new Set<ReadableStreamDefaultController<Uint8Array>>();

/**
 * Broadcast a named SSE event with a JSON payload to every open `/api/events` stream.
 * Fire-and-forget: a route calls this after mutating state and moves on without waiting
 * for (or caring about) subscriber count. A controller that throws (closed connection)
 * is dropped from the subscriber set.
 */
export function emit(event: string, data: unknown = {}): void {
  const chunk = encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  for (const controller of subscribers) {
    try {
      controller.enqueue(chunk);
    } catch {
      subscribers.delete(controller);
    }
  }
}

/** Build the `GET /api/events` SSE response and register its controller as a subscriber. */
export function sseResponse(): Response {
  let registered: ReadableStreamDefaultController<Uint8Array> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      registered = controller;
      subscribers.add(controller);
      // SSE clients (including plain `fetch`) wait for the first byte before resolving the
      // connection; a leading comment line establishes the stream immediately.
      controller.enqueue(encoder.encode(": connected\n\n"));
    },
    cancel() {
      if (registered) subscribers.delete(registered);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/** Test-only: how many `/api/events` streams are currently open. */
export function subscriberCount(): number {
  return subscribers.size;
}

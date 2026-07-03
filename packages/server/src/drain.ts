/** Stub pending implementation (commit 2). */
export interface DrainingHandler {
  fetch: (req: Request) => Promise<Response>;
  beginClose: () => void;
  drain: () => Promise<void>;
}

export function createDrainingHandler(
  inner: (req: Request) => Promise<Response> | Response,
): DrainingHandler {
  return {
    fetch: async (req) => inner(req),
    beginClose: () => {},
    drain: async () => {},
  };
}

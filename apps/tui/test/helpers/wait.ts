/** Give pending microtasks (fetch mock resolution, effect-driven setState) a chance to flush. */
export function wait(ms = 20): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

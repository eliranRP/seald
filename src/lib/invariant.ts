/** Runtime assertion used in development to catch impossible branches. */
export function invariant(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(`Invariant failed: ${message}`);
}

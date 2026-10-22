/** DI seam for tests: a stub DNS resolver. Production uses `dns.lookup`. */
export const WEBHOOK_RESOLVER = Symbol('WEBHOOK_RESOLVER');
/**
 * DI seam for tests: the test-only SSRF allowance (plain HTTP, any port,
 * exact allowlisted addresses). Ignored unless `NODE_ENV === 'test'`, so a
 * production process has no allowlist even if one is wired in by mistake.
 */
export const WEBHOOK_TEST_ALLOWANCE = Symbol('WEBHOOK_TEST_ALLOWANCE');
/** DI seam for unit tests that must prove no socket is opened. */
export const WEBHOOK_HTTP_CLIENT = Symbol('WEBHOOK_HTTP_CLIENT');

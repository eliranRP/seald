import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Phase-6 prod-bug-loop regression (2026-05-04):
 *
 * Selecting a .docx from the Drive picker on prod returned
 * `{ status: "failed", errorCode: "conversion-failed" }` because the
 * deploy pipeline (`.github/workflows/deploy.yml`) only brought up the
 * services declared in the ROOT `docker-compose.yml` — and that file
 * historically defined `api` + `caddy` only. The Gotenberg sidecar
 * lived in `deploy/docker-compose.yml` on a separate docker network
 * (`gdrive` bridge) that nothing in the pipeline ever started, and
 * even when started manually it was unreachable from the API
 * container's default network. Result: every .docx hit ECONNREFUSED
 * on `http://gotenberg:3000` and the runJob catch surfaced
 * `conversion-failed`.
 *
 * This contract test asserts that the canonical deploy compose file
 * co-deploys Gotenberg with the API in a way that:
 *   1. matches the API's default `GDRIVE_GOTENBERG_URL` (gotenberg:3000),
 *   2. keeps the sidecar unreachable from the public internet,
 *   3. pins the major version + bounds resource usage.
 *
 * The test reads the compose file as text and asserts on substrings +
 * structural shape. We avoid pulling in `js-yaml` for one test (not in
 * the api package's deps); the assertions below are tight enough that
 * a regression PR can't pass them without restoring the contract.
 */
describe('root docker-compose.yml — Gotenberg co-deploy contract', () => {
  const composePath = join(__dirname, '..', '..', '..', 'docker-compose.yml');
  const compose = readFileSync(composePath, 'utf8');

  it('declares a `gotenberg` service alongside `api`', () => {
    // crude top-level service detection: lines that start with two-space
    // indent and end in a colon, inside the `services:` block.
    const servicesMatch = compose.match(/^services:\s*$([\s\S]*?)(?=^volumes:|^networks:)/m);
    expect(servicesMatch).not.toBeNull();
    const block = servicesMatch![1] ?? '';
    const serviceNames = Array.from(block.matchAll(/^ {2}([a-z0-9_-]+):\s*$/gm)).map((m) => m[1]);
    expect(serviceNames).toEqual(expect.arrayContaining(['api', 'gotenberg']));
  });

  it('pins gotenberg image to the major `gotenberg/gotenberg:8`', () => {
    expect(compose).toMatch(/image:\s*gotenberg\/gotenberg:8\b/);
  });

  it('does NOT publish a host port for gotenberg (must remain internal)', () => {
    // Find the gotenberg block (from `  gotenberg:` until the next
    // top-level service / section).
    const gotMatch = compose.match(
      /^ {2}gotenberg:\s*$([\s\S]*?)(?=^ {2}[a-z0-9_-]+:\s*$|^volumes:|^networks:)/m,
    );
    expect(gotMatch).not.toBeNull();
    const gotBlock = gotMatch![1] ?? '';
    // No `ports:` key inside the gotenberg service block — exposure
    // would surface an unauth'd /forms/libreoffice/convert endpoint to
    // the internet.
    expect(gotBlock).not.toMatch(/^ {4}ports:\s*$/m);
  });

  it('api `depends_on:` includes `gotenberg` so compose starts the sidecar first', () => {
    const apiMatch = compose.match(
      /^ {2}api:\s*$([\s\S]*?)(?=^ {2}[a-z0-9_-]+:\s*$|^volumes:|^networks:)/m,
    );
    expect(apiMatch).not.toBeNull();
    const apiBlock = apiMatch![1] ?? '';
    // `depends_on` may be a list (-) or a map; both forms are accepted
    // as long as `gotenberg` appears under it.
    const dependsOnIdx = apiBlock.search(/^ {4}depends_on:\s*$/m);
    expect(dependsOnIdx).toBeGreaterThanOrEqual(0);
    const dependsOnTail = apiBlock.slice(dependsOnIdx);
    expect(dependsOnTail).toMatch(/(?:- gotenberg\b|^ {6}gotenberg:\s*$)/m);
  });

  it('api + gotenberg share the compose default network (no custom `networks:` on gotenberg)', () => {
    // The simplest path that works: neither service declares an
    // explicit `networks:` key, so they both join the compose default
    // bridge — and `http://gotenberg:3000` resolves via service-name
    // DNS. If a future PR introduces a custom network, both services
    // must be on it, but we keep the contract minimal here: assert no
    // `networks:` block under gotenberg so the default-bridge contract
    // is preserved.
    const gotMatch = compose.match(
      /^ {2}gotenberg:\s*$([\s\S]*?)(?=^ {2}[a-z0-9_-]+:\s*$|^volumes:|^networks:)/m,
    );
    expect(gotMatch).not.toBeNull();
    const gotBlock = gotMatch![1] ?? '';
    expect(gotBlock).not.toMatch(/^ {4}networks:\s*$/m);
  });

  it('caps gotenberg memory at 1.5 GB and CPU at 1.5 vCPU (mirrors deploy/docker-compose.yml)', () => {
    const gotMatch = compose.match(
      /^ {2}gotenberg:\s*$([\s\S]*?)(?=^ {2}[a-z0-9_-]+:\s*$|^volumes:|^networks:)/m,
    );
    expect(gotMatch).not.toBeNull();
    const gotBlock = gotMatch![1] ?? '';
    expect(gotBlock).toMatch(/memory:\s*1536M\b/);
    expect(gotBlock).toMatch(/cpus:\s*['"]?1\.5['"]?/);
  });

  it('hard-disables non-LibreOffice routes via the gotenberg command', () => {
    const gotMatch = compose.match(
      /^ {2}gotenberg:\s*$([\s\S]*?)(?=^ {2}[a-z0-9_-]+:\s*$|^volumes:|^networks:)/m,
    );
    expect(gotMatch).not.toBeNull();
    const gotBlock = gotMatch![1] ?? '';
    expect(gotBlock).toMatch(/--api-port=3000/);
    expect(gotBlock).toMatch(/--api-timeout=30s/);
    expect(gotBlock).toMatch(/--chromium-disable-routes=true/);
    expect(gotBlock).toMatch(/--webhook-disable-routes=true/);
    expect(gotBlock).toMatch(/--pdfengines-disable-routes=true/);
  });
});

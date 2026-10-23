import { IdempotencyService } from '../idempotency.service';
import { InMemoryIdempotencyRecordsRepository } from './in-memory-idempotency-records.repository';

const OWNER = '00000000-0000-4000-8000-0000000000a1';

function scope(overrides: Partial<Parameters<IdempotencyService['begin']>[0]> = {}) {
  return {
    ownerId: OWNER,
    namespace: 'mcp:key-1',
    clientKey: 'client-key-0001',
    method: 'MCP',
    path: 'envelopes_create',
    args: { title: 'NDA', dry_run: false, idempotency_key: 'client-key-0001' },
    ...overrides,
  };
}

describe('IdempotencyService', () => {
  let repo: InMemoryIdempotencyRecordsRepository;
  let svc: IdempotencyService;

  beforeEach(() => {
    repo = new InMemoryIdempotencyRecordsRepository();
    svc = new IdempotencyService(repo);
  });

  it('hashes the tool name and canonical arguments without the idempotency key', () => {
    const a = IdempotencyService.requestHash('t', {
      b: 1,
      a: { d: 2, c: 3 },
      idempotency_key: 'x',
    });
    const b = IdempotencyService.requestHash('t', {
      a: { c: 3, d: 2 },
      b: 1,
      idempotency_key: 'y',
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(IdempotencyService.requestHash('u', { b: 1, a: { d: 2, c: 3 } })).not.toBe(a);
  });

  it('runs a new key, then replays the stored body for the same request', async () => {
    const first = await svc.begin(scope());
    expect(first.kind).toBe('run');
    if (first.kind !== 'run') return;
    await svc.complete(first.handle, { id: 'env-1' });
    expect(
      await svc.begin(scope({ args: { ...scope().args, idempotency_key: 'ignored' } })),
    ).toEqual({
      kind: 'replay',
      body: { id: 'env-1' },
    });
  });

  it('is a conflict for different arguments or another tool under the same key', async () => {
    const first = await svc.begin(scope());
    if (first.kind !== 'run') throw new Error('expected run');
    await svc.complete(first.handle, { id: 'env-1' });
    expect((await svc.begin(scope({ args: { title: 'Other', dry_run: false } }))).kind).toBe(
      'conflict',
    );
    expect((await svc.begin(scope({ path: 'envelopes_update' }))).kind).toBe('conflict');
  });

  it('namespaces keys per credential: another key does not replay the first one', async () => {
    const first = await svc.begin(scope());
    if (first.kind !== 'run') throw new Error('expected run');
    await svc.complete(first.handle, { id: 'env-1' });
    expect((await svc.begin(scope({ namespace: 'mcp:key-2' }))).kind).toBe('run');
  });

  it('reports a running claim as in progress, and lets a stale one run again', async () => {
    expect((await svc.begin(scope())).kind).toBe('run');
    expect((await svc.begin(scope())).kind).toBe('in_progress');
    repo.nowMs += 121_000;
    expect((await svc.begin(scope())).kind).toBe('run');
  });

  it('releases a failed claim so the client can retry', async () => {
    const first = await svc.begin(scope());
    if (first.kind !== 'run') throw new Error('expected run');
    await svc.release(first.handle);
    expect((await svc.begin(scope())).kind).toBe('run');
  });

  it('expires stored responses after 24 hours', async () => {
    const first = await svc.begin(scope());
    if (first.kind !== 'run') throw new Error('expected run');
    await svc.complete(first.handle, { id: 'env-1' });
    repo.nowMs += 24 * 3600_000 + 1;
    expect((await svc.begin(scope({ args: { title: 'New' } }))).kind).toBe('run');
  });
});

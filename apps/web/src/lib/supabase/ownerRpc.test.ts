import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as shared from 'shared';

const { getSession, rpc } = vi.hoisted(() => ({ getSession: vi.fn(), rpc: vi.fn() }));

vi.mock('./supabaseClient', () => ({
  supabase: { auth: { getSession }, rpc },
}));

vi.mock('@/lib/api/apiClient', () => ({
  apiClient: { get: vi.fn() },
}));

import { apiClient } from '@/lib/api/apiClient';
import { listEnvelopes } from '@/features/envelopes/envelopesApi';
import { readViaOwnerRpc } from './ownerRpc';

/** A PostgREST builder stand-in: awaitable, with `abortSignal`. */
function rpcResult(
  result: { data: unknown; error: unknown },
  onAbortSignal?: (s: AbortSignal) => void,
) {
  const promise = Promise.resolve(result);
  return Object.assign(promise, {
    abortSignal(s: AbortSignal) {
      onAbortSignal?.(s);
      return promise;
    },
  });
}

const signedIn = { data: { session: { access_token: 't' } } };

describe('readViaOwnerRpc', () => {
  beforeEach(() => {
    vi.spyOn(shared, 'isFeatureEnabled').mockImplementation((flag) => flag === 'ownerReadRpcs');
    getSession.mockResolvedValue(signedIn);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    getSession.mockReset();
    rpc.mockReset();
  });

  it('uses the API while the flag is off', async () => {
    vi.spyOn(shared, 'isFeatureEnabled').mockReturnValue(false);
    const viaApi = vi.fn(async () => ['api']);
    await expect(
      readViaOwnerRpc('seald_list_contacts', undefined, undefined, viaApi),
    ).resolves.toEqual(['api']);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('uses the API when nobody is signed in', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const viaApi = vi.fn(async () => ['api']);
    await readViaOwnerRpc('seald_list_contacts', undefined, undefined, viaApi);
    expect(viaApi).toHaveBeenCalledOnce();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns the RPC result and skips the API', async () => {
    let seen: AbortSignal | undefined;
    rpc.mockReturnValue(rpcResult({ data: ['rpc'], error: null }, (s) => (seen = s)));
    const viaApi = vi.fn(async () => ['api']);
    const controller = new AbortController();
    await expect(
      readViaOwnerRpc('seald_list_templates', undefined, controller.signal, viaApi),
    ).resolves.toEqual(['rpc']);
    expect(rpc).toHaveBeenCalledWith('seald_list_templates', undefined);
    expect(seen).toBe(controller.signal);
    expect(viaApi).not.toHaveBeenCalled();
  });

  it('falls back to the API when the RPC fails (for example, not deployed yet)', async () => {
    rpc.mockReturnValue(
      rpcResult({
        data: null,
        error: { code: 'PGRST202', message: 'Could not find the function' },
      }),
    );
    const viaApi = vi.fn(async () => ['api']);
    await expect(
      readViaOwnerRpc('seald_list_contacts', undefined, undefined, viaApi),
    ).resolves.toEqual(['api']);
  });

  it('rejects without calling the API when the read was aborted', async () => {
    const controller = new AbortController();
    rpc.mockReturnValue(
      rpcResult({ data: null, error: { message: 'AbortError' } }, () => controller.abort()),
    );
    const viaApi = vi.fn(async () => ['api']);
    await expect(
      readViaOwnerRpc('seald_list_contacts', undefined, controller.signal, viaApi),
    ).rejects.toBeDefined();
    expect(viaApi).not.toHaveBeenCalled();
  });
});

describe('listEnvelopes routing with ownerReadRpcs on', () => {
  beforeEach(() => {
    vi.spyOn(shared, 'isFeatureEnabled').mockImplementation((flag) => flag === 'ownerReadRpcs');
    getSession.mockResolvedValue(signedIn);
    rpc.mockReturnValue(rpcResult({ data: { items: [], next_cursor: null }, error: null }));
    vi.mocked(apiClient.get).mockResolvedValue({ data: { items: [], next_cursor: 'api' } });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    rpc.mockReset();
    vi.mocked(apiClient.get).mockReset();
  });

  it("serves the dashboard's newest-first page from the RPC", async () => {
    await listEnvelopes({ limit: 100, sort: 'date', dir: 'desc' });
    expect(rpc).toHaveBeenCalledWith('seald_list_envelopes', { p_limit: 100 });
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it('sends filtered, re-sorted or paged reads to the API', async () => {
    for (const params of [
      { q: 'lease' },
      { sort: 'title' as const },
      { dir: 'asc' as const },
      { cursor: 'abc' },
      { tags: ['hr'] },
      { statuses: ['completed' as const] },
    ]) {
      await listEnvelopes(params);
    }
    expect(rpc).not.toHaveBeenCalled();
    expect(apiClient.get).toHaveBeenCalledTimes(6);
  });
});

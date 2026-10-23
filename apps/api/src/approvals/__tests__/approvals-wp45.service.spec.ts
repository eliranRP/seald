import { InMemoryApprovalsRepository } from '../../../test/in-memory-approvals-repository';
import { InMemoryOutboundEmailsRepository } from '../../../test/in-memory-outbound-emails-repository';
import type { ApiKeyRecord, ApiKeysService } from '../../api-keys/api-keys.service';
import type { AuthUser } from '../../auth/auth-user';
import type { AppEnv } from '../../config/env.schema';
import { PassthroughTransactionRunner } from '../../db/transaction-runner';
import type { EnvelopeDocumentsService } from '../../envelopes/documents/envelope-documents.service';
import type { EnvelopesRepository } from '../../envelopes/envelopes.repository';
import type { EnvelopesService } from '../../envelopes/envelopes.service';
import type { GDriveService } from '../../integrations/gdrive/gdrive.service';
import type { MeService } from '../../me/me.service';
import {
  apiKeyCreateHandler,
  apiKeyRevokeHandler,
  approvalRequiredToggleHandler,
} from '../../mcp/tools/api-keys/api-key-approval-kinds';
import {
  accountDeleteHandler,
  accountExportHandler,
} from '../../mcp/tools/account/account-approval-kinds';
import type { AccessAuthService } from '../../signing/access-auth/access-auth.service';
import type { SigningService } from '../../signing/signing.service';
import { ApprovalCsrf } from '../approval-csrf';
import { ApprovalMailBreaker } from '../approval-mail-breaker';
import { ApprovalsLifecycleService } from '../approvals-lifecycle.service';
import { ApprovalsService } from '../approvals.service';
import { ApprovalKindRegistry } from '../kinds/approval-kind.registry';
import { SendGuardService } from '../send-guard.service';

/**
 * WP-45 (D5) through the real ApprovalsService and the real kind
 * handlers: nothing runs before Approve; Deny and expiry leave state
 * unchanged; Approve needs a sign-in from the last 10 minutes; the
 * account email typed on the page; a key never mints a wider key; the
 * new key's secret reaches only the Approve response.
 */

const OWNER = '00000000-0000-4000-8000-0000000000a1';
const KEY = '00000000-0000-4000-8000-0000000000c1';
const OTHER_KEY = '00000000-0000-4000-8000-0000000000c2';
const NOW = new Date('2026-10-23T12:00:00.000Z');
const HOUR = 3_600_000;
const OWNER_EMAIL = 'owner@example.com';
const FAKE_SECRET = `seald_live_${'x'.repeat(43)}`;

const env = {
  NODE_ENV: 'test',
  APP_PUBLIC_URL: 'https://seald.test/',
  APPROVAL_CSRF_KEY: 'k'.repeat(40),
} as unknown as AppEnv;

function keyRow(over: Partial<ApiKeyRecord> = {}): ApiKeyRecord {
  return {
    id: KEY,
    ownerId: OWNER,
    name: 'Key 2',
    prefix: 'seald_live_abcdefgh',
    keyHash: 'h'.repeat(64),
    scopes: ['envelopes:read', 'keys:admin', 'account:admin'],
    requireOwnerApproval: true,
    allowNewRecipients: false,
    alwaysRequireSignin: false,
    createdAt: '2026-10-01T00:00:00.000Z',
    lastUsedAt: null,
    expiresAt: new Date(NOW.getTime() + 30 * 24 * HOUR).toISOString(),
    revokedAt: null,
    ...over,
  };
}

function setup() {
  const repo = new InMemoryApprovalsRepository();
  repo.keys.set(KEY, {
    id: KEY,
    ownerId: OWNER,
    name: 'Key 2',
    prefix: 'seald_live_abcdefgh',
    revokedAt: null,
    expiresAt: new Date(NOW.getTime() + 30 * 24 * HOUR).toISOString(),
    alwaysRequireSignin: false,
    allowNewRecipients: false,
    approvalNotify: 'email',
  });
  repo.mailboxes.set(OWNER, { email: OWNER_EMAIL, verified: true });
  const calls: string[] = [];
  const keys: ApiKeyRecord[] = [keyRow(), keyRow({ id: OTHER_KEY, name: 'Zapier' })];
  const apiKeys = {
    listForOwner: async () => keys,
    findOwned: async (_o: string, id: string) => keys.find((k) => k.id === id) ?? null,
    createOnApproval: async (input: { scopes: string[] }) => {
      calls.push(`create:${input.scopes.join(',')}`);
      return {
        key: {
          id: '00000000-0000-4000-8000-0000000000d9',
          name: 'Key 3',
          prefix: 'seald_live_newkey00',
          scopes: input.scopes,
          expires_at: '2027-01-21T12:00:00.000Z',
        },
        secret: FAKE_SECRET,
      };
    },
    revokeForOwner: async (_o: string, id: string) => {
      calls.push(`revoke:${id}`);
      return { revoked: true };
    },
    setRequireOwnerApproval: async (_o: string, id: string, value: boolean) => {
      calls.push(`require:${id}:${String(value)}`);
      return keys.find((k) => k.id === id);
    },
  } as unknown as ApiKeysService;
  const me = {
    deleteAccount: async (u: AuthUser) => {
      calls.push(`delete:${u.id}:${u.email ?? ''}`);
      // Deletion removes the approval rows too.
      await repo.deleteAllForOwner(u.id);
    },
  } as unknown as MeService;
  const lifecycle = new ApprovalsLifecycleService(repo);
  const guard = new SendGuardService(
    {
      lockOwner: async () => undefined,
      lockEnvelope: async () => undefined,
      usageSince: async () => ({ sends: 0, newRecipients: 0 }),
      deliveryHealthSince: async () => ({ sent: 0, bounced: 0, complaints: 0 }),
    },
    lifecycle,
  );
  const registry = new ApprovalKindRegistry(
    {} as EnvelopesService,
    {} as EnvelopeDocumentsService,
    {} as GDriveService,
    guard,
    {} as AccessAuthService,
    {} as SigningService,
  );
  registry.register(accountDeleteHandler(me));
  registry.register(accountExportHandler());
  registry.register(apiKeyCreateHandler(apiKeys));
  registry.register(apiKeyRevokeHandler(apiKeys));
  registry.register(approvalRequiredToggleHandler(apiKeys));
  const envelopesRepo = {
    appendEvent: async () => ({ id: 'evt' }),
  } as unknown as EnvelopesRepository;
  const svc = new ApprovalsService(
    repo,
    registry,
    new ApprovalMailBreaker(repo, env),
    lifecycle,
    new ApprovalCsrf(env),
    new InMemoryOutboundEmailsRepository(),
    envelopesRepo,
    env,
    new PassthroughTransactionRunner(),
  );
  return { repo, svc, calls, keys };
}

const requester = { ownerId: OWNER, apiKeyId: KEY };
const audit = { ip: '203.0.113.9', userAgent: 'Browser/1' };

function signedIn(minutesAgo: number): AuthUser {
  return {
    id: OWNER,
    email: OWNER_EMAIL,
    provider: 'email',
    lastSignInAt: NOW.getTime() / 1000 - minutesAgo * 60,
  };
}

describe('ApprovalsService with the WP-45 kinds', () => {
  it('every kind opens a session-only approval and runs nothing', async () => {
    const w = setup();
    const asks = [
      { kind: 'account_delete' as const, args: {} },
      { kind: 'account_export' as const, args: {} },
      {
        kind: 'api_key_create' as const,
        args: { scopes: ['envelopes:read'], expires_in_days: 90 },
      },
      { kind: 'api_key_revoke' as const, args: { api_key_id: OTHER_KEY } },
      {
        kind: 'approval_required_toggle' as const,
        args: { api_key_id: OTHER_KEY, require_owner_approval: false },
      },
    ];
    for (const ask of asks) {
      const res = await w.svc.request({ requester, ...ask, now: NOW });
      expect({ kind: ask.kind, approve_requires: res.approve_requires }).toEqual({
        kind: ask.kind,
        approve_requires: 'session',
      });
    }
    expect(w.repo.rows).toHaveLength(asks.length);
    expect(w.calls).toEqual([]);
  });

  it('Deny and expiry leave everything unchanged', async () => {
    const w = setup();
    const del = await w.svc.request({ requester, kind: 'account_delete', args: {}, now: NOW });
    const denied = await w.svc.denyInApp(signedIn(1), del.approval_id, audit, NOW);
    expect(denied.status).toBe('denied');
    const rev = await w.svc.request({
      requester,
      kind: 'api_key_revoke',
      args: { api_key_id: OTHER_KEY },
      now: NOW,
    });
    const late = new Date(NOW.getTime() + 25 * HOUR);
    const user = { ...signedIn(1), lastSignInAt: late.getTime() / 1000 - 60 };
    const expired = await w.svc.approveInApp(user, rev.approval_id, audit, late);
    expect(expired.status).toBe('expired');
    expect(w.calls).toEqual([]);
  });

  it('Approve needs a sign-in from the last 10 minutes (12 hours is not enough)', async () => {
    const w = setup();
    const res = await w.svc.request({ requester, kind: 'account_export', args: {}, now: NOW });
    await expect(w.svc.approveInApp(signedIn(60), res.approval_id, audit, NOW)).rejects.toThrow(
      'fresh_login_required',
    );
    expect(w.repo.rows[0]?.approvedAt).toBeNull();
    const done = await w.svc.approveInApp(signedIn(2), res.approval_id, audit, NOW);
    expect(done).toMatchObject({ status: 'done', result: { export_ready: true } });
  });

  it('account_delete: a wrong typed email records nothing; the right one deletes and reads Done', async () => {
    const w = setup();
    const res = await w.svc.request({ requester, kind: 'account_delete', args: {}, now: NOW });
    for (const body of [{}, { confirm_email: 'someone@else.test' }]) {
      await expect(
        w.svc.approveInApp(signedIn(1), res.approval_id, audit, NOW, body),
      ).rejects.toThrow('confirmation_mismatch');
    }
    expect(w.repo.rows[0]?.approvedAt).toBeNull();
    expect(w.calls).toEqual([]);

    const done = await w.svc.approveInApp(signedIn(1), res.approval_id, audit, NOW, {
      confirm_email: ' Owner@Example.com ',
    });
    expect(w.calls).toEqual([`delete:${OWNER}:${OWNER_EMAIL}`]);
    // The row went with the account; the page still gets Done.
    expect(w.repo.rows).toHaveLength(0);
    expect(done).toMatchObject({ status: 'done', result: { deleted: true } });
  });

  it('api_key_create: the secret is in the Approve response only, never stored', async () => {
    const w = setup();
    const res = await w.svc.request({
      requester,
      kind: 'api_key_create',
      args: { name: 'Zapier 2', scopes: ['envelopes:read'], expires_in_days: 30 },
      now: NOW,
    });
    expect(JSON.stringify(res)).not.toContain('seald_live_');
    expect(res.summary.facts).toEqual([
      { label: 'Name', value: 'Zapier 2' },
      { label: 'Scopes', value: 'envelopes:read' },
      { label: 'Expires', value: '30 days after you approve' },
    ]);
    const done = await w.svc.approveInApp(signedIn(1), res.approval_id, audit, NOW);
    expect(done.reveal).toEqual({ api_key_secret: FAKE_SECRET });
    expect(JSON.stringify(w.repo.rows)).not.toContain(FAKE_SECRET);
    expect(done.result).toMatchObject({ key_hint: 'newkey00', scopes: ['envelopes:read'] });
    // Reading it again shows no secret.
    const again = await w.svc.get(signedIn(1), res.approval_id, NOW);
    expect(again.reveal).toBeUndefined();
    expect(w.calls).toEqual(['create:envelopes:read']);
  });

  it('api_key_create: never wider than the asking key, at request and at decision', async () => {
    const w = setup();
    await expect(
      w.svc.request({
        requester,
        kind: 'api_key_create',
        args: { scopes: ['envelopes:send'], expires_in_days: 90 },
        now: NOW,
      }),
    ).rejects.toThrow('scope_exceeds_key');
    const res = await w.svc.request({
      requester,
      kind: 'api_key_create',
      args: { scopes: ['account:admin'], expires_in_days: 90 },
      now: NOW,
    });
    // The owner narrows the asking key before deciding: the approval fails.
    w.keys[0] = keyRow({ scopes: ['envelopes:read', 'keys:admin'] });
    const out = await w.svc.approveInApp(signedIn(1), res.approval_id, audit, NOW);
    expect(out).toMatchObject({ status: 'failed', result_slug: 'scope_exceeds_key' });
    expect(out.reveal).toBeUndefined();
    expect(w.calls).toEqual([]);
  });

  it('approval_required_toggle and api_key_revoke act only on Approve', async () => {
    const w = setup();
    const t = await w.svc.request({
      requester,
      kind: 'approval_required_toggle',
      args: { api_key_id: OTHER_KEY, require_owner_approval: false },
      now: NOW,
    });
    const r = await w.svc.request({
      requester,
      kind: 'api_key_revoke',
      args: { api_key_id: OTHER_KEY },
      now: NOW,
    });
    expect(w.calls).toEqual([]);
    await w.svc.approveInApp(signedIn(1), t.approval_id, audit, NOW);
    await w.svc.approveInApp(signedIn(1), r.approval_id, audit, NOW);
    expect(w.calls).toEqual([`require:${OTHER_KEY}:false`, `revoke:${OTHER_KEY}`]);
  });

  it('the toggle refuses a key that already sends without asking', async () => {
    const w = setup();
    w.keys[1] = keyRow({ id: OTHER_KEY, requireOwnerApproval: false });
    await expect(
      w.svc.request({
        requester,
        kind: 'approval_required_toggle',
        args: { api_key_id: OTHER_KEY, require_owner_approval: false },
        now: NOW,
      }),
    ).rejects.toThrow('approval_already_off');
  });

  it('the email link never approves a WP-45 kind', async () => {
    const w = setup();
    const res = await w.svc.request({ requester, kind: 'account_export', args: {}, now: NOW });
    expect(res.approve_requires).toBe('session');
    expect(w.repo.rows[0]?.approveRequires).toBe('session');
  });
});

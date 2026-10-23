import { ConflictException, ForbiddenException, HttpException } from '@nestjs/common';
import type { AccountDirectoryService } from '../../../../accounts/account-directory.service';
import type { AgentCredential } from '../../../../approvals/agent-envelope-actions.service';
import type { ApprovalsService } from '../../../../approvals/approvals.service';
import type { SendGuardService } from '../../../../approvals/send-guard.service';
import type { BulkService } from '../../../../bulk/bulk.service';
import { AgentBulkService } from '../agent-bulk.service';
import { APPROVAL_ID, BATCH_ID, KEY_ID, NOW, OWNER, TEMPLATE_ID, pending } from './later-harness';

const cred: AgentCredential = {
  ownerId: OWNER,
  keyId: KEY_ID,
  keyName: 'Key 1',
  keyPrefix: 'seald_live_abcd',
  requireOwnerApproval: true,
  allowNewRecipients: false,
};
const rows = [
  { title: 'A', signers: [{ name: 'Ada', email: 'ada@example.com' }] },
  { signers: [{ name: 'Bob', email: 'bob@example.com' }] },
];

function world(opts: { ownerEmail?: string | null; capError?: Error; invalid?: boolean } = {}) {
  const order: string[] = [];
  const bulk = {
    validateRows: async () => {
      order.push('validateRows');
      return {
        slots: [{ slot: 1 }],
        validated: {
          rows: opts.invalid
            ? [
                { row: 1, errors: [{ code: 'bad_email' }] },
                { row: 2, errors: [] },
              ]
            : [
                { row: 1, errors: [] },
                { row: 2, errors: [] },
              ],
        },
      };
    },
    createFromRows: async () => {
      order.push('createFromRows');
      return { id: BATCH_ID };
    },
    get: async (...args: unknown[]) => {
      order.push(`get:${String(args[1])}`);
      return { id: BATCH_ID };
    },
  } as unknown as BulkService;
  const approvals = {
    request: async (input: Record<string, unknown>) => {
      order.push(`request:${String(input['kind'])}`);
      expect(input['args']).toEqual({ batch_id: BATCH_ID });
      expect(input['requester']).toEqual({ ownerId: OWNER, apiKeyId: KEY_ID, oauthGrantId: null });
      return pending({ approval_id: APPROVAL_ID });
    },
  } as unknown as ApprovalsService;
  const guard = {
    assertNotSuspended: async () => {
      order.push('assertNotSuspended');
    },
    assertCaps: async (...args: unknown[]) => {
      order.push(`assertCaps:${String(args[3])}`);
      if (opts.capError) throw opts.capError;
    },
  } as unknown as SendGuardService;
  const accounts = {
    email: async () => (opts.ownerEmail === undefined ? 'owner@example.com' : opts.ownerEmail),
  } as unknown as AccountDirectoryService;
  return { svc: new AgentBulkService(bulk, approvals, guard, accounts), order };
}

describe('AgentBulkService', () => {
  it('request: checks first, saves the preview, then asks once for the whole batch', async () => {
    const { svc, order } = world();
    const out = await svc.request(cred, TEMPLATE_ID, rows, NOW);
    expect(out).toMatchObject({ status: 'approval_pending', batch_id: BATCH_ID });
    expect(order).toEqual([
      'assertNotSuspended',
      'validateRows',
      'assertCaps:2',
      'createFromRows',
      'request:bulk_send',
    ]);
  });

  it('request: over the daily cap nothing is saved', async () => {
    const cap = new HttpException({ message: 'send_daily_cap', retryAfter: 60 }, 429);
    const { svc, order } = world({ capError: cap });
    await expect(svc.request(cred, TEMPLATE_ID, rows, NOW)).rejects.toBe(cap);
    expect(order).not.toContain('createFromRows');
    expect(order).not.toContain('request:bulk_send');
  });

  it('request: the account’s own mailbox is refused before anything is read', async () => {
    const { svc, order } = world({ ownerEmail: 'ADA@example.com' });
    await expect(svc.request(cred, TEMPLATE_ID, rows, NOW)).rejects.toThrow(ConflictException);
    expect(order).toEqual(['assertNotSuspended']);
  });

  it('needs a verified account email to ask the owner', async () => {
    const { svc } = world({ ownerEmail: null });
    await expect(svc.request(cred, TEMPLATE_ID, rows, NOW)).rejects.toThrow(ForbiddenException);
  });

  it('check: reports invalid rows and the size rule without writing', async () => {
    const { svc, order } = world({ invalid: true });
    const out = await svc.check(cred, TEMPLATE_ID, rows, NOW);
    expect(out).toMatchObject({
      rows: 2,
      valid: false,
      invalid_rows: [{ row: 1, errors: ['bad_email'] }],
      approve_requires: 'link_or_session',
    });
    expect(order).not.toContain('createFromRows');
    const six = Array.from({ length: 6 }, () => rows[0] as (typeof rows)[0]);
    expect((await world().svc.check(cred, TEMPLATE_ID, six, NOW))['approve_requires']).toBe(
      'session',
    );
  });

  it('get reads the owner’s batch', async () => {
    const { svc, order } = world();
    await svc.get(OWNER, BATCH_ID);
    expect(order).toEqual([`get:${BATCH_ID}`]);
  });
});

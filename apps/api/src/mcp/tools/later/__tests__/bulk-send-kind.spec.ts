import { ConflictException, NotFoundException } from '@nestjs/common';
import type { BulkBatch, McpEventMetadata } from 'shared';
import type { ApprovalExecuteContext } from '../../../../approvals/kinds/approval-kind';
import type { SendGuardService } from '../../../../approvals/send-guard.service';
import type { BulkService } from '../../../../bulk/bulk.service';
import { bulkSendKindHandler } from '../bulk-send-kind';
import { BATCH_ID, NOW, OWNER } from './later-harness';

const MCP: McpEventMetadata = {
  auth: 'api_key',
  key_id: '99999999-9999-4999-8999-999999999999',
  key_prefix: 'seald_live_abcd',
  key_name: 'Key 2',
  oauth_client_id: null,
  oauth_grant_id: null,
  acting_for_user_id: OWNER,
  acting_for_email: 'owner@example.com',
  tool: 'envelopes_bulk_send_from_template',
  approval: 'email',
  approved_by_session: true,
};

const row = (n: number, status: BulkBatch['rows'][number]['status'] = 'pending') => ({
  row: n,
  status,
  recipients: [{ name: `Tenant ${String(n)}`, email: `T${String(n)}@Example.com` }],
  title: `Lease ${String(n)}`,
  errors: [],
  envelope_id: null,
  error_code: null,
});

function batch(overrides: Partial<BulkBatch> = {}): BulkBatch {
  return {
    id: BATCH_ID,
    template_id: '55555555-5555-4555-8555-555555555555',
    template_title: 'Lease',
    status: 'preview',
    filename: null,
    slots: [],
    column_errors: [],
    ignored_columns: [],
    counts: { total: 3, invalid: 0, pending: 3, processing: 0, sent: 0, failed: 0, canceled: 0 },
    confirmable: true,
    rows: [row(1), row(2), row(3)],
    created_at: '2026-10-02T11:00:00.000Z',
    confirmed_at: null,
    completed_at: null,
    canceled_at: null,
    ...overrides,
  };
}

function world(initial: BulkBatch = batch()) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  let current = initial;
  const bulk = {
    get: async (...args: unknown[]) => {
      calls.push({ method: 'get', args });
      if (args[1] !== BATCH_ID) throw new NotFoundException('bulk_batch_not_found');
      return current;
    },
    confirmForAgent: async (...args: unknown[]) => {
      calls.push({ method: 'confirmForAgent', args });
      current = { ...current, status: 'processing' };
      return current;
    },
  } as unknown as BulkService;
  const guard = {
    assertCaps: async (...args: unknown[]) => {
      calls.push({ method: 'assertCaps', args });
    },
    assertCapsLocked: async (...args: unknown[]) => {
      calls.push({ method: 'assertCapsLocked', args });
    },
  } as unknown as SendGuardService;
  return {
    handler: bulkSendKindHandler({ bulk, guard }),
    calls,
    set: (b: BulkBatch) => (current = b),
  };
}

const ctx = { ownerId: OWNER, ownerEmail: 'owner@example.com', now: NOW };
const execCtx = (extra: Partial<ApprovalExecuteContext> = {}): ApprovalExecuteContext => ({
  ...ctx,
  approvalId: '44444444-4444-4444-8444-444444444444',
  audit: { ip: null, user_agent: null },
  mcp: MCP,
  ...extra,
});

describe('bulk_send approval kind', () => {
  it('describes the whole batch: every recipient once, the row count, and a title from the template', async () => {
    const { handler } = world();
    const subject = await handler.describe({ batch_id: BATCH_ID }, ctx);
    expect(subject).toMatchObject({
      subjectKey: `bulk:${BATCH_ID}`,
      envelopeId: null,
      title: 'Lease',
      batchSize: 3,
      files: [],
      fields: [],
      recipients: [
        { name: 'Tenant 1', email: 'T1@Example.com' },
        { name: 'Tenant 2', email: 'T2@Example.com' },
        { name: 'Tenant 3', email: 'T3@Example.com' },
      ],
    });
    expect(handler.highRisk({ batch_id: BATCH_ID })).toBe(false);
  });

  it('lists a repeated address once and skips rows that will not send', async () => {
    const dup = row(2);
    const { handler } = world(
      batch({
        rows: [
          row(1),
          { ...dup, recipients: [{ name: 'Tenant 1 again', email: 't1@example.com' }] },
          row(3, 'invalid'),
        ],
      }),
    );
    const subject = await handler.describe({ batch_id: BATCH_ID }, ctx);
    expect(subject.recipients).toEqual([{ name: 'Tenant 1', email: 'T1@Example.com' }]);
    expect(subject.batchSize).toBe(2);
  });

  it('binds the rows: a changed title or recipient changes the hashed facts', async () => {
    const a = await world().handler.describe({ batch_id: BATCH_ID }, ctx);
    const edited = batch({ rows: [{ ...row(1), title: 'Changed' }, row(2), row(3)] });
    const b = await world(edited).handler.describe({ batch_id: BATCH_ID }, ctx);
    expect(JSON.stringify(a.extra)).not.toBe(JSON.stringify(b.extra));
    expect(JSON.stringify(a.extra)).toBe(
      JSON.stringify((await world().handler.describe({ batch_id: BATCH_ID }, ctx)).extra),
    );
  });

  it('refuses a batch that was already approved, canceled, expired or has no valid row', async () => {
    for (const [b, slug] of [
      [batch({ status: 'processing' }), 'bulk_batch_not_pending'],
      [batch({ status: 'canceled' }), 'bulk_batch_not_pending'],
      [batch({ confirmable: false }), 'bulk_preview_expired'],
      [batch({ rows: [row(1, 'invalid')] }), 'bulk_no_valid_rows'],
    ] as const) {
      await expect(world(b).handler.describe({ batch_id: BATCH_ID }, ctx)).rejects.toThrow(slug);
    }
    await expect(
      world().handler.describe({ batch_id: '66666666-6666-4666-8666-666666666667' }, ctx),
    ).rejects.toThrow(NotFoundException);
  });

  it('counts every valid row as a send against the daily cap, at request and again under the lock', async () => {
    const w = world();
    await w.handler.checkLimits?.({ batch_id: BATCH_ID }, { ...ctx, newRecipients: 2 });
    expect(w.calls.find((c) => c.method === 'assertCaps')?.args).toEqual([OWNER, 2, NOW, 3]);
    await w.handler.execute(
      { batch_id: BATCH_ID },
      execCtx({ newRecipientEmails: new Set(['t1@example.com']) }),
    );
    expect(w.calls.find((c) => c.method === 'assertCapsLocked')?.args).toEqual([OWNER, 1, NOW, 3]);
  });

  it('execute confirms the batch with the decision’s attribution and the new recipients', async () => {
    const w = world();
    const out = await w.handler.execute(
      { batch_id: BATCH_ID },
      execCtx({ newRecipientEmails: new Set(['t2@example.com', 't1@example.com']) }),
    );
    expect(out).toEqual({ batch_id: BATCH_ID, status: 'processing', rows: 3 });
    expect(w.calls.find((c) => c.method === 'confirmForAgent')?.args).toEqual([
      OWNER,
      BATCH_ID,
      { mcp: MCP, new_recipient_emails: ['t2@example.com', 't1@example.com'] },
      NOW,
    ]);
  });

  it('execute fails closed when the batch moved on, and never without attribution', async () => {
    const w = world();
    w.set(batch({ status: 'canceled' }));
    await expect(w.handler.execute({ batch_id: BATCH_ID }, execCtx())).rejects.toThrow(
      ConflictException,
    );
    const w2 = world();
    const { mcp: _mcp, ...noMcp } = execCtx();
    await expect(w2.handler.execute({ batch_id: BATCH_ID }, noMcp)).rejects.toThrow(
      'approval_credential_unsupported',
    );
    expect(w2.calls.find((c) => c.method === 'confirmForAgent')).toBeUndefined();
  });
});

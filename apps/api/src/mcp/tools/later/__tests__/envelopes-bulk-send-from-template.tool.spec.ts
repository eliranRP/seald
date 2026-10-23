import { HttpException, HttpStatus, UnprocessableEntityException } from '@nestjs/common';
import { EnvelopesBulkSendFromTemplateOutputSchema } from 'shared';
import { findTokenShapedStrings } from '../../../leak-scan';
import { listTools } from '../../../tool-catalog';
import { resetFlags, setFlags } from '../../__tests__/write-harness';
import {
  BATCH_ID,
  OWNER,
  TEMPLATE_ID,
  call,
  dry,
  errorOf,
  laterWorld,
  ok,
  pending,
  principal,
  write,
} from './later-harness';

const SCOPES = ['envelopes:read', 'envelopes:send', 'templates:read'] as const;
const row = (n: number) => ({
  title: `Lease ${String(n)}`,
  signers: [{ name: `Tenant ${String(n)}`, email: `tenant${String(n)}@example.com` }],
});

describe('envelopes_bulk_send_from_template', () => {
  beforeEach(() => {
    setFlags();
  });
  afterEach(() => {
    resetFlags();
  });

  it('returns approval_pending with the batch id', async () => {
    const w = laterWorld();
    w.answers.set('agentBulk.request', {
      ...pending({ summary: { ...pending().summary, kind: 'bulk_send' } }),
      batch_id: BATCH_ID,
    });
    const out = ok(
      await call(
        w,
        'envelopes_bulk_send_from_template',
        write({ template_id: TEMPLATE_ID, rows: [row(1), row(2)] }),
        principal(SCOPES),
      ),
    );
    expect(EnvelopesBulkSendFromTemplateOutputSchema.safeParse(out).success).toBe(true);
    expect(out).toMatchObject({ status: 'approval_pending', batch_id: BATCH_ID });
    expect(findTokenShapedStrings(out)).toEqual([]);
    const [c] = w.calls;
    expect(c?.method).toBe('request');
    expect((c?.args[0] as { ownerId: string }).ownerId).toBe(OWNER);
    expect(c?.args[1]).toBe(TEMPLATE_ID);
    expect(c?.args[2]).toHaveLength(2);
    expect(w.atomicRuns.count).toBe(2);
  });

  it('caps a call at 20 rows and takes no prefill', async () => {
    const w = laterWorld();
    const many = Array.from({ length: 21 }, (_, i) => row(i + 1));
    expect(
      errorOf(
        await call(
          w,
          'envelopes_bulk_send_from_template',
          write({ template_id: TEMPLATE_ID, rows: many }),
          principal(SCOPES),
        ),
      ).slug,
    ).toBe('validation_error');
    expect(
      errorOf(
        await call(
          w,
          'envelopes_bulk_send_from_template',
          write({
            template_id: TEMPLATE_ID,
            rows: [{ ...row(1), prefill: { Name: 'x' } }],
          }),
          principal(SCOPES),
        ),
      ).slug,
    ).toBe('validation_error');
    expect(w.calls).toEqual([]);
  });

  it('exactly 20 rows pass the schema', async () => {
    const w = laterWorld();
    w.answers.set('agentBulk.request', { ...pending(), batch_id: BATCH_ID });
    const twenty = Array.from({ length: 20 }, (_, i) => row(i + 1));
    ok(
      await call(
        w,
        'envelopes_bulk_send_from_template',
        write({ template_id: TEMPLATE_ID, rows: twenty }),
        principal(SCOPES),
      ),
    );
    expect(w.calls).toHaveLength(1);
  });

  it('maps the cap and an invalid row to their slugs', async () => {
    const w = laterWorld();
    w.answers.set(
      'agentBulk.request',
      new HttpException(
        { message: 'send_daily_cap', retryAfter: 3600 },
        HttpStatus.TOO_MANY_REQUESTS,
      ),
    );
    const args = { template_id: TEMPLATE_ID, rows: [row(1)] };
    const capped = errorOf(
      await call(w, 'envelopes_bulk_send_from_template', write(args), principal(SCOPES)),
    );
    expect(capped).toMatchObject({ slug: 'send_daily_cap', retryable: true });
    w.answers.set('agentBulk.request', new UnprocessableEntityException('bulk_rows_invalid'));
    expect(
      errorOf(await call(w, 'envelopes_bulk_send_from_template', write(args), principal(SCOPES)))
        .slug,
    ).toBe('bulk_rows_invalid');
  });

  it('dry_run reports row problems without writing', async () => {
    const w = laterWorld();
    w.answers.set('agentBulk.check', {
      valid: false,
      invalid_rows: [{ row: 1, errors: ['bad_email'] }],
    });
    const out = ok(
      await call(
        w,
        'envelopes_bulk_send_from_template',
        dry({ template_id: TEMPLATE_ID, rows: [row(1)] }),
        principal(SCOPES),
      ),
    );
    expect(out).toMatchObject({ dry_run: true, would: { valid: false } });
    expect(w.calls.map((c) => c.method)).toEqual(['check']);
  });

  it('needs both scopes and the bulkSend flag', async () => {
    const w = laterWorld();
    expect(
      errorOf(
        await call(
          w,
          'envelopes_bulk_send_from_template',
          write({ template_id: TEMPLATE_ID, rows: [row(1)] }),
          principal(['envelopes:send']),
        ),
      ).slug,
    ).toBe('insufficient_scope');
    setFlags({ bulkSend: false });
    expect(listTools().map((t) => t.name)).not.toContain('envelopes_bulk_send_from_template');
    expect(listTools().map((t) => t.name)).not.toContain('batches_get');
  });
});

import { Logger } from '@nestjs/common';
import { AUTOMATION_MAX_ATTEMPTS } from 'shared';
import { InMemoryOutboundEmailsRepository } from '../../../../../test/in-memory-outbound-emails-repository';
import type { AppEnv } from '../../../../config/env.schema';
import type { ClaimedAutomationJob } from '../../../automations.repository.pg';
import {
  EMAIL_COPY_DAILY_CAP,
  nextUtcMidnight,
  normalizeEmail,
  parseEmailCopyConfig,
} from '../email-copy.config';
import { EmailCopyActionExecutor } from '../email-copy.executor';
import { FakeEmailCopyRepo } from './fake-email-copy-repo';

const NOW = new Date('2026-10-22T12:00:00.000Z');
const ENV = { APP_PUBLIC_URL: 'https://seald.nromomentum.com' } as AppEnv;

function job(overrides: Partial<ClaimedAutomationJob> = {}): ClaimedAutomationJob {
  return {
    job_id: 'job-1',
    run_id: '44444444-4444-4444-8444-444444444444',
    automation_id: '33333333-3333-4333-8333-333333333333',
    attempts: 1,
    max_attempts: AUTOMATION_MAX_ATTEMPTS,
    owner_id: 'owner-1',
    envelope_id: 'env-1',
    event_id: 'evt-1',
    signer_id: null,
    trigger: 'envelope_sealed',
    action: 'email_copy',
    config: { to: ['Ada@Example.com ', 'bob@example.com'] },
    ...overrides,
  };
}

describe('email_copy config', () => {
  it('normalizes, dedupes and caps recipients', () => {
    expect(normalizeEmail('  Ada@Example.COM ')).toBe('ada@example.com');
    expect(normalizeEmail('not-an-email')).toBeNull();
    expect(normalizeEmail(`${'a'.repeat(320)}@example.com`)).toBeNull();
    expect(parseEmailCopyConfig({ to: ['A@x.io', 'a@x.io'] })).toEqual({
      ok: true,
      to: ['a@x.io'],
    });
    expect(parseEmailCopyConfig({})).toEqual({ ok: true, to: [] });
    expect(parseEmailCopyConfig({ to: 'a@x.io' })).toEqual({ ok: false, slug: 'bad_config' });
    expect(parseEmailCopyConfig({ to: ['a@x.io', 'nope'] })).toEqual({
      ok: false,
      slug: 'bad_config',
    });
    const eleven = Array.from({ length: 11 }, (_, i) => `u${i}@x.io`);
    expect(parseEmailCopyConfig({ to: eleven })).toEqual({
      ok: false,
      slug: 'too_many_recipients',
    });
  });

  it('computes the next UTC midnight', () => {
    expect(nextUtcMidnight(new Date('2026-10-22T23:59:59.000Z')).toISOString()).toBe(
      '2026-10-23T00:00:00.000Z',
    );
  });
});

describe('EmailCopyActionExecutor', () => {
  let repo: FakeEmailCopyRepo;
  let outbound: InMemoryOutboundEmailsRepository;
  let exec: EmailCopyActionExecutor;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    repo = new FakeEmailCopyRepo();
    outbound = new InMemoryOutboundEmailsRepository();
    exec = new EmailCopyActionExecutor(repo, outbound, ENV);
  });
  afterEach(() => jest.restoreAllMocks());

  it('queues one automation_copy row per recipient with a run-scoped dedupe key', async () => {
    expect(await exec.execute(job(), NOW)).toEqual({ kind: 'done' });
    expect(outbound.rows.map((r) => [r.kind, r.to_email, r.dedupe_key])).toEqual([
      ['automation_copy', 'ada@example.com', `automation_copy:${job().run_id}:ada@example.com`],
      ['automation_copy', 'bob@example.com', `automation_copy:${job().run_id}:bob@example.com`],
    ]);
    const payload = outbound.rows[0]?.payload ?? {};
    expect(payload['verify_url']).toBe('https://seald.nromomentum.com/verify/AB12CD34EF56G');
    expect(payload['sender_email']).toBe('owner@example.com');
    // No signing link, download URL, attachment or stop token at enqueue time.
    expect(JSON.stringify(payload)).not.toMatch(/sign\/|\?t=|download|attachment|stop_url/i);
    // Non-owner recipients get no in-app link.
    expect(payload['dashboard_link_html']).toBe('');
  });

  it('is idempotent on a worker retry: no duplicate mail, no second quota spend', async () => {
    await exec.execute(job(), NOW);
    await exec.execute(job(), NOW);
    expect(outbound.rows).toHaveLength(2);
    expect(repo.sends).toHaveLength(2);
  });

  it('defaults to the sender mailbox and links the dashboard only there', async () => {
    expect(await exec.execute(job({ config: {} }), NOW)).toEqual({ kind: 'done' });
    expect(outbound.rows).toHaveLength(1);
    expect(outbound.rows[0]?.to_email).toBe('owner@example.com');
    expect(String(outbound.rows[0]?.payload['dashboard_link_html'])).toContain('/document/env-1');
  });

  it('includes the signer name for a signed trigger', async () => {
    repo.context = { ...repo.context!, signerName: 'Sam <b>Signer</b>' };
    await exec.execute(job({ trigger: 'signer_signed', signer_id: 'sg-1' }), NOW);
    const row = outbound.rows[0]!;
    expect(row.payload['event_phrase']).toBe('was signed');
    expect(String(row.payload['signer_row_html'])).toContain('Sam &lt;b&gt;Signer&lt;/b&gt;');
    expect(String(row.payload['signer_row_html'])).not.toContain('<b>');
  });

  it('skips addresses that used the stop link, and is done when none remain', async () => {
    repo.suppressions.add('owner-1|ada@example.com');
    await exec.execute(job(), NOW);
    expect(outbound.rows.map((r) => r.to_email)).toEqual(['bob@example.com']);
    repo.suppressions.add('owner-1|bob@example.com');
    outbound.reset();
    expect(await exec.execute(job({ run_id: 'run-2' }), NOW)).toEqual({ kind: 'done' });
    expect(outbound.rows).toHaveLength(0);
  });

  it('defers to the next UTC midnight over the cap, without failing or sending', async () => {
    for (let i = 0; i < EMAIL_COPY_DAILY_CAP - 1; i += 1) {
      repo.sends.push({ run_id: `r${i}`, email: 'x@x.io', owner_id: 'owner-1', day: '2026-10-22' });
    }
    const out = await exec.execute(job(), NOW);
    expect(out).toEqual({
      kind: 'deferred',
      slug: 'email_copy_daily_cap',
      until: new Date('2026-10-23T00:00:00.000Z'),
    });
    expect(outbound.rows).toHaveLength(0);
    // Next day the same run goes through.
    const next = new Date('2026-10-23T00:00:05.000Z');
    expect(await exec.execute(job(), next)).toEqual({ kind: 'done' });
    expect(outbound.rows).toHaveLength(2);
  });

  it('one owner at the cap does not hold another owner back', async () => {
    for (let i = 0; i < EMAIL_COPY_DAILY_CAP; i += 1) {
      repo.sends.push({ run_id: `r${i}`, email: 'x@x.io', owner_id: 'owner-1', day: '2026-10-22' });
    }
    expect((await exec.execute(job({ owner_id: 'owner-2' }), NOW)).kind).toBe('done');
  });

  it('fails permanently on a missing sender mailbox, bad config, or missing envelope', async () => {
    repo.context = { ...repo.context!, envelope: { ...repo.context!.envelope, senderEmail: null } };
    expect(await exec.execute(job(), NOW)).toEqual({
      kind: 'permanent',
      slug: 'sender_email_missing',
    });
    expect(await exec.execute(job({ config: { to: ['nope'] } }), NOW)).toEqual({
      kind: 'permanent',
      slug: 'bad_config',
    });
    expect(await exec.execute(job({ action: 'webhook' }), NOW)).toEqual({
      kind: 'permanent',
      slug: 'bad_config',
    });
    repo.context = null;
    expect(await exec.execute(job(), NOW)).toEqual({
      kind: 'permanent',
      slug: 'envelope_missing',
    });
  });
});

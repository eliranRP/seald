import { randomUUID } from 'node:crypto';
import type { FeatureFlag } from 'shared';
import { seedUser, type PgMemHandle } from '../../../test/pg-mem-db';
import type { AppEnv } from '../../config/env.schema';
import { EnvelopesPgRepository } from '../../envelopes/envelopes.repository.pg';
import type { AutomationHookEvent } from '../automation-event-hook';
import { AutomationsPgRepository } from '../automations.repository.pg';
import { withAutomationTables, type AutomationsDatabase } from '../automations.schema';
import { AutomationMatcherService, RESCAN_OVERLAP_MS } from '../matcher';
import { createAutomationsPgMemDb } from './pg-mem-automations';
import type { Kysely } from 'kysely';

type OverrideHost = { __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>> };
const host = globalThis as unknown as OverrideHost;

function env(overrides: Partial<AppEnv> = {}): AppEnv {
  return { WORKER_ENABLED: false, AUTOMATIONS_DISABLED: false, ...overrides } as AppEnv;
}

/** Matcher whose after-commit step does nothing: the "crash after commit" case. */
class NoAfterCommitMatcher extends AutomationMatcherService {
  override afterCommit(_event: AutomationHookEvent): void {}
}

let codeCounter = 0;
function shortCode(): string {
  codeCounter += 1;
  return `AM${String(codeCounter).padStart(11, '0')}`;
}

describe('AutomationMatcherService (pg-mem)', () => {
  let handle: PgMemHandle;
  let db: Kysely<AutomationsDatabase>;
  let repo: AutomationsPgRepository;
  let matcher: AutomationMatcherService;
  let envelopes: EnvelopesPgRepository;
  let ownerId: string;

  function build(m: AutomationMatcherService): void {
    matcher = m;
    envelopes = new EnvelopesPgRepository(handle.db, matcher);
  }

  beforeEach(async () => {
    host.__SEALD_FEATURE_OVERRIDES__ = { workflowAutomations: true };
    handle = createAutomationsPgMemDb();
    db = withAutomationTables(handle.db);
    repo = new AutomationsPgRepository(handle.db);
    build(new NoAfterCommitMatcher(repo, env()));
    ownerId = await seedUser(handle);
  });

  afterEach(async () => {
    delete host.__SEALD_FEATURE_OVERRIDES__;
    await handle.close();
  });

  async function seedEnvelope(): Promise<{ envelopeId: string; signerIds: string[] }> {
    const e = await envelopes.createDraft({
      owner_id: ownerId,
      title: 'Lease',
      short_code: shortCode(),
      tc_version: 'tc',
      privacy_version: 'pp',
      expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    const a = await envelopes.addSigner(e.id, {
      email: 'a@example.com',
      name: 'A',
      color: '#111111',
    });
    const b = await envelopes.addSigner(e.id, {
      email: 'b@example.com',
      name: 'B',
      color: '#222222',
    });
    return { envelopeId: e.id, signerIds: [a.id, b.id] };
  }

  async function addRecipe(opts: {
    recipe: string;
    trigger: 'envelope_sealed' | 'signer_signed' | 'signer_declined';
    action: 'webhook' | 'gdrive_upload' | 'email_copy';
    enabled?: boolean;
    templateId?: string;
    owner?: string;
  }): Promise<string> {
    const row = await db
      .insertInto('automations')
      .values({
        owner_id: opts.owner ?? ownerId,
        recipe: opts.recipe,
        name: opts.recipe,
        enabled: opts.enabled ?? true,
        trigger: opts.trigger,
        action: opts.action,
        scope: opts.templateId ? 'template' : 'account',
        template_id: opts.templateId ?? null,
        config: JSON.stringify({}),
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    return row.id;
  }

  const triggers = () => db.selectFrom('automation_triggers').selectAll().execute();
  const runs = () => db.selectFrom('automation_runs').selectAll().execute();
  const jobs = () => db.selectFrom('automation_jobs').selectAll().execute();

  it('the event transaction writes one pending trigger and no run or job', async () => {
    const { envelopeId } = await seedEnvelope();
    await addRecipe({
      recipe: 'sealed_save_drive',
      trigger: 'envelope_sealed',
      action: 'gdrive_upload',
    });

    const ev = await envelopes.appendEvent({
      envelope_id: envelopeId,
      actor_kind: 'system',
      event_type: 'sealed',
    });

    const t = await triggers();
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ event_id: ev.id, status: 'pending' });
    expect(await runs()).toHaveLength(0);
    expect(await jobs()).toHaveLength(0);
  });

  it('sealed enqueues sealed_save_drive and ignores a declined recipe (after a crash, via rescan)', async () => {
    const { envelopeId } = await seedEnvelope();
    const drive = await addRecipe({
      recipe: 'sealed_save_drive',
      trigger: 'envelope_sealed',
      action: 'gdrive_upload',
    });
    await addRecipe({
      recipe: 'declined_notify_me',
      trigger: 'signer_declined',
      action: 'email_copy',
    });

    const ev = await envelopes.appendEvent({
      envelope_id: envelopeId,
      actor_kind: 'system',
      event_type: 'sealed',
    });
    // Crash after commit: nothing matched yet.
    expect(await runs()).toHaveLength(0);

    const result = await matcher.rescan();
    expect(result).toMatchObject({ scanned: 1, matched: 1, runs: 1, failed: 0 });

    const r = await runs();
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      automation_id: drive,
      owner_id: ownerId,
      envelope_id: envelopeId,
      event_id: ev.id,
      signer_id: null,
      trigger: 'envelope_sealed',
      action: 'gdrive_upload',
      status: 'queued',
    });
    const j = await jobs();
    expect(j).toHaveLength(1);
    expect(j[0]).toMatchObject({ run_id: r[0]!.id, automation_id: drive, status: 'pending' });
    // Matched triggers are deleted on match (the run is the history).
    expect(await triggers()).toHaveLength(0);
  });

  it('matches after commit without a rescan', async () => {
    build(new AutomationMatcherService(repo, env()));
    const spy = jest.spyOn(matcher, 'matchEvent');
    const { envelopeId } = await seedEnvelope();
    await addRecipe({ recipe: 'sealed_webhook', trigger: 'envelope_sealed', action: 'webhook' });

    await envelopes.appendEvent({
      envelope_id: envelopeId,
      actor_kind: 'system',
      event_type: 'sealed',
    });
    expect(spy).toHaveBeenCalledTimes(1);
    await spy.mock.results[0]!.value;

    expect(await runs()).toHaveLength(1);
    expect(await jobs()).toHaveLength(1);
    expect(await triggers()).toHaveLength(0);
  });

  it('when the matcher throws, the event append still succeeds and the rescan inserts the run', async () => {
    build(new AutomationMatcherService(repo, env()));
    const spy = jest.spyOn(matcher, 'matchEvent');
    const { envelopeId, signerIds } = await seedEnvelope();
    await addRecipe({
      recipe: 'signed_notify_list',
      trigger: 'signer_signed',
      action: 'email_copy',
    });
    const boom = jest.spyOn(repo, 'matchTrigger').mockRejectedValueOnce(new Error('matcher bug'));

    const ev = await envelopes.appendEvent({
      envelope_id: envelopeId,
      signer_id: signerIds[0]!,
      actor_kind: 'signer',
      event_type: 'signed',
    });
    expect(ev.event_type).toBe('signed');
    await expect(spy.mock.results[0]!.value).resolves.toBeNull();
    expect(boom).toHaveBeenCalledTimes(1);

    // The event is committed; the trigger stays pending; nothing matched.
    const events = await handle.db
      .selectFrom('envelope_events')
      .select(['id'])
      .where('id', '=', ev.id)
      .execute();
    expect(events).toHaveLength(1);
    expect(await triggers()).toEqual([
      expect.objectContaining({ event_id: ev.id, status: 'pending' }),
    ]);
    expect(await runs()).toHaveLength(0);

    const result = await matcher.rescan();
    expect(result).toMatchObject({ matched: 1, runs: 1, failed: 0 });
    expect(await runs()).toEqual([
      expect.objectContaining({
        event_id: ev.id,
        signer_id: signerIds[0],
        trigger: 'signer_signed',
      }),
    ]);
    expect(await jobs()).toHaveLength(1);
  });

  it('two signers produce two runs; a duplicate for the same signer inserts one', async () => {
    const { envelopeId, signerIds } = await seedEnvelope();
    await addRecipe({
      recipe: 'signed_notify_list',
      trigger: 'signer_signed',
      action: 'email_copy',
    });
    for (const signerId of [signerIds[0]!, signerIds[1]!, signerIds[0]!]) {
      await envelopes.appendEvent({
        envelope_id: envelopeId,
        signer_id: signerId,
        actor_kind: 'signer',
        event_type: 'signed',
      });
    }
    const result = await matcher.rescan();
    expect(result).toMatchObject({ scanned: 3, matched: 3, runs: 2 });
    const r = await runs();
    expect(r.map((x) => x.signer_id).sort()).toEqual([...signerIds].sort());
    expect(await jobs()).toHaveLength(2);
    expect(await triggers()).toHaveLength(0);

    // A second match of an already-matched event is a no-op.
    expect(await repo.matchTrigger(r[0]!.event_id!)).toEqual({ kind: 'not_pending' });
  });

  it('skips disabled recipes, other owners, and non-matching templates', async () => {
    const { envelopeId } = await seedEnvelope();
    const otherOwner = await seedUser(handle);
    const templateId = randomUUID();
    handle.mem.public.none(
      `insert into public.templates (id, owner_id, title) values ('${templateId}', '${ownerId}', 'T')`,
    );
    await addRecipe({
      recipe: 'sealed_webhook',
      trigger: 'envelope_sealed',
      action: 'webhook',
      enabled: false,
    });
    await addRecipe({
      recipe: 'sealed_webhook',
      trigger: 'envelope_sealed',
      action: 'webhook',
      owner: otherOwner,
    });
    const scoped = await addRecipe({
      recipe: 'sealed_webhook',
      trigger: 'envelope_sealed',
      action: 'webhook',
      templateId,
    });

    await envelopes.appendEvent({
      envelope_id: envelopeId,
      actor_kind: 'system',
      event_type: 'sealed',
    });
    await matcher.rescan();
    expect(await runs()).toHaveLength(0);

    // Created from the template: the template-scoped recipe now matches.
    const second = await seedEnvelope();
    await db
      .updateTable('envelopes')
      .set({ source_template_id: templateId })
      .where('id', '=', second.envelopeId)
      .execute();
    await envelopes.appendEvent({
      envelope_id: second.envelopeId,
      actor_kind: 'system',
      event_type: 'sealed',
    });
    await matcher.rescan();
    expect(await runs()).toEqual([expect.objectContaining({ automation_id: scoped })]);
  });

  it('writes no trigger for event types that do not start recipes', async () => {
    const { envelopeId } = await seedEnvelope();
    for (const event_type of ['created', 'all_signed', 'field_filled', 'reminder_sent'] as const) {
      await envelopes.appendEvent({ envelope_id: envelopeId, actor_kind: 'system', event_type });
    }
    expect(await triggers()).toHaveLength(0);
  });

  it.each([
    ['the flag is off', () => (host.__SEALD_FEATURE_OVERRIDES__ = { workflowAutomations: false })],
    [
      'AUTOMATIONS_DISABLED=true',
      () => build(new NoAfterCommitMatcher(repo, env({ AUTOMATIONS_DISABLED: true }))),
    ],
  ])('writes no trigger when %s', async (_label, arrange) => {
    const { envelopeId } = await seedEnvelope();
    arrange();
    await envelopes.appendEvent({
      envelope_id: envelopeId,
      actor_kind: 'system',
      event_type: 'sealed',
    });
    expect(await triggers()).toHaveLength(0);
  });

  it('consumes a trigger whose envelope has no owner, without runs', async () => {
    const { envelopeId } = await seedEnvelope();
    await addRecipe({ recipe: 'sealed_webhook', trigger: 'envelope_sealed', action: 'webhook' });
    const ev = await envelopes.appendEvent({
      envelope_id: envelopeId,
      actor_kind: 'system',
      event_type: 'sealed',
    });
    await handle.db
      .updateTable('envelopes')
      .set({ owner_id: null })
      .where('id', '=', envelopeId)
      .execute();
    expect(await repo.matchTrigger(ev.id)).toEqual({
      kind: 'matched',
      runs: 0,
      reason: 'no_owner',
    });
    expect(await runs()).toHaveLength(0);
    expect(await triggers()).toHaveLength(0);
  });

  it('checkpoint advances past successes only, and the next scan retries a failure', async () => {
    const { envelopeId } = await seedEnvelope();
    await addRecipe({ recipe: 'sealed_webhook', trigger: 'envelope_sealed', action: 'webhook' });
    const first = await envelopes.appendEvent({
      envelope_id: envelopeId,
      actor_kind: 'system',
      event_type: 'sealed',
    });
    expect(await repo.getCheckpoint()).toBeNull();

    jest.spyOn(repo, 'matchTrigger').mockRejectedValueOnce(new Error('transient'));
    expect(await matcher.rescan()).toMatchObject({ scanned: 1, failed: 1 });
    expect(await repo.getCheckpoint()).toBeNull();

    expect(await matcher.rescan()).toMatchObject({ scanned: 1, matched: 1, failed: 0 });
    const cp = await repo.getCheckpoint();
    expect(cp?.event_id).toBe(first.id);
  });

  it('startup rescan starts five minutes before the checkpoint', async () => {
    const list = jest.spyOn(repo, 'listPendingTriggers');
    const at = '2026-10-22T12:00:00.000Z';
    await repo.saveCheckpoint({ created_at: at, event_id: randomUUID() });
    await matcher.rescan();
    expect(list.mock.calls[0]![0].after).toEqual({
      created_at: new Date(Date.parse(at) - RESCAN_OVERLAP_MS).toISOString(),
      event_id: '00000000-0000-0000-0000-000000000000',
    });
    await matcher.rescan({ full: true });
    expect(list.mock.calls[1]![0].after).toBeNull();
  });

  it('the daily sweep deletes matched triggers older than 24 hours', async () => {
    const { envelopeId } = await seedEnvelope();
    const old = await envelopes.appendEvent({
      envelope_id: envelopeId,
      actor_kind: 'system',
      event_type: 'viewed',
    });
    const fresh = await envelopes.appendEvent({
      envelope_id: envelopeId,
      actor_kind: 'system',
      event_type: 'sent',
    });
    const now = new Date();
    await db
      .updateTable('automation_triggers')
      .set({
        status: 'matched',
        matched_at: new Date(now.getTime() - 25 * 3_600_000).toISOString(),
      })
      .where('event_id', '=', old.id)
      .execute();
    await db
      .updateTable('automation_triggers')
      .set({ status: 'matched', matched_at: new Date(now.getTime() - 3_600_000).toISOString() })
      .where('event_id', '=', fresh.id)
      .execute();
    const res = await matcher.sweep(now);
    expect(res.deleted).toBe(1);
    expect((await triggers()).map((t) => t.event_id)).toEqual([fresh.id]);
  });
});

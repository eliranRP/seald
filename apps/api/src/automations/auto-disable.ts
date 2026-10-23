import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Kysely, sql } from 'kysely';
import type { Database } from '../../db/schema';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import { DB_TOKEN } from '../db/db.provider';
import {
  assertNoSignerToken,
  type InsertOutboundEmailInput,
} from '../email/outbound-emails.repository';
import { withAutomationTables, type AutomationsDatabase } from './automations.schema';
import { automationsActive } from './matcher';

/**
 * A8 auto-disable (docs/design/workflow-automations.md): twenty consecutive
 * `failed` runs on one recipe turn it off and email the owner once. A run
 * counts as failed only when its retries are exhausted, which is the only
 * way `AutomationsPgRepository.failRun` is reached. A success resets the
 * streak (`completeRun`), and so does a re-enable (`AutomationsCrudPgRepository`).
 *
 * The disable and its notice are one transaction (`AutoDisableStore`), so
 * the owner is told exactly when the recipe was turned off, and a crash
 * cannot leave a disabled recipe with no notice. Two workers racing on the
 * same recipe are safe: the update only flips a row that is still `enabled`,
 * so exactly one call gets `true` and queues the email.
 */

/** Consecutive failed runs that turn a recipe off. */
export const AUTO_DISABLE_THRESHOLD = 20;

/** Value of `automations.disabled_reason` (migration 0037) for this path. */
export const AUTO_DISABLE_REASON = 'consecutive_failures' as const;

/** What the notice needs, read inside the disable transaction. */
export interface AutoDisableContext {
  readonly automationId: string;
  readonly ownerId: string;
  /** Null when the owner's account has no address; no notice is queued then. */
  readonly ownerEmail: string | null;
  readonly name: string;
  readonly disabledAt: Date;
  /** The streak at the moment it was turned off. */
  readonly failureCount: number;
}

/**
 * Port for the disable. `disableAtThreshold` runs in one transaction: it
 * turns the recipe off only when it is still enabled and its streak is at
 * `threshold`, and then queues `notice(ctx)` on that same transaction.
 * Resolves `true` only for the call that flipped the recipe.
 */
export abstract class AutoDisableStore {
  abstract disableAtThreshold(input: {
    readonly automationId: string;
    readonly threshold: number;
    readonly now: Date;
    readonly notice: (ctx: AutoDisableContext) => InsertOutboundEmailInput | null;
  }): Promise<boolean>;
}

/** Stable per recipe and per disable, so one disable mails once. */
export function autoDisableDedupeKey(automationId: string, disabledAt: Date): string {
  return `automation_disabled:${automationId}:${disabledAt.toISOString()}`;
}

/** The owner's notice, or null when there is no address to send it to. */
export function buildAutoDisableNotice(
  ctx: AutoDisableContext,
  publicUrl: string,
): InsertOutboundEmailInput | null {
  if (!ctx.ownerEmail) return null;
  return {
    kind: 'automation_disabled',
    to_email: ctx.ownerEmail,
    to_name: '',
    dedupe_key: autoDisableDedupeKey(ctx.automationId, ctx.disabledAt),
    payload: {
      automation_name: ctx.name,
      failure_count: ctx.failureCount,
      disabled_at_readable: formatUtc(ctx.disabledAt),
      settings_url: `${publicUrl}/settings/automations`,
      public_url: publicUrl,
    },
  };
}

/**
 * Called by the worker after a run is marked `failed`. Never throws: a
 * failed check is logged by name only and leaves the recipe as it was.
 */
@Injectable()
export class AutoDisableService {
  private readonly log = new Logger(AutoDisableService.name);
  private readonly publicUrl: string;

  constructor(
    private readonly store: AutoDisableStore,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {
    this.publicUrl = env.APP_PUBLIC_URL.replace(/\/$/, '');
  }

  /** True when this call turned the recipe off. Does nothing with the flag off. */
  async afterFailure(automationId: string, now: Date = new Date()): Promise<boolean> {
    if (!automationsActive(this.env)) return false;
    try {
      const disabled = await this.store.disableAtThreshold({
        automationId,
        threshold: AUTO_DISABLE_THRESHOLD,
        now,
        notice: (ctx) => buildAutoDisableNotice(ctx, this.publicUrl),
      });
      if (disabled)
        this.log.warn(`automation auto-disabled after failed streak id=${automationId}`);
      return disabled;
    } catch (err) {
      const name = err instanceof Error ? err.name : 'unknown';
      this.log.error(`auto-disable check failed (${name}) id=${automationId}`);
      return false;
    }
  }
}

/** Postgres store: one transaction for the flip and the notice (migration 0037). */
@Injectable()
export class PgAutoDisableStore extends AutoDisableStore {
  private readonly db: Kysely<AutomationsDatabase>;

  constructor(@Inject(DB_TOKEN) db: Kysely<Database>) {
    super();
    this.db = withAutomationTables(db);
  }

  override async disableAtThreshold(input: {
    readonly automationId: string;
    readonly threshold: number;
    readonly now: Date;
    readonly notice: (ctx: AutoDisableContext) => InsertOutboundEmailInput | null;
  }): Promise<boolean> {
    return this.db.transaction().execute(async (trx) => {
      const flipped = await trx
        .updateTable('automations')
        .set({
          enabled: false,
          disabled_at: input.now.toISOString(),
          disabled_reason: AUTO_DISABLE_REASON,
        })
        .where('id', '=', input.automationId)
        .where('enabled', '=', true)
        .where('consecutive_failures', '>=', input.threshold)
        .returning(['id', 'owner_id', 'name', 'consecutive_failures'])
        .executeTakeFirst();
      if (!flipped) return false;

      const owner = await sql<{ email: string | null }>`
        select u.email::text as email from auth.users u where u.id = ${flipped.owner_id}::uuid`.execute(
        trx,
      );
      const emailRaw = owner.rows[0]?.email ?? null;
      const ctx: AutoDisableContext = {
        automationId: flipped.id,
        ownerId: flipped.owner_id,
        ownerEmail: emailRaw && emailRaw.length > 0 ? emailRaw : null,
        name: flipped.name,
        disabledAt: input.now,
        failureCount: flipped.consecutive_failures,
      };
      const notice = input.notice(ctx);
      if (notice) {
        assertNoSignerToken(notice.payload);
        await trx
          .insertInto('outbound_emails')
          .values({
            envelope_id: null,
            signer_id: null,
            kind: notice.kind,
            to_email: notice.to_email,
            to_name: notice.to_name,
            payload: JSON.stringify(notice.payload),
            dedupe_key: notice.dedupe_key ?? autoDisableDedupeKey(ctx.automationId, input.now),
          })
          .onConflict((oc) => oc.column('dedupe_key').doNothing())
          .execute();
      }
      return true;
    });
  }
}

function formatUtc(date: Date): string {
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

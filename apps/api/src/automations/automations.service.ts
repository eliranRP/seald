import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AUTOMATION_RECIPES,
  MAX_AUTOMATIONS_PER_OWNER,
  MCP_LIST_LIMIT_DEFAULT,
  MCP_LIST_LIMIT_MAX,
  automationFailureMessage,
  type AutomationAction,
  type AutomationOutput,
  type AutomationPayloadDetail,
  type AutomationRecipeId,
  type AutomationRunOutput,
  type AutomationRunStatus,
  type AutomationRunStatusWord,
  type AutomationScope,
} from 'shared';
import { ApprovalsRepository } from '../approvals/approvals.repository';
import {
  AutomationSecretsNotConfiguredError,
  WebhookSecretsMissingError,
  WebhookSecretsService,
  WebhookUrlRejectedError,
} from './actions/webhook/webhook-secrets.service';
import { AUTOMATION_ACTION_EXECUTORS, type AutomationActionExecutors } from './automation-actions';
import { checkIp, parseIp } from './ssrf/ip-policy';
import {
  AutomationsCrudRepository,
  type AutomationPatch,
  type AutomationRecord,
  type CursorRow,
  type PageCursor,
  type RunRecord,
} from './automations-crud.repository';

export { AUTOMATION_APPROVAL_SUBJECT_PREFIX } from './automation-approval-state';

const DEFAULT_NAMES: Readonly<Record<AutomationRecipeId, string>> = {
  sealed_save_drive: 'Save sealed copies to Drive',
  sealed_webhook: 'Send a webhook when sealed',
  declined_notify_me: 'Email me when someone declines',
  signed_notify_list: 'Email when someone signs',
  completed_email_copy: 'Email a copy when sealed',
  viewed_notify_me: 'Email me when viewed',
  sent_webhook: 'Send a webhook when sent',
  expired_notify_me: 'Email me when it expires',
};

export interface UpsertRecipeInput {
  readonly recipe?: AutomationRecipeId | undefined;
  readonly automationId?: string | undefined;
  readonly name?: string | undefined;
  readonly scope?: AutomationScope | undefined;
  readonly templateId?: string | undefined;
  readonly url?: string | undefined;
  readonly payloadDetail?: AutomationPayloadDetail | undefined;
  readonly recipients?: readonly string[] | undefined;
}

export interface ChangeOptions {
  /**
   * True for a change an agent makes through MCP: an external destination
   * then stays disabled until the owner approves. The settings API (a
   * signed-in Save) passes false and the recipe turns on at once.
   */
  readonly requireApproval: boolean;
  readonly now?: Date;
}

export interface ChangeOutcome {
  readonly automation: AutomationOutput;
  /** The caller must open an `automation_external_destination` approval for it. */
  readonly needsApproval: boolean;
  /**
   * The new webhook signing secret, shown once. Set only on a signed-in
   * create; an agent's change never carries it.
   */
  readonly webhookSecret?: string;
}

export interface UpsertPreview {
  readonly operation: 'create' | 'update';
  readonly recipe: string;
  readonly enabled_after: boolean;
  readonly needs_approval: boolean;
  readonly destination_host: string | null;
}

export interface Page<T> {
  readonly items: T[];
  readonly next_cursor: string | null;
}

export interface ApprovalSubject {
  readonly recipe: string;
  readonly name: string;
  readonly destination: { readonly kind: 'webhook' | 'email'; readonly label: string };
  readonly recipients: ReadonlyArray<{ readonly name: string; readonly email: string }>;
  /** Hash of the full destination, so a changed address expires the approval. */
  readonly destinationSha256: string;
  readonly payloadDetail: AutomationPayloadDetail | null;
}

interface PlannedConfig {
  readonly config: Record<string, unknown>;
  /** The URL to encrypt, set when it is new or changed. */
  readonly newUrl: string | null;
  readonly external: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PG_TS = /^\d{4}-\d{2}-\d{2}[ T][\d:.]+(Z|[+-]\d{2}(:?\d{2})?)?$/;

function encodeCursor(c: PageCursor): string {
  return Buffer.from(JSON.stringify({ a: c.at, i: c.id }), 'utf8').toString('base64url');
}

function decodeCursor(raw: string | undefined): PageCursor | null {
  if (raw === undefined) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (parsed && typeof parsed === 'object') {
      const { a, i } = parsed as { a?: unknown; i?: unknown };
      if (typeof a === 'string' && typeof i === 'string' && PG_TS.test(a) && UUID.test(i)) {
        return { at: a, id: i };
      }
    }
  } catch {
    // fall through
  }
  throw new BadRequestException('invalid_cursor');
}

function clampLimit(limit: number | undefined): number {
  const n = limit ?? MCP_LIST_LIMIT_DEFAULT;
  return Math.min(Math.max(Math.trunc(n), 1), MCP_LIST_LIMIT_MAX);
}

function toPage<R, T>(
  rows: CursorRow<R>[],
  limit: number,
  map: (row: R) => T,
): { items: T[]; next_cursor: string | null } {
  const hasMore = rows.length > limit;
  const kept = hasMore ? rows.slice(0, limit) : rows;
  const last = kept[kept.length - 1];
  return {
    items: kept.map((r) => map(r.row)),
    next_cursor: hasMore && last ? encodeCursor(last.cursor) : null,
  };
}

function strConfig(config: Readonly<Record<string, unknown>>, key: string): string | null {
  const v = config[key];
  return typeof v === 'string' ? v : null;
}

function recipientsOf(config: Readonly<Record<string, unknown>>): string[] {
  const v = config['recipients'];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function payloadDetailOf(config: Readonly<Record<string, unknown>>): AutomationPayloadDetail {
  return config['payload_detail'] === 'with_signer' ? 'with_signer' : 'ids';
}

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/**
 * Recipes for MCP and (later) the settings API (docs/design/workflow-
 * automations.md, A3). Owner scoped throughout. Validation lives here so
 * both callers share it: the recipe must be in the catalog, its action
 * must have an executor, the webhook URL passes the static SSRF checks,
 * and an agent's change that adds an external destination stays disabled
 * until the owner approves (`needsApproval`; the tool opens the approval).
 *
 * Nothing here returns a webhook URL or a signing secret.
 */
@Injectable()
export class AutomationsService {
  private readonly supported: ReadonlySet<AutomationAction>;

  constructor(
    private readonly repo: AutomationsCrudRepository,
    private readonly secrets: WebhookSecretsService,
    private readonly approvals: ApprovalsRepository,
    @Optional()
    @Inject(AUTOMATION_ACTION_EXECUTORS)
    executors?: AutomationActionExecutors,
  ) {
    this.supported = new Set(
      (Object.entries(executors ?? {}) as Array<[AutomationAction, unknown]>)
        .filter(([, executor]) => executor !== undefined)
        .map(([action]) => action),
    );
  }

  // -------------------------------------------------------------------------
  // Recipes
  // -------------------------------------------------------------------------

  async list(
    ownerId: string,
    input: { limit?: number | undefined; cursor?: string | undefined } = {},
  ): Promise<Page<AutomationOutput>> {
    const limit = clampLimit(input.limit);
    const rows = await this.repo.list(ownerId, limit, decodeCursor(input.cursor));
    const shown = rows.slice(0, limit).map((r) => r.row.id);
    const waiting = await this.repo.awaitingApproval(ownerId, shown);
    return toPage(rows, limit, (rec) => this.view(rec, waiting.has(rec.id)));
  }

  async get(ownerId: string, id: string): Promise<AutomationOutput> {
    const rec = await this.requireRecipe(ownerId, id);
    const waiting = await this.repo.awaitingApproval(ownerId, [id]);
    return this.view(rec, waiting.has(id));
  }

  /**
   * True while the recipe is waiting on an approval (newest approval
   * unapproved, not superseded by an owner save). A2b's test endpoint
   * refuses on the same rule.
   */
  async isAwaitingApproval(ownerId: string, id: string): Promise<boolean> {
    return (await this.repo.awaitingApproval(ownerId, [id])).has(id);
  }

  /** What an upsert would do. Validates exactly like {@link upsertRecipe}; writes nothing. */
  async previewUpsert(
    ownerId: string,
    input: UpsertRecipeInput,
    opts: ChangeOptions,
  ): Promise<UpsertPreview> {
    if (input.automationId === undefined) {
      const plan = await this.planCreate(ownerId, input);
      const enabled = !(plan.external && opts.requireApproval);
      return {
        operation: 'create',
        recipe: input.recipe ?? '',
        enabled_after: enabled,
        needs_approval: !enabled,
        destination_host: strConfig(plan.config, 'url_host'),
      };
    }
    const existing = await this.requireRecipe(ownerId, input.automationId);
    const change = await this.planUpdate(ownerId, existing, input);
    const disabled = change.externalChange && opts.requireApproval;
    return {
      operation: 'update',
      recipe: existing.recipe,
      enabled_after: disabled ? false : existing.enabled,
      needs_approval: disabled,
      destination_host: strConfig(change.config, 'url_host'),
    };
  }

  async upsertRecipe(
    ownerId: string,
    input: UpsertRecipeInput,
    opts: ChangeOptions,
  ): Promise<ChangeOutcome> {
    const now = opts.now ?? new Date();
    return input.automationId === undefined
      ? this.create(ownerId, input, opts)
      : this.update(ownerId, input.automationId, input, opts, now);
  }

  /**
   * Turn a recipe on or off. Off is immediate. On is immediate for an
   * internal recipe and for a signed-in caller; for an agent's external
   * recipe it changes nothing and says an approval is needed.
   */
  async setEnabled(
    ownerId: string,
    id: string,
    enabled: boolean,
    opts: ChangeOptions,
  ): Promise<ChangeOutcome> {
    const now = opts.now ?? new Date();
    const rec = await this.requireRecipe(ownerId, id);
    if (rec.enabled === enabled)
      return { automation: await this.get(ownerId, id), needsApproval: false };
    if (enabled && opts.requireApproval && (await this.isExternal(ownerId, rec))) {
      return { automation: await this.get(ownerId, id), needsApproval: true };
    }
    await this.repo.update(ownerId, id, { enabled });
    // The owner turned it on in the app: that is their approval.
    if (enabled && !opts.requireApproval) await this.repo.supersedeApprovals(ownerId, id, now);
    return { automation: await this.get(ownerId, id), needsApproval: false };
  }

  /** What {@link setEnabled} would do. Writes nothing. */
  async previewSetEnabled(
    ownerId: string,
    id: string,
    enabled: boolean,
    opts: ChangeOptions,
  ): Promise<{ enabled_after: boolean; needs_approval: boolean }> {
    const rec = await this.requireRecipe(ownerId, id);
    if (rec.enabled === enabled) return { enabled_after: enabled, needs_approval: false };
    const needs = enabled && opts.requireApproval && (await this.isExternal(ownerId, rec));
    return { enabled_after: needs ? rec.enabled : enabled, needs_approval: needs };
  }

  /**
   * Rotate a webhook recipe's signing secret (settings API only). The new
   * secret is returned once; the old one verifies for 24 hours.
   */
  async rotateWebhookSecret(
    ownerId: string,
    id: string,
    now: Date = new Date(),
  ): Promise<{ readonly secret: string; readonly previousRetiresAt: Date }> {
    const rec = await this.requireRecipe(ownerId, id);
    if (rec.action !== 'webhook') throw new ConflictException('not_a_webhook');
    try {
      return await this.secrets.rotateSecret(id, now);
    } catch (err) {
      throw this.translateSecretsError(err);
    }
  }

  /** Delete a recipe (cascades its runs, jobs and secrets). */
  async remove(ownerId: string, id: string): Promise<void> {
    await this.requireRecipe(ownerId, id);
    await this.repo.delete(ownerId, id);
  }

  /** The owner approved: the recipe turns on. Called by the approval kind's `execute`. */
  async activateApproved(ownerId: string, id: string): Promise<AutomationOutput> {
    await this.requireRecipe(ownerId, id);
    await this.repo.update(ownerId, id, { enabled: true });
    return this.get(ownerId, id);
  }

  /** The facts an approval card shows and `subject_hash` covers. */
  async describeForApproval(ownerId: string, id: string): Promise<ApprovalSubject> {
    const rec = await this.requireRecipe(ownerId, id);
    if (rec.action === 'webhook') {
      let url: string;
      try {
        url = (await this.secrets.decrypt(id, new Date())).url;
      } catch (err) {
        if (err instanceof AutomationSecretsNotConfiguredError) throw secretsNotConfigured();
        throw new ConflictException('automation_not_ready');
      }
      let label = strConfig(rec.config, 'url_host') ?? 'webhook';
      try {
        const parsed = new URL(url);
        // Host and path only: a query string can carry a token.
        label = `${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname}`;
      } catch {
        // keep the host
      }
      return {
        recipe: rec.recipe,
        name: rec.name,
        destination: { kind: 'webhook', label },
        recipients: [],
        destinationSha256: sha256(url),
        payloadDetail: payloadDetailOf(rec.config),
      };
    }
    const emails = recipientsOf(rec.config);
    return {
      recipe: rec.recipe,
      name: rec.name,
      destination: { kind: 'email', label: emails.join(', ') || 'your own mailbox' },
      recipients: emails.map((email) => ({ name: email, email })),
      destinationSha256: sha256([...emails].sort().join('\n')),
      payloadDetail: null,
    };
  }

  // -------------------------------------------------------------------------
  // Runs
  // -------------------------------------------------------------------------

  async listRuns(
    ownerId: string,
    input: {
      automationId?: string | undefined;
      status?: AutomationRunStatus | undefined;
      limit?: number | undefined;
      cursor?: string | undefined;
    } = {},
  ): Promise<Page<AutomationRunOutput>> {
    if (input.automationId !== undefined) await this.requireRecipe(ownerId, input.automationId);
    const limit = clampLimit(input.limit);
    const rows = await this.repo.listRuns(ownerId, {
      ...(input.automationId !== undefined ? { automationId: input.automationId } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      limit,
      cursor: decodeCursor(input.cursor),
    });
    return toPage(rows, limit, (run) => this.runView(run));
  }

  async getRun(ownerId: string, runId: string): Promise<AutomationRunOutput> {
    return this.runView(await this.requireRun(ownerId, runId));
  }

  /**
   * One-tap Retry, the same method `POST /automations/:id/runs/:runId/retry`
   * calls. Re-enqueues the same run id. A permanent failure is
   * `retry_not_allowed`; a recipe that is off (or waiting on approval) is
   * `automation_disabled`, so a retry cannot reach an unapproved destination.
   */
  async retryRun(
    ownerId: string,
    runId: string,
  ): Promise<{ status: 'queued' | 'already_queued'; run: AutomationRunOutput }> {
    const checked = await this.checkRetry(ownerId, runId);
    if (checked.alreadyQueued) return { status: 'already_queued', run: this.runView(checked.run) };
    const outcome = await this.repo.requeueRun(ownerId, runId);
    if (outcome === 'refused') throw new ConflictException('retry_not_allowed');
    return {
      status: outcome === 'queued' ? 'queued' : 'already_queued',
      run: await this.getRun(ownerId, runId),
    };
  }

  /** The checks Retry makes, without re-enqueueing. Throws the same slugs. */
  async previewRetry(
    ownerId: string,
    runId: string,
  ): Promise<{ run_id: string; already_queued: boolean }> {
    const checked = await this.checkRetry(ownerId, runId);
    return { run_id: runId, already_queued: checked.alreadyQueued };
  }

  private async checkRetry(
    ownerId: string,
    runId: string,
  ): Promise<{ run: RunRecord; alreadyQueued: boolean }> {
    const run = await this.requireRun(ownerId, runId);
    if (run.hasJob) return { run, alreadyQueued: true };
    if (run.status !== 'failed' || !run.retryable) throw new ConflictException('retry_not_allowed');
    const automation = await this.repo.find(ownerId, run.automationId);
    if (!automation?.enabled) throw new ConflictException('automation_disabled');
    return { run, alreadyQueued: false };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async create(
    ownerId: string,
    input: UpsertRecipeInput,
    opts: ChangeOptions,
  ): Promise<ChangeOutcome> {
    const plan = await this.planCreate(ownerId, input);
    const recipe = AUTOMATION_RECIPES[input.recipe as AutomationRecipeId];
    const needsApproval = plan.external && opts.requireApproval;
    const rec = await this.repo.insert({
      ownerId,
      recipe: recipe.id,
      name: input.name ?? DEFAULT_NAMES[recipe.id],
      // Off until the owner approves an agent's external destination.
      enabled: !needsApproval,
      trigger: recipe.trigger,
      action: recipe.action,
      scope: input.scope ?? 'account',
      templateId: input.templateId ?? null,
      config: plan.config,
    });
    let webhookSecret: string | undefined;
    if (plan.newUrl !== null) {
      try {
        // The signing secret is generated and stored here. Only a signed-in
        // owner is handed it, once; MCP never shows it.
        const created = await this.secrets.createSecrets(rec.id, plan.newUrl);
        if (!opts.requireApproval) webhookSecret = created.secret;
      } catch (err) {
        await this.repo.delete(ownerId, rec.id);
        throw this.translateSecretsError(err);
      }
    }
    return {
      automation: await this.get(ownerId, rec.id),
      needsApproval,
      ...(webhookSecret !== undefined ? { webhookSecret } : {}),
    };
  }

  private async update(
    ownerId: string,
    id: string,
    input: UpsertRecipeInput,
    opts: ChangeOptions,
    now: Date,
  ): Promise<ChangeOutcome> {
    const existing = await this.requireRecipe(ownerId, id);
    const change = await this.planUpdate(ownerId, existing, input);
    const needsApproval = change.externalChange && opts.requireApproval;
    if (change.newUrl !== null) {
      try {
        await this.secrets.replaceUrl(id, change.newUrl);
      } catch (err) {
        throw this.translateSecretsError(err);
      }
    }
    const patch: AutomationPatch = {
      ...(change.name !== undefined ? { name: change.name } : {}),
      ...(change.scope !== undefined ? { scope: change.scope } : {}),
      ...(change.templateId !== undefined ? { templateId: change.templateId } : {}),
      config: change.config,
      ...(needsApproval ? { enabled: false } : {}),
    };
    await this.repo.update(ownerId, id, patch);
    if (needsApproval && existing.enabled) await this.repo.parkPendingJobs(id);
    // A signed-in save is the owner's own decision: it settles any approval
    // an agent left open, denied or expired for this recipe.
    if (!opts.requireApproval) await this.repo.supersedeApprovals(ownerId, id, now);
    return { automation: await this.get(ownerId, id), needsApproval };
  }

  private async planCreate(ownerId: string, input: UpsertRecipeInput): Promise<PlannedConfig> {
    if (input.recipe === undefined) throw new BadRequestException('validation_error');
    const recipe = AUTOMATION_RECIPES[input.recipe];
    if (!this.supported.has(recipe.action)) {
      throw new ConflictException('recipe_not_available');
    }
    if ((await this.repo.count(ownerId)) >= MAX_AUTOMATIONS_PER_OWNER) {
      throw new ConflictException('automation_limit_reached');
    }
    await this.checkScope(ownerId, input.scope ?? 'account', input.templateId);
    if (recipe.action === 'webhook') {
      if (input.url === undefined) throw new BadRequestException('webhook_url_required');
      if (input.recipients !== undefined) throw new BadRequestException('validation_error');
      const urlHost = this.checkUrl(input.url);
      return {
        config: { url_host: urlHost, payload_detail: input.payloadDetail ?? 'ids' },
        newUrl: input.url,
        external: true,
      };
    }
    if (recipe.action === 'email_copy') {
      if (input.url !== undefined || input.payloadDetail !== undefined) {
        throw new BadRequestException('validation_error');
      }
      const recipients = [...new Set(input.recipients ?? [])];
      return {
        config: { recipients },
        newUrl: null,
        external: await this.hasForeignRecipient(ownerId, recipients),
      };
    }
    if (recipe.action === 'gdrive_upload') {
      if (
        input.url !== undefined ||
        input.payloadDetail !== undefined ||
        input.recipients !== undefined
      ) {
        throw new BadRequestException('validation_error');
      }
      // No folder is asked for: the first run creates "My Drive / Seald".
      return {
        config: { folder_id: null, folder_name: null, account_id: null },
        newUrl: null,
        external: true,
      };
    }
    // `slack` has no recipe here: it never gets an action.
    throw new ConflictException('recipe_not_available');
  }

  private async planUpdate(
    ownerId: string,
    existing: AutomationRecord,
    input: UpsertRecipeInput,
  ): Promise<{
    name?: string;
    scope?: AutomationScope;
    templateId?: string | null;
    config: Record<string, unknown>;
    newUrl: string | null;
    externalChange: boolean;
  }> {
    if (input.recipe !== undefined && input.recipe !== existing.recipe) {
      throw new BadRequestException('recipe_mismatch');
    }
    const touchesScope = input.scope !== undefined || input.templateId !== undefined;
    const scope: AutomationScope =
      input.scope ?? (input.templateId !== undefined ? 'template' : existing.scope);
    const templateId =
      scope === 'template'
        ? (input.templateId ?? existing.templateId ?? undefined)
        : input.templateId;
    if (touchesScope) await this.checkScope(ownerId, scope, templateId);
    const config: Record<string, unknown> = { ...existing.config };
    let newUrl: string | null = null;
    let externalChange = false;

    if (existing.action === 'webhook') {
      if (input.recipients !== undefined) throw new BadRequestException('validation_error');
      if (input.url !== undefined) {
        const urlHost = this.checkUrl(input.url);
        if (!(await this.sameUrl(existing.id, input.url))) {
          newUrl = input.url;
          config['url_host'] = urlHost;
          externalChange = true;
        }
      }
      if (input.payloadDetail !== undefined) {
        // Widening the payload to signer data sends more outside Seald.
        if (input.payloadDetail === 'with_signer' && payloadDetailOf(existing.config) === 'ids') {
          externalChange = true;
        }
        config['payload_detail'] = input.payloadDetail;
      }
    } else if (existing.action === 'email_copy') {
      if (input.url !== undefined || input.payloadDetail !== undefined) {
        throw new BadRequestException('validation_error');
      }
      if (input.recipients !== undefined) {
        const next = [...new Set(input.recipients)];
        const known = new Set(recipientsOf(existing.config));
        const added = next.filter((e) => !known.has(e));
        externalChange = await this.hasForeignRecipient(ownerId, added);
        config['recipients'] = next;
      }
    } else if (
      input.url !== undefined ||
      input.payloadDetail !== undefined ||
      input.recipients !== undefined
    ) {
      throw new BadRequestException('validation_error');
    }

    return {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(touchesScope
        ? { scope, templateId: scope === 'template' ? (templateId ?? null) : null }
        : {}),
      config,
      newUrl,
      externalChange,
    };
  }

  private async checkScope(
    ownerId: string,
    scope: AutomationScope,
    templateId: string | undefined,
  ): Promise<void> {
    if (scope === 'account') {
      if (templateId !== undefined) throw new BadRequestException('validation_error');
      return;
    }
    if (templateId === undefined) throw new BadRequestException('validation_error');
    if (!(await this.repo.ownsTemplate(ownerId, templateId))) {
      throw new NotFoundException('template_not_found');
    }
  }

  private checkUrl(url: string): string {
    if (!this.secrets.isConfigured()) throw secretsNotConfigured();
    let host: string;
    try {
      host = this.secrets.validateUrl(url);
    } catch (err) {
      throw this.translateSecretsError(err);
    }
    // The static check leaves IP literals to the per-attempt check. An agent
    // gets the answer now: a private or loopback literal is never accepted.
    const literal = parseIp(host);
    if (literal && !checkIp(literal).allowed) throw new BadRequestException('webhook_url_blocked');
    return host;
  }

  private async sameUrl(id: string, url: string): Promise<boolean> {
    try {
      return (await this.secrets.decrypt(id, new Date())).url === url;
    } catch {
      return false;
    }
  }

  private translateSecretsError(err: unknown): Error {
    if (err instanceof AutomationSecretsNotConfiguredError) return secretsNotConfigured();
    if (err instanceof WebhookUrlRejectedError)
      return new BadRequestException('webhook_url_blocked');
    if (err instanceof WebhookSecretsMissingError)
      return new ConflictException('automation_not_ready');
    return err instanceof Error ? err : new Error('automation_secrets_failed');
  }

  private async ownerEmail(ownerId: string): Promise<string | null> {
    const mailbox = await this.approvals.findOwnerMailbox(ownerId);
    return mailbox?.email ? mailbox.email.trim().toLowerCase() : null;
  }

  private async hasForeignRecipient(
    ownerId: string,
    recipients: readonly string[],
  ): Promise<boolean> {
    if (recipients.length === 0) return false;
    const own = await this.ownerEmail(ownerId);
    return recipients.some((r) => r !== own);
  }

  private async isExternal(ownerId: string, rec: AutomationRecord): Promise<boolean> {
    if (rec.action === 'webhook' || rec.action === 'gdrive_upload') return true;
    if (rec.action === 'email_copy') {
      return this.hasForeignRecipient(ownerId, recipientsOf(rec.config));
    }
    return true;
  }

  private async requireRecipe(ownerId: string, id: string): Promise<AutomationRecord> {
    const rec = await this.repo.find(ownerId, id);
    if (!rec) throw new NotFoundException('automation_not_found');
    return rec;
  }

  private async requireRun(ownerId: string, runId: string): Promise<RunRecord> {
    const run = await this.repo.findRun(ownerId, runId);
    if (!run) throw new NotFoundException('automation_run_not_found');
    return run;
  }

  private view(rec: AutomationRecord, awaitingApproval: boolean): AutomationOutput {
    const webhook = rec.action === 'webhook';
    const email = rec.action === 'email_copy';
    return {
      id: rec.id,
      recipe: rec.recipe,
      name: rec.name,
      enabled: rec.enabled,
      status_word: rec.enabled ? null : 'Off',
      trigger: rec.trigger,
      action: rec.action,
      scope: rec.scope,
      template_id: rec.templateId,
      destination_host: webhook ? strConfig(rec.config, 'url_host') : null,
      payload_detail: webhook ? payloadDetailOf(rec.config) : null,
      recipients: email ? recipientsOf(rec.config) : null,
      awaiting_approval: awaitingApproval,
      consecutive_failures: rec.consecutiveFailures,
      created_at: rec.createdAt,
      updated_at: rec.updatedAt,
    };
  }

  private runView(run: RunRecord): AutomationRunOutput {
    const word: Record<AutomationRunStatus, AutomationRunStatusWord | null> = {
      queued: null,
      running: null,
      done: 'Done',
      retrying: 'Retrying',
      failed: 'Failed',
    };
    const failed = run.status === 'failed';
    return {
      id: run.id,
      automation_id: run.automationId,
      envelope_id: run.envelopeId,
      trigger: run.trigger,
      action: run.action,
      status: run.status,
      status_word: word[run.status],
      attempts: run.attempts,
      failure_slug: failed || run.status === 'retrying' ? run.lastError : null,
      failure_message:
        failed || run.status === 'retrying' ? automationFailureMessage(run.lastError) : null,
      response_status: run.responseStatus,
      retry_allowed: failed && run.retryable && !run.hasJob,
      created_at: run.createdAt,
      finished_at: run.finishedAt,
    };
  }
}

function secretsNotConfigured(): ServiceUnavailableException {
  return new ServiceUnavailableException('automation_secrets_not_configured');
}

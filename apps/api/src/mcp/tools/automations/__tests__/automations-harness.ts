import { randomUUID } from 'node:crypto';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ApiKeyScope, ApprovalPendingResult } from 'shared';
import { InMemoryIdempotencyRecordsRepository } from '../../../../idempotency/__tests__/in-memory-idempotency-records.repository';
import { IdempotencyService } from '../../../../idempotency/idempotency.service';
import { WebhookSecretsService } from '../../../../automations/actions/webhook/webhook-secrets.service';
import { FakeWebhookRepo } from '../../../../automations/actions/webhook/__tests__/fake-webhook-repo';
import {
  AutomationsCrudRepository,
  type AutomationPatch,
  type AutomationRecord,
  type CursorRow,
  type ListRunsQuery,
  type NewAutomation,
  type PageCursor,
  type RunRecord,
} from '../../../../automations/automations-crud.repository';
import { AutomationsService } from '../../../../automations/automations.service';
import type { ApprovalsRepository } from '../../../../approvals/approvals.repository';
import type { AppEnv } from '../../../../config/env.schema';
import type { McpServices } from '../../../mcp-services';
import { McpToolRunner } from '../../../tool-runner';
import { automationExternalDestinationHandler } from '../automation-approval-kind';
import {
  KEY_ID,
  NOW,
  OTHER_OWNER,
  OWNER,
  err,
  ok,
  principalFor,
  resetFlags,
  setFlags,
  write,
} from '../../__tests__/write-harness';

export { KEY_ID, NOW, OTHER_OWNER, OWNER, err, ok, resetFlags, setFlags, write };

export const READ: readonly ApiKeyScope[] = ['automations:read'];
export const ALL: readonly ApiKeyScope[] = ['automations:read', 'automations:write'];
export const OWNER_EMAIL = 'owner@example.com';
export const HOOK_URL = 'https://hooks.example.com/seald/inbound?token=zzz';

const AUTOMATION_KEY = '1'.repeat(64);

/** In-memory `AutomationsCrudRepository`, mirroring the Postgres rules. */
export class InMemoryAutomationsRepo extends AutomationsCrudRepository {
  readonly automations = new Map<string, AutomationRecord>();
  readonly runs = new Map<string, RunRecord>();
  readonly templates = new Set<string>();
  /** Automation ids with an open approval (set by the fake approvals service). */
  readonly waiting = new Set<string>();
  private seq = 0;

  private tick(): string {
    this.seq += 1;
    return new Date(Date.parse('2026-10-01T00:00:00.000Z') + this.seq * 1000).toISOString();
  }

  async count(ownerId: string): Promise<number> {
    return [...this.automations.values()].filter((a) => a.ownerId === ownerId).length;
  }

  async insert(input: NewAutomation): Promise<AutomationRecord> {
    const at = this.tick();
    const rec: AutomationRecord = {
      id: randomUUID(),
      ...input,
      consecutiveFailures: 0,
      createdAt: at,
      updatedAt: at,
    };
    this.automations.set(rec.id, rec);
    return rec;
  }

  async find(ownerId: string, id: string): Promise<AutomationRecord | null> {
    const rec = this.automations.get(id);
    return rec && rec.ownerId === ownerId ? rec : null;
  }

  async list(
    ownerId: string,
    limit: number,
    cursor: PageCursor | null,
  ): Promise<CursorRow<AutomationRecord>[]> {
    return [...this.automations.values()]
      .filter((a) => a.ownerId === ownerId)
      .sort((a, b) =>
        a.updatedAt === b.updatedAt ? (a.id < b.id ? 1 : -1) : a.updatedAt < b.updatedAt ? 1 : -1,
      )
      .map((row) => ({ row, cursor: { at: row.updatedAt, id: row.id } }))
      .filter(
        (r) =>
          !cursor ||
          r.cursor.at < cursor.at ||
          (r.cursor.at === cursor.at && r.cursor.id < cursor.id),
      )
      .slice(0, limit + 1);
  }

  async update(
    ownerId: string,
    id: string,
    patch: AutomationPatch,
  ): Promise<AutomationRecord | null> {
    const rec = await this.find(ownerId, id);
    if (!rec) return null;
    const next: AutomationRecord = {
      ...rec,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.scope !== undefined ? { scope: patch.scope } : {}),
      ...(patch.templateId !== undefined ? { templateId: patch.templateId } : {}),
      ...(patch.config !== undefined ? { config: patch.config } : {}),
      updatedAt: this.tick(),
    };
    this.automations.set(id, next);
    return next;
  }

  async delete(ownerId: string, id: string): Promise<void> {
    if (await this.find(ownerId, id)) this.automations.delete(id);
  }

  async ownsTemplate(_ownerId: string, templateId: string): Promise<boolean> {
    return this.templates.has(templateId);
  }

  async awaitingApproval(_ownerId: string, ids: readonly string[]): Promise<Set<string>> {
    return new Set(ids.filter((id) => this.waiting.has(id)));
  }

  readonly pendingJobs = new Set<string>();
  readonly parked: string[] = [];

  async parkPendingJobs(automationId: string): Promise<number> {
    this.parked.push(automationId);
    return 0;
  }

  async listRuns(ownerId: string, q: ListRunsQuery): Promise<CursorRow<RunRecord>[]> {
    return [...this.runs.values()]
      .filter(
        (r) =>
          r.ownerId === ownerId &&
          (!q.automationId || r.automationId === q.automationId) &&
          (!q.status || r.status === q.status),
      )
      .sort((a, b) =>
        a.createdAt === b.createdAt ? (a.id < b.id ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1,
      )
      .map((row) => ({ row, cursor: { at: row.createdAt, id: row.id } }))
      .filter(
        (r) =>
          !q.cursor ||
          r.cursor.at < q.cursor.at ||
          (r.cursor.at === q.cursor.at && r.cursor.id < q.cursor.id),
      )
      .slice(0, q.limit + 1);
  }

  async findRun(ownerId: string, runId: string): Promise<RunRecord | null> {
    const run = this.runs.get(runId);
    return run && run.ownerId === ownerId ? run : null;
  }

  async requeueRun(ownerId: string, runId: string): Promise<'queued' | 'noop' | 'refused'> {
    const run = await this.findRun(ownerId, runId);
    if (!run) return 'refused';
    if (run.hasJob) return 'noop';
    if (run.status !== 'failed' || !run.retryable) return 'refused';
    this.runs.set(runId, {
      ...run,
      status: 'queued',
      attempts: 0,
      lastError: null,
      responseStatus: null,
      finishedAt: null,
      hasJob: true,
    });
    return 'queued';
  }

  seedRun(ownerId: string, automationId: string, over: Partial<RunRecord> = {}): RunRecord {
    const run: RunRecord = {
      id: randomUUID(),
      automationId,
      ownerId,
      envelopeId: randomUUID(),
      trigger: 'envelope_sealed',
      action: 'webhook',
      status: 'failed',
      retryable: true,
      attempts: 8,
      lastError: 'attempts_exhausted',
      responseStatus: 503,
      hasJob: false,
      createdAt: this.tick(),
      finishedAt: NOW.toISOString(),
      ...over,
    };
    this.runs.set(run.id, run);
    return run;
  }
}

export interface AutoWorld {
  readonly repo: InMemoryAutomationsRepo;
  readonly secretsRepo: FakeWebhookRepo;
  readonly service: AutomationsService;
  readonly services: McpServices;
  readonly approvalRequests: Array<{
    kind: string;
    tool: string;
    args: Record<string, unknown>;
    ownerId: string;
  }>;
  /** What the owner does on the approval page: Approve runs the kind's execute. */
  approve(approvalId: string): Promise<Record<string, unknown>>;
  setMailbox(email: string | null): void;
}

export function autoWorld(opts: { secretsKey?: string | undefined } = {}): AutoWorld {
  const repo = new InMemoryAutomationsRepo();
  const secretsRepo = new FakeWebhookRepo();
  const env = {
    NODE_ENV: 'test',
    AUTOMATION_SECRETS_KEY: 'secretsKey' in opts ? opts.secretsKey : AUTOMATION_KEY,
    APP_PUBLIC_URL: 'https://seald.test',
    SUPABASE_URL: 'https://example.supabase.co',
    DATABASE_URL: 'postgres://u:p@127.0.0.1:5432/db',
    CORS_ORIGIN: 'http://localhost:5173',
  } as unknown as AppEnv;
  const secrets = new WebhookSecretsService(secretsRepo.asRepo(), env);
  let mailbox: string | null = OWNER_EMAIL;
  const approvalsRepo = {
    findOwnerMailbox: async () => ({ email: mailbox, verified: mailbox !== null }),
  } as unknown as ApprovalsRepository;
  const executor = { execute: async () => ({ kind: 'done' as const }) };
  const service = new AutomationsService(repo, secrets, approvalsRepo, {
    webhook: executor,
    email_copy: executor,
  });

  const approvalRequests: AutoWorld['approvalRequests'] = [];
  const handler = automationExternalDestinationHandler(service);
  const approvals = {
    request: async (input: {
      requester: { ownerId: string };
      kind: string;
      tool: string;
      args: Record<string, unknown>;
    }): Promise<ApprovalPendingResult> => {
      const parsed = handler.args.parse(input.args);
      // Same re-description the real service runs at request time.
      const described = await handler.describe(parsed, {
        ownerId: input.requester.ownerId,
        ownerEmail: OWNER_EMAIL,
        now: NOW,
      });
      approvalRequests.push({ ...input, ownerId: input.requester.ownerId });
      repo.waiting.add(parsed.automation_id);
      return {
        status: 'approval_pending',
        message: 'pending owner approval',
        approval_id:
          String(approvalRequests.length).padStart(8, '0') + '-0000-4000-8000-000000000000',
        summary: {
          kind: 'automation_external_destination',
          action_label: handler.actionLabel,
          title: described.title,
          recipients: described.recipients.map((r) => ({ ...r, is_new: true })),
          page_count: null,
          key_name: 'Key 1',
          approver_email: OWNER_EMAIL,
          destination: described.destination,
        },
        review_url: 'https://seald.test/approve/x/review',
        approve_requires: 'link',
      };
    },
  };

  const services = {
    automations: service,
    approvals,
    idempotency: new IdempotencyService(new InMemoryIdempotencyRecordsRepository()),
  } as unknown as McpServices;

  return {
    repo,
    secretsRepo,
    service,
    services,
    approvalRequests,
    approve: async (approvalId) => {
      const index = Number(approvalId.slice(0, 8)) - 1;
      const request = approvalRequests[index];
      if (!request) throw new Error('no such approval');
      const args = handler.args.parse(request.args);
      // Decision time: describe again (a changed subject would expire), then execute.
      await handler.describe(args, { ownerId: request.ownerId, ownerEmail: OWNER_EMAIL, now: NOW });
      repo.waiting.delete(args.automation_id);
      return handler.execute(args, {
        ownerId: request.ownerId,
        ownerEmail: OWNER_EMAIL,
        now: NOW,
        approvalId,
        audit: { ip: null, user_agent: null },
      });
    },
    setMailbox: (email) => {
      mailbox = email;
    },
  };
}

export async function callAuto(
  w: AutoWorld,
  name: string,
  args: Record<string, unknown>,
  opts: { scopes?: readonly ApiKeyScope[]; owner?: string } = {},
): Promise<CallToolResult> {
  const runner = new McpToolRunner(w.services);
  return runner.call(
    name,
    args,
    principalFor(opts.scopes ?? ALL, opts.owner ?? OWNER, KEY_ID),
    NOW,
  );
}

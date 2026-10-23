import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ApiKeyScope, ApprovalKind, ApprovalPendingResult } from 'shared';
import type { McpPrincipal } from '../../../mcp-principal';
import type { ApiKeyRecord } from '../../../../api-keys/api-keys.service';
import type { ApprovalRequestInput } from '../../../../approvals/approvals.service';
import { InMemoryIdempotencyRecordsRepository } from '../../../../idempotency/__tests__/in-memory-idempotency-records.repository';
import { IdempotencyService } from '../../../../idempotency/idempotency.service';
import type { McpServices } from '../../../mcp-services';
import { McpToolRunner } from '../../../tool-runner';

/**
 * Harness for the WP-45 tool specs: the real runner and idempotency
 * service, with the approvals service and every action service faked.
 * Each fake records its calls, so a spec can prove a tool asked the
 * owner and did nothing else (no key minted, no account deleted, no
 * signature applied) before Approve. The approval kinds and the decision
 * path are covered by their own specs and the pg e2e.
 */

export const OWNER = '00000000-0000-4000-8000-0000000000a1';
export const KEY_ID = '99999999-9999-4999-8999-999999999999';
export const OTHER_KEY_ID = '88888888-8888-4888-8888-888888888888';
export const ENVELOPE_ID = '11111111-1111-4111-8111-111111111111';
export const SIGNER_ID = '33333333-3333-4333-8333-333333333333';
export const APPROVAL_ID = '44444444-4444-4444-8444-444444444444';
export const AUTOMATION_ID = '55555555-5555-4555-8555-555555555555';
export const OWNER_EMAIL = 'owner@example.com';
export const NOW = new Date('2026-10-23T12:00:00.000Z');

export function pendingFor(kind: ApprovalKind, actionLabel = 'Do it'): ApprovalPendingResult {
  return {
    status: 'approval_pending',
    message: 'pending owner approval',
    approval_id: APPROVAL_ID,
    summary: {
      kind,
      action_label: actionLabel,
      title: null,
      recipients: [],
      page_count: null,
      key_name: 'Key 1',
      approver_email: OWNER_EMAIL,
      destination: null,
    },
    review_url: `https://seald.test/approve/${APPROVAL_ID}/review`,
    approve_requires: 'session',
  };
}

export interface ServiceCall {
  readonly service: string;
  readonly method: string;
  readonly args: readonly unknown[];
}

export interface GatedWorld {
  readonly calls: ServiceCall[];
  /** Every `approvals.request` input, in order. */
  readonly requests: ApprovalRequestInput[];
  /** Every `approvals.subjectForAgent` input (dry runs), in order. */
  readonly previews: ApprovalRequestInput[];
  /** Answers per `service.method`; an Error is thrown. */
  readonly answers: Map<string, unknown>;
  readonly keys: ApiKeyRecord[];
  runner(): McpToolRunner;
  /** Calls that are not to the approvals service: the actions themselves. */
  actions(): ServiceCall[];
}

export function keyRecord(overrides: Partial<ApiKeyRecord> = {}): ApiKeyRecord {
  return {
    id: KEY_ID,
    ownerId: OWNER,
    name: 'Key 1',
    prefix: 'seald_live_abcdefgh',
    keyHash: 'h'.repeat(64),
    scopes: ['envelopes:read', 'keys:admin'],
    requireOwnerApproval: true,
    allowNewRecipients: false,
    alwaysRequireSignin: false,
    createdAt: '2026-10-01T00:00:00.000Z',
    lastUsedAt: null,
    expiresAt: '2026-12-30T00:00:00.000Z',
    revokedAt: null,
    ...overrides,
  };
}

function fake(
  service: string,
  methods: readonly string[],
  calls: ServiceCall[],
  answers: Map<string, unknown>,
  fallback: (method: string, args: unknown[]) => unknown = () => undefined,
): Record<string, (...args: unknown[]) => Promise<unknown>> {
  return Object.fromEntries(
    methods.map((m) => [
      m,
      async (...args: unknown[]) => {
        calls.push({ service, method: m, args });
        const answer = answers.get(`${service}.${m}`);
        if (answer instanceof Error) throw answer;
        if (answer !== undefined) return typeof answer === 'function' ? answer(...args) : answer;
        return fallback(m, args);
      },
    ]),
  );
}

export function gatedWorld(): GatedWorld {
  const calls: ServiceCall[] = [];
  const requests: ApprovalRequestInput[] = [];
  const previews: ApprovalRequestInput[] = [];
  const answers = new Map<string, unknown>();
  const keys: ApiKeyRecord[] = [keyRecord()];

  const approvals = {
    request: async (input: ApprovalRequestInput) => {
      requests.push(input);
      const answer = answers.get('approvals.request');
      if (answer instanceof Error) throw answer;
      return answer ?? pendingFor(input.kind);
    },
    subjectForAgent: async (input: ApprovalRequestInput) => {
      previews.push(input);
      const answer = answers.get('approvals.subjectForAgent');
      if (answer instanceof Error) throw answer;
      return { summary: pendingFor(input.kind).summary, approveRequires: 'session' };
    },
  };
  const apiKeys = fake(
    'apiKeys',
    ['listForOwner', 'findOwned', 'setRequireOwnerApproval', 'createOnApproval', 'revokeForOwner'],
    calls,
    answers,
    (m, args) => {
      if (m === 'listForOwner') return keys;
      if (m === 'findOwned') return keys.find((k) => k.id === args[1]) ?? null;
      if (m === 'setRequireOwnerApproval') return keys.find((k) => k.id === args[1]);
      return undefined;
    },
  );
  const envelopes = fake('envelopes', ['getById'], calls, answers);
  const accounts = fake('accounts', ['email'], calls, answers, () => OWNER_EMAIL);
  const automations = fake(
    'automations',
    ['get', 'remove', 'rotateWebhookSecret', 'describeForApproval'],
    calls,
    answers,
  );
  const connectedApps = fake(
    'connectedApps',
    ['listForOwner', 'findLive', 'revokeForOwner'],
    calls,
    answers,
    (m) => (m === 'listForOwner' ? { items: [] } : null),
  );
  const idempotency = new IdempotencyService(new InMemoryIdempotencyRecordsRepository(), {
    run: <T>(fn: () => Promise<T>) => fn(),
  });
  const services = {
    approvals,
    apiKeys,
    envelopes,
    accounts,
    automations,
    connectedApps,
    idempotency,
  } as unknown as McpServices;
  return {
    calls,
    requests,
    previews,
    answers,
    keys,
    runner: () => new McpToolRunner(services),
    actions: () =>
      calls.filter((c) =>
        [
          'createOnApproval',
          'revokeForOwner',
          'setRequireOwnerApproval',
          'remove',
          'rotateWebhookSecret',
        ].includes(c.method),
      ),
  };
}

export function principal(
  scopes: readonly ApiKeyScope[] = ['envelopes:read', 'keys:admin'],
  overrides: Partial<McpPrincipal> = {},
): McpPrincipal {
  return {
    ok: true,
    ownerId: OWNER,
    keyId: KEY_ID,
    scopes,
    keyName: 'Key 1',
    keyPrefix: 'seald_live_abcdefgh',
    requireOwnerApproval: true,
    allowNewRecipients: false,
    alwaysRequireSignin: false,
    ...overrides,
  };
}

export function call(
  w: GatedWorld,
  name: string,
  args: Record<string, unknown>,
  p: McpPrincipal = principal(),
): Promise<CallToolResult> {
  return w.runner().call(name, args, p, NOW);
}

let seq = 0;
export function write(extra: Record<string, unknown> = {}): Record<string, unknown> {
  seq += 1;
  return {
    idempotency_key: `wp45-key-${String(seq).padStart(6, '0')}`,
    dry_run: false,
    ...extra,
  };
}

export function dryRun(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...write(extra), dry_run: true };
}

export function ok(result: CallToolResult): Record<string, unknown> {
  if (result.isError) {
    const first = result.content[0];
    throw new Error(`tool error: ${first && first.type === 'text' ? first.text : '?'}`);
  }
  return result.structuredContent as Record<string, unknown>;
}

export function errorOf(result: CallToolResult): { slug: string; retryable: boolean } {
  expect(result.isError).toBe(true);
  const first = result.content[0];
  if (!first || first.type !== 'text') throw new Error('no text content');
  return JSON.parse(first.text) as { slug: string; retryable: boolean };
}

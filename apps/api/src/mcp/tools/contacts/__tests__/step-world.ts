import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ApiKeyScope, ApprovalPendingResult, Template, TemplateField } from 'shared';
import { InMemoryTemplatesRepository } from '../../../../../test/in-memory-templates-repository';
import type { ApprovalsService } from '../../../../approvals/approvals.service';
import type { StorageService } from '../../../../storage/storage.service';
import { ContactsService } from '../../../../contacts/contacts.service';
import { TemplateApplyService } from '../../../../templates/template-apply.service';
import { TemplatesService } from '../../../../templates/templates.service';
import type { McpServices } from '../../../mcp-services';
import { McpToolRunner } from '../../../tool-runner';
import {
  KEY_ID,
  NOW,
  OWNER,
  principalFor,
  writeWorld,
  type WriteWorld,
} from '../../__tests__/write-harness';

/**
 * Steps 12–14 harness (WP-25): the WP-19 write world plus the real
 * contacts, templates and template-apply services over their in-memory
 * repositories, and a recording stand-in for `ApprovalsService.request`.
 */

export const APPROVAL_ID = '77777777-7777-4777-8777-777777777777';

export interface ApprovalCall {
  readonly requester: { readonly ownerId: string; readonly apiKeyId: string | null };
  readonly kind: string;
  readonly tool?: string;
  readonly args: Record<string, unknown>;
}

export interface StepWorld extends WriteWorld {
  readonly templatesRepo: InMemoryTemplatesRepository;
  readonly approvalCalls: ApprovalCall[];
}

export function pendingResult(kind: string): ApprovalPendingResult {
  return {
    status: 'approval_pending',
    message: 'pending owner approval',
    approval_id: APPROVAL_ID,
    summary: {
      kind: kind as ApprovalPendingResult['summary']['kind'],
      action_label: 'Test action',
      title: null,
      recipients: [],
      page_count: null,
      key_name: 'Key 1',
      approver_email: 'owner@example.com',
      destination: null,
    },
    review_url: `https://seald.test/approve/${APPROVAL_ID}/review`,
    approve_requires: 'session',
  };
}

export function stepWorld(): StepWorld {
  const base = writeWorld();
  const templatesRepo = new InMemoryTemplatesRepository();
  const approvalCalls: ApprovalCall[] = [];
  const approvals = {
    request: async (input: ApprovalCall) => {
      approvalCalls.push(input);
      return pendingResult(input.kind);
    },
  } as unknown as ApprovalsService;
  const services = {
    ...base.services,
    contacts: new ContactsService(base.contacts),
    templates: new TemplatesService(templatesRepo, base.storage as unknown as StorageService),
    templateApply: new TemplateApplyService(templatesRepo),
    approvals,
  } as unknown as McpServices;
  return Object.assign(base, { services, templatesRepo, approvalCalls }) as unknown as StepWorld;
}

export async function callStep(
  w: StepWorld,
  name: string,
  args: Record<string, unknown>,
  opts: { scopes?: readonly ApiKeyScope[]; owner?: string } = {},
): Promise<CallToolResult> {
  const runner = new McpToolRunner(w.services);
  return runner.call(
    name,
    args,
    principalFor(opts.scopes ?? STEP_SCOPES, opts.owner ?? OWNER, KEY_ID),
    NOW,
  );
}

export const STEP_SCOPES: readonly ApiKeyScope[] = [
  'envelopes:read',
  'envelopes:write',
  'documents:write',
  'contacts:read',
  'contacts:write',
  'templates:read',
  'gdrive:read',
  'gdrive:write',
];

export async function seedTemplate(
  w: StepWorld,
  input: {
    readonly owner?: string;
    readonly title?: string;
    readonly field_layout: ReadonlyArray<TemplateField>;
    readonly last_signers?: Template['last_signers'];
    readonly delivery_mode?: 'parallel' | 'sequential';
  },
): Promise<Template> {
  return w.templatesRepo.create({
    owner_id: input.owner ?? OWNER,
    title: input.title ?? 'Mutual NDA',
    description: null,
    cover_color: null,
    field_layout: input.field_layout,
    tags: [],
    last_signers: input.last_signers ?? [],
    ...(input.delivery_mode !== undefined ? { delivery_mode: input.delivery_mode } : {}),
  });
}

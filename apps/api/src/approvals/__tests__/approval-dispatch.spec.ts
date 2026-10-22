import { InMemoryApprovalsRepository } from '../../../test/in-memory-approvals-repository';
import { InMemoryOutboundEmailsRepository } from '../../../test/in-memory-outbound-emails-repository';
import type { AppEnv } from '../../config/env.schema';
import { EmailDispatcherService } from '../../email/email-dispatcher.service';
import {
  EmailSendError,
  EmailSender,
  type EmailMessage,
  type EmailSendResult,
} from '../../email/email-sender';
import { TemplateService } from '../../email/template.service';
import type { EnvelopesRepository } from '../../envelopes/envelopes.repository';
import { SigningTokenService } from '../../signing/signing-token.service';
import { ApprovalLinkMinter } from '../approval-link-minter.service';
import { hashApprovalToken } from '../approval-token';
import type { ApprovalRecord } from '../approval-state';

class FakeSender extends EmailSender {
  readonly calls: EmailMessage[] = [];
  error: Error | null = null;
  async send(msg: EmailMessage): Promise<EmailSendResult> {
    this.calls.push(msg);
    if (this.error) throw this.error;
    return { providerId: 'prv' };
  }
}

const env = {
  NODE_ENV: 'test',
  APP_PUBLIC_URL: 'https://seald.test',
  EMAIL_FROM_ADDRESS: 'no-reply@seald.test',
  EMAIL_FROM_NAME: 'Seald',
  EMAIL_LEGAL_ENTITY: 'Seald',
  EMAIL_LEGAL_POSTAL: 'Postal',
  EMAIL_PRIVACY_URL: 'https://seald.test/legal/privacy',
  EMAIL_PREFERENCES_URL: 'mailto:privacy@seald.test',
} as unknown as AppEnv;

const LINK = /https:\/\/seald\.test\/approve#([A-Za-z0-9_-]{43})/;

function row(over: Partial<ApprovalRecord> = {}): InMemoryApprovalsRepository['rows'][number] {
  const now = new Date();
  return {
    id: '00000000-0000-4000-8000-000000000001',
    ownerId: '00000000-0000-4000-8000-0000000000a1',
    apiKeyId: '00000000-0000-4000-8000-0000000000c1',
    oauthGrantId: null,
    kind: 'envelope_send',
    tool: 'envelopes_send',
    subjectKey: 'envelope:x',
    envelopeId: null,
    args: {},
    summary: {
      kind: 'envelope_send',
      action_label: 'Send for signature',
      title: 'NDA',
      recipients: [{ name: 'Ada', email: 'ada@example.com', is_new: false }],
      page_count: 2,
      key_name: 'Key 2',
      approver_email: 'owner@example.com',
      destination: null,
    },
    subjectHash: 'a'.repeat(64),
    linkTokenHash: null,
    previousTokenHash: null,
    priorTokenHashes: [],
    notify: 'email',
    approveRequires: 'link',
    ownerEditedAt: null,
    expiresAt: new Date(now.getTime() + 3_600_000).toISOString(),
    approvedAt: null,
    deniedAt: null,
    failedAt: null,
    expiredAt: null,
    completedAt: null,
    expiredReason: null,
    decidedVia: null,
    resultSlug: null,
    result: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...over,
  };
}

function setup() {
  const approvals = new InMemoryApprovalsRepository();
  const outbox = new InMemoryOutboundEmailsRepository();
  const sender = new FakeSender();
  const templates = new TemplateService();
  templates.onModuleInit();
  const dispatcher = new EmailDispatcherService(
    outbox,
    sender,
    templates,
    {} as EnvelopesRepository,
    new SigningTokenService(),
    env,
    undefined,
    new ApprovalLinkMinter(approvals, env),
  );
  return { approvals, outbox, sender, dispatcher };
}

describe('approval_request dispatch (token minted at send time)', () => {
  it('stores ids only, mints the token into this one message and stores only its hash', async () => {
    const w = setup();
    const r = row();
    w.approvals.rows.push(r);
    await w.outbox.insert({
      kind: 'approval_request',
      to_email: 'owner@example.com',
      to_name: '',
      dedupe_key: `approval_request:${r.id}`,
      payload: { approval_id: r.id, subject_hash: r.subjectHash },
    });
    expect(Object.keys(w.outbox.rows[0]?.payload ?? {}).sort()).toEqual([
      'approval_id',
      'subject_hash',
    ]);

    const outcome = await w.dispatcher.dispatchOne();
    expect(outcome).toMatchObject({ status: 'sent' });
    const msg = w.sender.calls[0];
    const token = LINK.exec(msg?.html ?? '')?.[1];
    expect(token).toBeDefined();
    expect(msg?.text).toContain(`https://seald.test/approve#${token}`);
    expect(msg?.subject).toBe('Approve? Send for signature — NDA');
    expect(msg?.to.email).toBe('owner@example.com');
    expect(w.approvals.rows[0]?.linkTokenHash).toBe(hashApprovalToken(token ?? ''));
    // The stored payload is still ids only.
    expect(JSON.stringify(w.outbox.rows[0]?.payload)).not.toContain(token);
  });

  it('a retry re-mints: the earlier undelivered token stops matching', async () => {
    const w = setup();
    const r = row();
    w.approvals.rows.push(r);
    await w.outbox.insert({
      kind: 'approval_request',
      to_email: 'owner@example.com',
      to_name: '',
      payload: { approval_id: r.id, subject_hash: r.subjectHash },
    });
    w.sender.error = new EmailSendError('test', 503, true, 'temporary');
    expect(await w.dispatcher.dispatchOne()).toMatchObject({ status: 'retry' });
    const first = LINK.exec(w.sender.calls[0]?.html ?? '')?.[1] ?? '';
    // Make the row due again.
    const queued = w.outbox.rows[0] as { scheduled_for: string };
    queued.scheduled_for = new Date(0).toISOString();
    w.sender.error = null;
    expect(await w.dispatcher.dispatchOne()).toMatchObject({ status: 'sent' });
    const second = LINK.exec(w.sender.calls[1]?.html ?? '')?.[1] ?? '';
    expect(second).not.toBe(first);
    expect(w.approvals.rows[0]?.linkTokenHash).toBe(hashApprovalToken(second));
    // Different provider idempotency keys per attempt: the body changed.
    expect(w.sender.calls[0]?.idempotencyKey).not.toBe(w.sender.calls[1]?.idempotencyKey);
  });

  it.each([
    ['decided', row({ deniedAt: new Date().toISOString() }), 'a'.repeat(64)],
    ['superseded by a newer email', row({ subjectHash: 'b'.repeat(64) }), 'a'.repeat(64)],
    ['set to approval_notify none', row({ notify: 'none' }), 'a'.repeat(64)],
  ])('skips a queued email whose approval was %s', async (_label, r, queuedHash) => {
    const w = setup();
    w.approvals.rows.push(r);
    await w.outbox.insert({
      kind: 'approval_request',
      to_email: 'owner@example.com',
      to_name: '',
      payload: { approval_id: r.id, subject_hash: queuedHash },
    });
    expect(await w.dispatcher.dispatchOne()).toMatchObject({
      status: 'skipped',
      error: 'approval_not_pending',
    });
    expect(w.sender.calls).toHaveLength(0);
    expect(w.approvals.rows[0]?.linkTokenHash).toBeNull();
  });
});

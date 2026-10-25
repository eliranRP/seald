import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ApprovalLinkMinter } from '../approvals/approval-link-minter.service';
import { ApprovalsPgRepository } from '../approvals/approvals.repository.pg';
import { EmailCopyLinkMinter } from '../automations/actions/email/email-copy-link-minter.service';
import { EmailCopyPgRepository } from '../automations/actions/email/email-copy.repository.pg';
import { AutomationsPgRepository } from '../automations/automations.repository.pg';
import { AutomationMatcherService } from '../automations/matcher';
import { parseEnv } from '../config/env.schema';
import { createDb } from '../db/db.provider';
import { EmailDispatcherService, type FlushResult } from '../email/email-dispatcher.service';
import { selectEmailSender } from '../email/email-sender-factory';
import { OutboundEmailsPgRepository } from '../email/outbound-emails.repository.pg';
import { TemplateService } from '../email/template.service';
import { EnvelopesPgRepository } from '../envelopes/envelopes.repository.pg';
import { AccessAuthPgRepository } from '../signing/access-auth/access-auth.repository.pg';
import { AccessCodeMinter } from '../signing/access-auth/access-code-minter.service';
import { SigningTokenService } from '../signing/signing-token.service';
import { installFastLatin1 } from './fast-latin1';

/**
 * Entry for the `email-worker` Edge Function (docs/supabase-native-architecture.md).
 *
 * Drains the outbound_emails outbox, the job EmailWorkerService does in the
 * Docker process. Wired by hand like `seal-worker`, mirroring EmailModule plus
 * the three link minters other modules provide to it (access codes,
 * approval links, email-copy stop links), so every mail kind renders the
 * same as before. Signer links are minted here, at dispatch (MCP Insert A).
 */
export interface EmailWorker {
  /** One batch. `claimed === batchSize` means more is probably waiting. */
  flushBatch(): Promise<FlushResult & { readonly batchSize: number }>;
}

/** Rendering is cheap; the batch is bounded by Resend round trips, not CPU. */
export const EMAIL_BATCH_SIZE = 25;

export function createEmailWorker(source: NodeJS.ProcessEnv = process.env): EmailWorker {
  installFastLatin1();
  const env = parseEnv(source);
  const db = createDb(env, { maxConnections: 2 });
  const templates = new TemplateService();
  templates.onModuleInit();
  const automationHook = new AutomationMatcherService(new AutomationsPgRepository(db), env);
  const dispatcher = new EmailDispatcherService(
    new OutboundEmailsPgRepository(db),
    selectEmailSender(env),
    templates,
    new EnvelopesPgRepository(db, automationHook),
    new SigningTokenService(),
    env,
    new AccessCodeMinter(new AccessAuthPgRepository(db), env),
    new ApprovalLinkMinter(new ApprovalsPgRepository(db), env),
    new EmailCopyLinkMinter(new EmailCopyPgRepository(db), env),
  );
  const logger = new Logger('EmailWorker');
  return {
    async flushBatch() {
      const result = await dispatcher.flushOnce(EMAIL_BATCH_SIZE);
      if (result.claimed > 0) {
        logger.log(
          `flushed ${result.claimed}: sent=${result.sent} retried=${result.retried} failed=${result.failed} skipped=${result.skipped}`,
        );
      }
      return { ...result, batchSize: EMAIL_BATCH_SIZE };
    },
  };
}

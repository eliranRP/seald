import { Injectable } from '@nestjs/common';
import { AccountDirectoryService } from '../accounts/account-directory.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { AutomationsService } from '../automations/automations.service';
import { ContactsService } from '../contacts/contacts.service';
import { EnvelopeDocumentsService } from '../envelopes/documents/envelope-documents.service';
import { EnvelopesService } from '../envelopes/envelopes.service';
import { EnvelopeQueriesService } from '../envelopes/queries/envelope-queries.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { SigningOrderService } from '../signing/signing-order.service';
import { TemplateApplyService } from '../templates/template-apply.service';
import { TemplatesService } from '../templates/templates.service';
import { DriveSourceService } from '../uploads/drive-source.service';
import { StagedUploadsService } from '../uploads/staged-uploads.service';

/**
 * The application services the tools may call. Tools are thin adapters:
 * they call the same service methods the HTTP controllers call and never
 * reach a repository (eslint `src/mcp` boundary, step 0d).
 *
 * `signingOrder` is the sender-side `PUT /envelopes/:id/signing-order`
 * service; the boundary allows that one file under `signing/`.
 */
@Injectable()
export class McpServices {
  constructor(
    readonly envelopes: EnvelopesService,
    readonly documents: EnvelopeDocumentsService,
    readonly queries: EnvelopeQueriesService,
    readonly accounts: AccountDirectoryService,
    readonly signingOrder: SigningOrderService,
    readonly idempotency: IdempotencyService,
    readonly uploads: StagedUploadsService,
    readonly drive: DriveSourceService,
    // WP-21 (step 7c): approval-gated tools ask here; approvals_get / _list read.
    readonly approvals: ApprovalsService,
    // WP-30 (automations A3): the same service the settings API uses.
    readonly automations: AutomationsService,
    // WP-25 (steps 12–13): contacts and templates.
    readonly contacts: ContactsService,
    readonly templates: TemplatesService,
    readonly templateApply: TemplateApplyService,
  ) {}
}

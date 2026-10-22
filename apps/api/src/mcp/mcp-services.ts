import { Injectable } from '@nestjs/common';
import { AccountDirectoryService } from '../accounts/account-directory.service';
import { EnvelopeDocumentsService } from '../envelopes/documents/envelope-documents.service';
import { EnvelopesService } from '../envelopes/envelopes.service';
import { EnvelopeQueriesService } from '../envelopes/queries/envelope-queries.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { SigningOrderService } from '../signing/signing-order.service';
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
  ) {}
}

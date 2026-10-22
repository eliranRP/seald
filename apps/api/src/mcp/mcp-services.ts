import { Injectable } from '@nestjs/common';
import { AccountDirectoryService } from '../accounts/account-directory.service';
import { EnvelopeDocumentsService } from '../envelopes/documents/envelope-documents.service';
import { EnvelopesService } from '../envelopes/envelopes.service';
import { EnvelopeQueriesService } from '../envelopes/queries/envelope-queries.service';

/**
 * The application services the tools may call. Tools are thin adapters:
 * they call the same service methods the HTTP controllers call and never
 * reach a repository (eslint `src/mcp` boundary, step 0d).
 */
@Injectable()
export class McpServices {
  constructor(
    readonly envelopes: EnvelopesService,
    readonly documents: EnvelopeDocumentsService,
    readonly queries: EnvelopeQueriesService,
    readonly accounts: AccountDirectoryService,
  ) {}
}

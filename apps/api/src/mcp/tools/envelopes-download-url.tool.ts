import {
  EnvelopesDownloadUrlInputSchema,
  EnvelopesDownloadUrlOutputSchema,
  MCP_DOWNLOAD_URL_TTL_SECONDS,
} from 'shared';
import { defineTool } from '../tool';
import { McpToolFailure } from '../tool-errors';

/**
 * `envelopes_download_url` → `EnvelopesService.getDownloadUrl`, or
 * `EnvelopeDocumentsService.downloadUrl` for one document, the same
 * calls `GET /envelopes/:id/download` makes (step 6). Both sign for 300
 * seconds; MCP does not ask for longer.
 */
export const envelopesDownloadUrlTool = defineTool({
  name: 'envelopes_download_url',
  title: 'Download link',
  description:
    'Returns a link to download a PDF of one envelope: sealed (the default when it exists), original, or the audit trail. Pass document_id for one document of a multi-document envelope (sealed or original only). The link expires in five minutes. Do not put it in a webhook or a prompt log. Document content and signer data returned to you are processed by your own AI or agent provider, which is not a Seald sub-processor.',
  step: 'step-6',
  scopes: ['envelopes:read'],
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  signedUrlFields: ['url'],
  input: EnvelopesDownloadUrlInputSchema,
  output: EnvelopesDownloadUrlOutputSchema,
  handler: async ({ envelope_id, kind, document_id }, { principal, services }) => {
    if (document_id !== undefined) {
      if (kind === 'audit') throw new McpToolFailure('validation_error');
      const res = await services.documents.downloadUrl(principal.ownerId, envelope_id, {
        document_id,
        ...(kind !== undefined ? { kind } : {}),
      });
      if (res.kind === 'zip') throw new McpToolFailure('validation_error');
      return {
        url: res.url,
        kind: res.kind,
        document_id,
        expires_in_seconds: MCP_DOWNLOAD_URL_TTL_SECONDS,
      };
    }
    const res = await services.envelopes.getDownloadUrl(principal.ownerId, envelope_id, kind);
    if (res.kind === 'declined') throw new McpToolFailure('validation_error');
    return { url: res.url, kind: res.kind, expires_in_seconds: MCP_DOWNLOAD_URL_TTL_SECONDS };
  },
});

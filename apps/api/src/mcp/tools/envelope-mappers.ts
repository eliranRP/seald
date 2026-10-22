import type { Envelope, EnvelopeDocument, McpEnvelope } from 'shared';
import { mcpSignerStatus } from '../../envelopes/queries/envelope-queries.service';

/**
 * Wire envelope (already decorated with `documents[]`) → the MCP
 * `Envelope` shape. Picks fields by name, so a column added to the wire
 * type later does not leak into tool output by accident; the output
 * schema parse is the second net.
 */
export function toMcpEnvelope(envelope: Envelope): McpEnvelope {
  return {
    id: envelope.id,
    title: envelope.title,
    status: envelope.status,
    short_code: envelope.short_code,
    tags: [...envelope.tags],
    original_pages: envelope.original_pages,
    expires_at: envelope.expires_at,
    sent_at: envelope.sent_at,
    completed_at: envelope.completed_at,
    created_at: envelope.created_at,
    updated_at: envelope.updated_at,
    signers: envelope.signers.map((s) => ({
      id: s.id,
      email: s.email,
      name: s.name,
      role: s.role,
      signing_order: s.signing_order,
      status: mcpSignerStatus(s, envelope.sent_at),
      viewed_at: s.viewed_at,
      signed_at: s.signed_at,
      declined_at: s.declined_at,
    })),
    fields: envelope.fields.map((f) => ({
      id: f.id,
      signer_id: f.signer_id,
      ...(f.document_id !== undefined ? { document_id: f.document_id } : {}),
      kind: f.kind,
      page: f.page,
      x: f.x,
      y: f.y,
      width: f.width ?? null,
      height: f.height ?? null,
      required: f.required,
    })),
    documents: (envelope.documents ?? []).map(toMcpDocument),
  };
}

export function toMcpDocument(doc: EnvelopeDocument): EnvelopeDocument {
  return {
    id: doc.id,
    ord: doc.ord,
    title: doc.title,
    original_pages: doc.original_pages,
    original_sha256: doc.original_sha256,
    sealed_sha256: doc.sealed_sha256,
  };
}

import type { ApprovalDestination, ApprovalKind } from 'shared';
import { sha256Hex } from '../common/sha256';
import { canonicalJsonValue } from '../envelopes/event-hash';

/** One placed field, as far as an approval binds it. */
export interface SubjectField {
  readonly id: string;
  readonly signer_id: string;
  readonly document_id: string | null;
  readonly kind: string;
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly width: number | null;
  readonly height: number | null;
}

/** Everything `subject_hash` covers (docs/design/mcp-server.md § Owner approval). */
export interface SubjectFacts {
  readonly kind: ApprovalKind;
  /** The full recipient list, names and emails. The New flags are not hashed. */
  readonly recipients: ReadonlyArray<{ readonly name: string; readonly email: string }>;
  readonly pageCount: number | null;
  readonly keyName: string;
  readonly approverEmail: string;
  readonly destination: ApprovalDestination | null;
  /** `original_sha256` of every document, in document order. */
  readonly files: readonly string[];
  readonly fields: readonly SubjectField[];
  /** Kind-specific facts that change what Approve does (a folder id, an expiry). */
  readonly extra?: Readonly<Record<string, unknown>>;
}

/**
 * `subject_hash`: SHA-256 of canonical JSON of three parts, the displayed
 * facts, the file hashes and the fields. The one definition, shared by the
 * approval row and the 10-minute confirmation row. Canonical JSON is the
 * audit chain's helper (rule S.6), not a second implementation.
 *
 * Recipients are hashed as a set (sorted by email, then name) so the
 * hash does not depend on the order a list query returns them in, and
 * emails are compared without case. Fields are sorted by id.
 */
export function computeSubjectHash(facts: SubjectFacts): string {
  const recipients = facts.recipients
    .map((r) => ({ name: r.name, email: r.email.trim().toLowerCase() }))
    .sort((a, b) =>
      a.email === b.email ? a.name.localeCompare(b.name) : a.email.localeCompare(b.email),
    );
  const fields = [...facts.fields]
    .map((f) => ({
      id: f.id,
      signer_id: f.signer_id,
      document_id: f.document_id,
      kind: f.kind,
      page: f.page,
      x: f.x,
      y: f.y,
      width: f.width,
      height: f.height,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const canonical = canonicalJsonValue({
    facts: {
      action: facts.kind,
      recipients,
      page_count: facts.pageCount,
      key_name: facts.keyName,
      approver_email: facts.approverEmail.trim().toLowerCase(),
      destination: facts.destination,
      extra: facts.extra ?? {},
    },
    files: [...facts.files],
    fields,
  });
  return sha256Hex(canonical);
}

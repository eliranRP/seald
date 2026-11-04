import type { EnvelopeListItem } from 'shared';
import {
  cancelEnvelope,
  deleteEnvelope,
  getEnvelopeDownloadUrl,
  remindEnvelopeSigner,
  setEnvelopeArchived,
} from '@/features/envelopes';
import { patchEnvelope } from '@/features/envelopes/envelopesApi';
import { apiClient } from '@/lib/api/apiClient';

/**
 * Network actions behind the Documents home: remind, download, cancel,
 * delete a draft, tag, and fix a bounced address. Each resolves to a small
 * summary the page turns into a toast; none throws for a partial failure.
 */

type Signer = EnvelopeListItem['signers'][number];

export interface ActionSummary {
  readonly ok: number;
  readonly failed: number;
  /** Slug of the first failure, e.g. `remind_throttled`. */
  readonly firstError?: string;
}

function errorSlug(err: unknown): string {
  const data = (err as { response?: { data?: { error?: unknown } } } | null)?.response?.data;
  return typeof data?.error === 'string' ? data.error : 'failed';
}

export function pendingSigners(env: EnvelopeListItem, viewerEmail: string | null): Signer[] {
  const me = viewerEmail?.toLowerCase() ?? null;
  return env.signers.filter(
    (s) => s.status !== 'completed' && s.status !== 'declined' && s.email.toLowerCase() !== me,
  );
}

export function canRemind(env: EnvelopeListItem): boolean {
  return env.status === 'awaiting_others';
}

/** Re-send the invite to everyone who has not signed yet. */
export async function remindEnvelopes(
  envelopes: ReadonlyArray<EnvelopeListItem>,
  viewerEmail: string | null,
): Promise<ActionSummary> {
  let ok = 0;
  let failed = 0;
  let firstError: string | undefined;
  for (const env of envelopes) {
    if (!canRemind(env)) continue;
    for (const signer of pendingSigners(env, viewerEmail)) {
      try {
        await remindEnvelopeSigner(env.id, signer.id);
        ok += 1;
      } catch (err) {
        failed += 1;
        firstError ??= errorSlug(err);
      }
    }
  }
  return firstError === undefined ? { ok, failed } : { ok, failed, firstError };
}

/** Open the sealed PDF of each completed envelope. */
export async function downloadEnvelopes(
  envelopes: ReadonlyArray<EnvelopeListItem>,
): Promise<ActionSummary> {
  let ok = 0;
  let failed = 0;
  for (const env of envelopes) {
    if (env.status !== 'completed') continue;
    try {
      const { url } = await getEnvelopeDownloadUrl(env.id, 'sealed');
      window.open(url, '_blank', 'noopener');
      ok += 1;
    } catch {
      failed += 1;
    }
  }
  return { ok, failed };
}

/** Delete drafts; withdraw sent documents that are still out for signature. */
export async function removeEnvelopes(
  envelopes: ReadonlyArray<EnvelopeListItem>,
): Promise<ActionSummary> {
  let ok = 0;
  let failed = 0;
  for (const env of envelopes) {
    try {
      if (env.status === 'draft') await deleteEnvelope(env.id);
      else if (env.status === 'awaiting_others' || env.status === 'sealing') {
        await cancelEnvelope(env.id);
      } else continue;
      ok += 1;
    } catch {
      failed += 1;
    }
  }
  return { ok, failed };
}

/** Archive (or, with `archived` false, restore) each envelope. */
export async function archiveEnvelopes(
  envelopes: ReadonlyArray<EnvelopeListItem>,
  archived: boolean,
): Promise<ActionSummary> {
  let ok = 0;
  let failed = 0;
  for (const env of envelopes) {
    try {
      await setEnvelopeArchived(env.id, archived);
      ok += 1;
    } catch {
      failed += 1;
    }
  }
  return { ok, failed };
}

/** Add one tag to each envelope, keeping the tags it already has. */
export async function addTagToEnvelopes(
  envelopes: ReadonlyArray<EnvelopeListItem>,
  tag: string,
): Promise<ActionSummary> {
  const clean = tag.trim().toLowerCase();
  let ok = 0;
  let failed = 0;
  for (const env of envelopes) {
    try {
      const current = (env.tags ?? []).map((t) => t.toLowerCase());
      if (!current.includes(clean)) await patchEnvelope(env.id, { tags: [...current, clean] });
      ok += 1;
    } catch {
      failed += 1;
    }
  }
  return { ok, failed };
}

/** Copy the in-app link of a document. */
export async function copyDocumentLink(id: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(`${window.location.origin}/document/${id}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Correct a bounced address and resend the invite. Calls the signer-update
 * endpoint of the envelope-detail workstream
 * (`PATCH /envelopes/:id/signers/:sid`); the Needs-you card only shows when
 * a signer is reported as bounced, so the call is never made without it.
 */
export async function fixBouncedEmail(
  envelopeId: string,
  signerId: string,
  email: string,
): Promise<void> {
  await apiClient.patch(`/envelopes/${envelopeId}/signers/${signerId}`, { email });
}

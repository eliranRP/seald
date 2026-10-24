import { Injectable, NotFoundException } from '@nestjs/common';
import { isFeatureEnabled, type VerifyDocument } from 'shared';
import { EnvelopeDocumentsRepository } from '../envelopes/documents/envelope-documents.repository';
import type { Envelope, EnvelopeEvent } from '../envelopes/envelope.entity';
import { EnvelopesRepository } from '../envelopes/envelopes.repository';
import { isValidShortCode } from '../envelopes/short-code';
import { detectPadesProfile, weakestProfile, type PadesProfile } from '../sealing/pades-profile';
import { StorageService } from '../storage/storage.service';

/** Sealed bytes never change, so a profile is cached by the sealed hash. */
const PROFILE_CACHE_MAX = 500;

/**
 * Public verification of an envelope by short code: metadata, redacted
 * timeline, audit-chain flag, and short-lived sealed/audit URLs.
 * `GET /verify/:short_code` delegates here. The response shape is the
 * wire contract; storage paths and signer tokens stay on the server.
 */
@Injectable()
export class VerifyService {
  constructor(
    private readonly repo: EnvelopesRepository,
    private readonly storage: StorageService,
    private readonly documents: EnvelopeDocumentsRepository,
  ) {}

  private readonly profiles = new Map<string, PadesProfile>();

  /** `GET /verify/by-hash/:sha256` — 404 for malformed input and for no match. */
  async findByHash(sha256: string): Promise<{ readonly short_code: string }> {
    if (!/^[0-9a-f]{64}$/i.test(sha256)) throw new NotFoundException('envelope_not_found');
    const short_code = await this.repo.findShortCodeBySealedSha256(sha256.toLowerCase());
    if (!short_code) throw new NotFoundException('envelope_not_found');
    return { short_code };
  }

  async verify(short_code: string): Promise<VerifyResponse> {
    // Validate short_code format before hitting the database — rejects
    // injection payloads and limits enumeration surface (OW-3.2, rule 2.1).
    // Returns 404 (not 400) to avoid leaking format expectations to scanners.
    if (!isValidShortCode(short_code)) {
      throw new NotFoundException('envelope_not_found');
    }
    const envelope = await this.repo.findByShortCode(short_code);
    if (!envelope) throw new NotFoundException('envelope_not_found');

    const events = await this.repo.listEventsForEnvelope(envelope.id);
    const { chain_intact } = await this.repo.verifyEventChain(envelope.id);

    let sealed_url: string | null = null;
    let audit_url: string | null = null;
    if (envelope.status === 'completed') {
      sealed_url = await this.storage.createSignedUrl(`${envelope.id}/sealed.pdf`, 300);
      audit_url = await this.storage.createSignedUrl(`${envelope.id}/audit.pdf`, 300);
    } else if (
      envelope.status === 'declined' ||
      envelope.status === 'expired' ||
      envelope.status === 'canceled'
    ) {
      // Audit PDF may exist even for non-sealed terminal envelopes.
      const exists = await this.storage.exists(`${envelope.id}/audit.pdf`);
      if (exists) {
        audit_url = await this.storage.createSignedUrl(`${envelope.id}/audit.pdf`, 300);
      }
    }

    // WP-03: per-document hashes while `multiDocumentEnvelopes` is on. The
    // legacy envelope-level hashes and URLs above keep mirroring document 1.
    const documents = isFeatureEnabled('multiDocumentEnvelopes')
      ? await this.listDocuments(envelope.id, envelope.status === 'completed')
      : null;

    return {
      envelope: {
        id: envelope.id,
        title: envelope.title,
        short_code: envelope.short_code,
        status: envelope.status,
        original_pages: envelope.original_pages,
        original_sha256: envelope.original_sha256,
        sealed_sha256: envelope.sealed_sha256,
        tc_version: envelope.tc_version,
        privacy_version: envelope.privacy_version,
        sent_at: envelope.sent_at,
        completed_at: envelope.completed_at,
        expires_at: envelope.expires_at,
        sealed_at: envelope.status === 'completed' ? sealedAt(envelope, events) : null,
        // The TSA that stamped the seal is not persisted per envelope yet.
        tsa_name: null,
        event_count: events.length,
        seal: envelope.status === 'completed' ? await this.sealProfile(envelope) : null,
      },
      signers: envelope.signers.map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        role: s.role,
        // `bounced` is for the sender; the public page reports it as awaiting.
        status: s.status === 'bounced' ? 'awaiting' : s.status,
        signed_at: s.signed_at,
        declined_at: s.declined_at,
      })),
      events: events.map(redactEvent),
      chain_intact,
      sealed_url,
      audit_url,
      ...(documents !== null ? { documents } : {}),
    };
  }

  /**
   * The PAdES level the sealed file(s) actually carry, read from the bytes;
   * the weakest document wins. Null when a file cannot be read, so the page
   * makes no claim it cannot back.
   */
  private async sealProfile(envelope: Envelope): Promise<PadesProfile | null> {
    const docs = await this.documents.listByEnvelope(envelope.id);
    const files = docs.flatMap((d) =>
      d.sealed_file_path !== null && d.sealed_sha256 !== null
        ? [{ path: d.sealed_file_path, sha256: d.sealed_sha256 }]
        : [],
    );
    if (files.length === 0 && envelope.sealed_sha256 !== null) {
      files.push({ path: `${envelope.id}/sealed.pdf`, sha256: envelope.sealed_sha256 });
    }
    if (files.length === 0) return null;
    let weakest: PadesProfile | null = null;
    for (const file of files) {
      const profile = await this.profileOf(file.path, file.sha256);
      if (profile === null) return null;
      weakest = weakest === null ? profile : weakestProfile(weakest, profile);
    }
    return weakest;
  }

  private async profileOf(path: string, sha256: string): Promise<PadesProfile | null> {
    const cached = this.profiles.get(sha256);
    if (cached !== undefined) return cached;
    let bytes: Buffer;
    try {
      bytes = await this.storage.download(path);
    } catch {
      return null;
    }
    const profile = detectPadesProfile(bytes);
    if (this.profiles.size >= PROFILE_CACHE_MAX) {
      const oldest = this.profiles.keys().next().value;
      if (oldest !== undefined) this.profiles.delete(oldest);
    }
    this.profiles.set(sha256, profile);
    return profile;
  }

  private async listDocuments(envelope_id: string, sealed: boolean): Promise<VerifyDocument[]> {
    const docs = await this.documents.listByEnvelope(envelope_id);
    const out: VerifyDocument[] = [];
    for (const d of docs) {
      out.push({
        id: d.id,
        ord: d.ord,
        title: d.title,
        original_pages: d.original_pages,
        original_sha256: d.original_sha256,
        sealed_sha256: d.sealed_sha256,
        sealed_url:
          sealed && d.sealed_file_path !== null
            ? await this.storage.createSignedUrl(d.sealed_file_path, 300)
            : null,
      });
    }
    return out;
  }
}

function sealedAt(envelope: Envelope, events: ReadonlyArray<EnvelopeEvent>): string | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const ev = events[i];
    if (ev?.event_type === 'sealed') return ev.created_at;
  }
  return envelope.completed_at;
}

function redactEvent(ev: EnvelopeEvent): RedactedEvent {
  return {
    id: ev.id,
    actor_kind: ev.actor_kind,
    event_type: ev.event_type,
    signer_id: ev.signer_id,
    created_at: ev.created_at,
  };
}

interface RedactedEvent {
  readonly id: string;
  readonly actor_kind: EnvelopeEvent['actor_kind'];
  readonly event_type: EnvelopeEvent['event_type'];
  readonly signer_id: string | null;
  readonly created_at: string;
}

export interface VerifyResponse {
  readonly envelope: {
    readonly id: string;
    readonly title: string;
    readonly short_code: string;
    readonly status: string;
    readonly original_pages: number | null;
    readonly original_sha256: string | null;
    readonly sealed_sha256: string | null;
    readonly tc_version: string;
    readonly privacy_version: string;
    readonly sent_at: string | null;
    readonly completed_at: string | null;
    readonly expires_at: string;
    /** When the PDF was sealed (the `sealed` event, else completed_at). Null until sealed. */
    readonly sealed_at: string | null;
    /** Timestamp authority behind the seal, when recorded. Not stored yet, so null. */
    readonly tsa_name: string | null;
    /** Number of audit events on the chain. */
    readonly event_count: number;
    /**
     * PAdES level and signature timestamp read from the sealed PDF bytes
     * (weakest document). Null until sealed, or when a file cannot be read.
     */
    readonly seal: PadesProfile | null;
  };
  readonly signers: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly email: string;
    readonly role: string;
    readonly status: string;
    readonly signed_at: string | null;
    readonly declined_at: string | null;
  }>;
  readonly events: ReadonlyArray<RedactedEvent>;
  /**
   * Whether the audit-event hash chain (`prev_event_hash` column on
   * envelope_events) is intact. `false` indicates that the underlying
   * row(s) have been mutated, inserted, or deleted out-of-band — i.e.
   * potential tampering with the audit log. `true` means every event row
   * after the genesis is a SHA-256 of the canonical JSON of its
   * predecessor, exactly as written by `appendEvent`. The verify-page UI
   * surfaces this as a green check ("audit chain intact") or a red
   * warning ("audit chain broken — possible tampering").
   */
  readonly chain_intact: boolean;
  /** 5-min signed URL. Null if not yet sealed. */
  readonly sealed_url: string | null;
  /** 5-min signed URL. Null if no audit.pdf has been produced. */
  readonly audit_url: string | null;
  /** WP-03: every document with its own hashes. Only while the
   *  `multiDocumentEnvelopes` flag is on. */
  readonly documents?: ReadonlyArray<VerifyDocument>;
}

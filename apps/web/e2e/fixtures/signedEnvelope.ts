import type { MockedApi } from './mockedApi';

/**
 * Pre-seeds the network-level mocks for the signer flow so `@signer`
 * scenarios skip the upload + send setup.
 *
 * The real signer API is cookie-scoped, not URL-scoped:
 *   - `POST /sign/start { envelope_id, token }` → sets `seald_sign` cookie
 *   - `GET  /sign/me`                            → returns SignMeResponse
 *   - `POST /sign/accept-terms`                  → 204
 *   - `POST /sign/fields/:id`                    → updated field
 *   - `POST /sign/signature` (multipart)         → updated signer
 *   - `POST /sign/submit`                        → { status: 'submitted' }
 *   - `POST /sign/decline`                       → { status: 'declined' }
 *   - `GET  /sign/pdf`                           → { url: '<pdf url>' }
 *
 * We mock all eight endpoints here in one place so step files can stay
 * declarative ("a sealed envelope ready for signing"). The envelope id
 * itself is hardcoded per shape (no `Date.now()` churn) so snapshots stay
 * deterministic.
 */
export type SignedEnvelopeShape = 'happy' | 'declined' | 'expired' | 'burned';

const ENVELOPE_IDS: Record<SignedEnvelopeShape, string> = {
  happy: 'env_test_happy',
  declined: 'env_test_declined',
  expired: 'env_test_expired',
  burned: 'env_test_burned',
};

const FIXED_NOW_ISO = '2026-04-25T10:00:00Z';

function buildSignMeResponse(envelopeId: string, status: 'awaiting' | 'declined') {
  return {
    envelope: {
      id: envelopeId,
      title: 'Master Services Agreement',
      short_code: 'MSA0420260000',
      status: status === 'declined' ? 'declined' : 'awaiting_signature',
      original_pages: 1,
      expires_at: '2026-05-25T10:00:00Z',
      tc_version: 'tc-2026-04',
      privacy_version: 'pp-2026-04',
    },
    signer: {
      id: 'signer_bob',
      email: 'bob@example.com',
      name: 'Bob Recipient',
      color: '#3b82f6',
      role: 'signatory' as const,
      status,
      viewed_at: FIXED_NOW_ISO,
      tc_accepted_at: null,
      signed_at: null,
      declined_at: status === 'declined' ? FIXED_NOW_ISO : null,
    },
    fields: [
      {
        id: 'field_sig_1',
        signer_id: 'signer_bob',
        kind: 'signature' as const,
        page: 1,
        x: 100,
        y: 200,
        width: 200,
        height: 60,
        required: true,
      },
    ],
    other_signers: [],
  };
}

export class SignedEnvelopeFixture {
  // Per-scenario active envelope id, populated by `seed()` and read by
  // step defs (rule 5.4: state lives in the fixture, never module-level).
  private activeId: string | null = null;

  constructor(private readonly api: MockedApi) {}

  /** The id of the most recently seeded envelope in this scenario. */
  get id(): string {
    if (!this.activeId) {
      throw new Error(
        'signedEnvelope.id read before seed() — call `Given a sealed envelope ready for signing` first.',
      );
    }
    return this.activeId;
  }

  seed(shape: SignedEnvelopeShape = 'happy'): string {
    const envelopeId = ENVELOPE_IDS[shape];
    this.activeId = envelopeId;

    if (shape === 'expired' || shape === 'burned') {
      // The entry page POSTs `/sign/start`; respond 410 to land the user on
      // the "burned link" copy (the SPA maps 401/409/410 → "burned").
      this.api.on('POST', /\/sign\/start$/, {
        status: 410,
        json: { error: shape === 'expired' ? 'expired' : 'burned' },
      });
      return envelopeId;
    }

    // Happy / declined paths: start succeeds, /me returns the envelope.
    this.api.on('POST', /\/sign\/start$/, {
      json: {
        envelope_id: envelopeId,
        signer_id: 'signer_bob',
        requires_tc_accept: true,
      },
    });
    this.api.on('GET', /\/sign\/me$/, {
      json: buildSignMeResponse(envelopeId, shape === 'declined' ? 'declined' : 'awaiting'),
    });
    this.api.on('POST', /\/sign\/accept-terms$/, { status: 204 });
    this.api.on('POST', /\/sign\/fields\//, {
      json: {
        id: 'field_sig_1',
        signer_id: 'signer_bob',
        kind: 'signature',
        page: 1,
        x: 100,
        y: 200,
        width: 200,
        height: 60,
        required: true,
        filled_at: FIXED_NOW_ISO,
      },
    });
    this.api.on('POST', /\/sign\/signature$/, {
      json: {
        id: 'signer_bob',
        email: 'bob@example.com',
        name: 'Bob Recipient',
        color: '#3b82f6',
        role: 'signatory',
        status: 'viewing',
        viewed_at: FIXED_NOW_ISO,
        tc_accepted_at: FIXED_NOW_ISO,
        signed_at: null,
        declined_at: null,
      },
    });
    this.api.on('POST', /\/sign\/submit$/, {
      json: { status: 'submitted', envelope_status: 'completed' },
    });
    this.api.on('POST', /\/sign\/decline$/, {
      json: { status: 'declined', envelope_status: 'declined' },
    });
    this.api.on('GET', /\/sign\/pdf$/, {
      json: { url: '/pdf-fixture.pdf' },
    });
    // Tiny inline PDF served at the URL above so pdf.js doesn't 404.
    this.api.on('GET', /\/pdf-fixture\.pdf$/, {
      contentType: 'application/pdf',
      body: '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF',
    });
    return envelopeId;
  }
}

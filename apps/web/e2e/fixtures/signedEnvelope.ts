import type { MockedApi } from './mockedApi';

/**
 * Pre-seeds a sealed envelope plus its audit-trail metadata in the network
 * mock layer so `@signer` scenarios can skip the upload + send setup.
 *
 * Returns the canonical envelope ID the rest of the scenario can use when
 * navigating to `/sign/:envId`. Distinct envelopes per scenario keep state
 * scoped — never reuse one across scenarios (rule 5.4).
 */
export type SignedEnvelopeShape = 'happy' | 'declined' | 'expired' | 'burned';

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
    const envelopeId = `env_${shape}_${Date.now().toString(36)}`;
    this.activeId = envelopeId;

    const baseEnvelope = {
      id: envelopeId,
      title: 'Master Services Agreement',
      status: shape === 'declined' ? 'declined' : 'awaiting_signature',
      sender: { name: 'Alice Example', email: 'alice@example.com' },
      signer: {
        name: 'Bob Recipient',
        email: 'bob@example.com',
        token: 'tok_signer_abc',
      },
      fields: [{ id: 'f1', kind: 'signature', page: 1, x: 100, y: 200, w: 200, h: 60 }],
      pdf: { url: '/api/pdf-fixture.pdf', pages: 1 },
    };

    if (shape === 'expired') {
      this.api.on('GET', new RegExp(`/sign/${envelopeId}/state$`), {
        status: 410,
        json: { error: 'expired' },
      });
      return envelopeId;
    }
    if (shape === 'burned') {
      this.api.on('GET', new RegExp(`/sign/${envelopeId}/state$`), {
        status: 410,
        json: { error: 'burned' },
      });
      return envelopeId;
    }

    this.api.on('GET', new RegExp(`/sign/${envelopeId}/state$`), {
      json: baseEnvelope,
    });
    this.api.on('POST', new RegExp(`/sign/${envelopeId}/start$`), {
      json: { ok: true, sessionToken: 'sess_test' },
    });
    this.api.on('POST', new RegExp(`/sign/${envelopeId}/complete$`), {
      json: { ok: true, status: 'completed' },
    });
    this.api.on('POST', new RegExp(`/sign/${envelopeId}/decline$`), {
      json: { ok: true, status: 'declined' },
    });
    return envelopeId;
  }
}

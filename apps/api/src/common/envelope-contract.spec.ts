import {
  EnvelopeSchema,
  FieldSchema,
  SignerSchema,
  ENVELOPE_STATUSES,
  FIELD_KINDS,
  SIGNER_ROLES,
  SIGNATURE_FORMATS,
  PlaceFieldsRequestSchema,
  CreateEnvelopeRequestSchema,
  PatchEnvelopeRequestSchema,
  DeclineRequestSchema,
  SignStartRequestSchema,
  VerifyResponseSchema,
  EnvelopeEventSchema,
} from 'shared';

describe('envelope-contract', () => {
  const validEnvelope = {
    id: '00000000-0000-0000-0000-000000000001',
    owner_id: '00000000-0000-0000-0000-000000000002',
    title: 'NDA',
    short_code: 'abc23456789de',
    status: 'draft' as const,
    delivery_mode: 'parallel' as const,
    original_pages: null,
    original_sha256: null,
    sealed_sha256: null,
    sender_email: null,
    sender_name: null,
    sent_at: null,
    completed_at: null,
    expires_at: '2026-05-24T00:00:00.000Z',
    tc_version: '2026-04-24',
    privacy_version: '2026-04-24',
    signers: [],
    fields: [],
    created_at: '2026-04-24T00:00:00.000Z',
    updated_at: '2026-04-24T00:00:00.000Z',
  };

  describe('EnvelopeSchema', () => {
    it('parses a valid draft envelope', () => {
      expect(EnvelopeSchema.parse(validEnvelope).title).toBe('NDA');
    });

    it('rejects unknown status', () => {
      expect(() => EnvelopeSchema.parse({ ...validEnvelope, status: 'nope' })).toThrow();
    });

    it('rejects short_code of wrong length', () => {
      expect(() => EnvelopeSchema.parse({ ...validEnvelope, short_code: 'abc' })).toThrow();
    });
  });

  describe('enum constants', () => {
    it('ENVELOPE_STATUSES has 7 values', () => {
      expect(ENVELOPE_STATUSES).toEqual([
        'draft',
        'awaiting_others',
        'sealing',
        'completed',
        'declined',
        'expired',
        'canceled',
      ]);
    });

    it('FIELD_KINDS has 6 values', () => {
      expect(FIELD_KINDS).toEqual(['signature', 'initials', 'date', 'text', 'checkbox', 'email']);
    });

    it('SIGNER_ROLES has 4 values', () => {
      expect(SIGNER_ROLES).toEqual(['proposer', 'signatory', 'validator', 'witness']);
    });

    it('SIGNATURE_FORMATS has 3 values', () => {
      expect(SIGNATURE_FORMATS).toEqual(['drawn', 'typed', 'upload']);
    });
  });

  describe('FieldSchema', () => {
    const baseField = {
      id: '00000000-0000-0000-0000-000000000003',
      signer_id: '00000000-0000-0000-0000-000000000004',
      kind: 'signature' as const,
      page: 1,
      x: 0.1,
      y: 0.1,
      required: true,
    };

    it('accepts minimal signature field', () => {
      expect(FieldSchema.parse(baseField).kind).toBe('signature');
    });

    it('rejects x outside [0,1]', () => {
      expect(() => FieldSchema.parse({ ...baseField, x: 1.5 })).toThrow();
    });

    it('rejects page < 1', () => {
      expect(() => FieldSchema.parse({ ...baseField, page: 0 })).toThrow();
    });
  });

  describe('SignerSchema', () => {
    const baseSigner = {
      id: '00000000-0000-0000-0000-000000000005',
      email: 'a@b.com',
      name: 'Ada',
      color: '#FF00AA',
      role: 'signatory' as const,
      signing_order: 1,
      status: 'awaiting' as const,
      viewed_at: null,
      tc_accepted_at: null,
      signed_at: null,
      declined_at: null,
    };

    it('parses signer with hex color', () => {
      expect(SignerSchema.parse(baseSigner).color).toBe('#FF00AA');
    });

    it('rejects bad color', () => {
      expect(() => SignerSchema.parse({ ...baseSigner, color: 'red' })).toThrow();
    });

    it('rejects empty name', () => {
      expect(() => SignerSchema.parse({ ...baseSigner, name: '' })).toThrow();
    });
  });

  describe('request DTOs', () => {
    it('CreateEnvelopeRequestSchema accepts a title', () => {
      expect(CreateEnvelopeRequestSchema.parse({ title: 'X' }).title).toBe('X');
    });

    it('PatchEnvelopeRequestSchema rejects empty patch', () => {
      expect(() => PatchEnvelopeRequestSchema.parse({})).toThrow(/empty_patch/);
    });

    it('PatchEnvelopeRequestSchema accepts partial', () => {
      expect(PatchEnvelopeRequestSchema.parse({ title: 'new' }).title).toBe('new');
    });

    it('PlaceFieldsRequestSchema accepts empty array', () => {
      expect(PlaceFieldsRequestSchema.parse({ fields: [] }).fields).toEqual([]);
    });

    it('DeclineRequestSchema accepts missing reason', () => {
      expect(DeclineRequestSchema.parse({}).reason).toBeUndefined();
    });

    it('DeclineRequestSchema rejects reason > 500 chars', () => {
      expect(() => DeclineRequestSchema.parse({ reason: 'x'.repeat(501) })).toThrow();
    });

    it('SignStartRequestSchema requires uuid + token', () => {
      expect(() => SignStartRequestSchema.parse({ envelope_id: 'bad', token: 'x' })).toThrow();
    });
  });

  describe('VerifyResponseSchema', () => {
    it('accepts a minimal verify response', () => {
      const parsed = VerifyResponseSchema.parse({
        status: 'completed',
        short_code: 'abc23456789de',
        created_at: '2026-04-24T00:00:00.000Z',
        completed_at: '2026-04-24T01:00:00.000Z',
        declined_at: null,
        expired_at: null,
        signer_list: [
          {
            name_masked: 'A***',
            email_masked: 'a***@b.com',
            signed_at: '2026-04-24T00:30:00.000Z',
          },
        ],
        original_sha256: 'a'.repeat(64),
        sealed_sha256: 'b'.repeat(64),
      });
      expect(parsed.signer_list).toHaveLength(1);
    });
  });

  describe('EnvelopeEventSchema', () => {
    it('accepts a signed event', () => {
      const parsed = EnvelopeEventSchema.parse({
        id: '00000000-0000-0000-0000-000000000006',
        envelope_id: validEnvelope.id,
        signer_id: '00000000-0000-0000-0000-000000000007',
        actor_kind: 'signer',
        event_type: 'signed',
        ip: '1.2.3.4',
        user_agent: 'chrome',
        metadata: { foo: 'bar' },
        created_at: '2026-04-24T00:00:00.000Z',
      });
      expect(parsed.event_type).toBe('signed');
    });
  });
});

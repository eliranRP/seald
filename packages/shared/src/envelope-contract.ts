import { z } from 'zod';

export const ENVELOPE_STATUSES = [
  'draft',
  'awaiting_others',
  'sealing',
  'completed',
  'declined',
  'expired',
  'canceled',
] as const;
export type EnvelopeStatus = (typeof ENVELOPE_STATUSES)[number];

export const DELIVERY_MODES = ['parallel', 'sequential'] as const;
export type DeliveryMode = (typeof DELIVERY_MODES)[number];

export const SIGNER_ROLES = ['proposer', 'signatory', 'validator', 'witness'] as const;
export type SignerRole = (typeof SIGNER_ROLES)[number];

export const FIELD_KINDS = [
  'signature',
  'initials',
  'date',
  'text',
  'checkbox',
  'email',
] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

export const SIGNATURE_FORMATS = ['drawn', 'typed', 'upload'] as const;
export type SignatureFormat = (typeof SIGNATURE_FORMATS)[number];

export const ACTOR_KINDS = ['sender', 'signer', 'system'] as const;
export type ActorKind = (typeof ACTOR_KINDS)[number];

export const EVENT_TYPES = [
  'created',
  'sent',
  'viewed',
  'tc_accepted',
  'field_filled',
  'signed',
  'all_signed',
  'sealed',
  'declined',
  'expired',
  'canceled',
  'reminder_sent',
  'session_invalidated_by_decline',
  'job_failed',
  'retention_deleted',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const SIGNER_UI_STATUSES = ['awaiting', 'viewing', 'completed', 'declined'] as const;
export type SignerUiStatus = (typeof SIGNER_UI_STATUSES)[number];

// Primitive schemas
export const uuid = z.string().uuid();
export const iso = z.string().datetime();
export const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
export const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

// Aggregate schemas
export const SignerSchema = z.object({
  id: uuid,
  email: z.string().email(),
  name: z.string().min(1).max(200),
  color: hexColor,
  role: z.enum(SIGNER_ROLES),
  signing_order: z.number().int().min(1),
  status: z.enum(SIGNER_UI_STATUSES),
  viewed_at: iso.nullable(),
  tc_accepted_at: iso.nullable(),
  signed_at: iso.nullable(),
  declined_at: iso.nullable(),
});
export type Signer = z.infer<typeof SignerSchema>;

export const FieldSchema = z.object({
  id: uuid,
  signer_id: uuid,
  kind: z.enum(FIELD_KINDS),
  page: z.number().int().min(1),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1).nullable().optional(),
  height: z.number().min(0).max(1).nullable().optional(),
  required: z.boolean(),
  link_id: z.string().nullable().optional(),
  value_text: z.string().nullable().optional(),
  value_boolean: z.boolean().nullable().optional(),
  filled_at: iso.nullable().optional(),
});
export type Field = z.infer<typeof FieldSchema>;

export const EnvelopeSchema = z.object({
  id: uuid,
  owner_id: uuid,
  title: z.string().min(1).max(200),
  short_code: z.string().length(13),
  status: z.enum(ENVELOPE_STATUSES),
  delivery_mode: z.enum(DELIVERY_MODES),
  original_pages: z.number().int().positive().nullable(),
  original_sha256: sha256.nullable(),
  sealed_sha256: sha256.nullable(),
  sent_at: iso.nullable(),
  completed_at: iso.nullable(),
  expires_at: iso,
  tc_version: z.string().min(1),
  privacy_version: z.string().min(1),
  signers: z.array(SignerSchema),
  fields: z.array(FieldSchema),
  created_at: iso,
  updated_at: iso,
});
export type Envelope = z.infer<typeof EnvelopeSchema>;

export const EnvelopeEventSchema = z.object({
  id: uuid,
  envelope_id: uuid,
  signer_id: uuid.nullable(),
  actor_kind: z.enum(ACTOR_KINDS),
  event_type: z.enum(EVENT_TYPES),
  ip: z.string().nullable(),
  user_agent: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  created_at: iso,
});
export type EnvelopeEvent = z.infer<typeof EnvelopeEventSchema>;

// Request DTOs
export const CreateEnvelopeRequestSchema = z.object({
  title: z.string().min(1).max(200),
});
export type CreateEnvelopeRequest = z.infer<typeof CreateEnvelopeRequestSchema>;

export const PatchEnvelopeRequestSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    expires_at: iso.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'empty_patch' });
export type PatchEnvelopeRequest = z.infer<typeof PatchEnvelopeRequestSchema>;

export const AddSignerRequestSchema = z.object({
  contact_id: uuid,
});
export type AddSignerRequest = z.infer<typeof AddSignerRequestSchema>;

const FieldPlacementInputSchema = z.object({
  signer_id: uuid,
  kind: z.enum(FIELD_KINDS),
  page: z.number().int().min(1),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1).nullable().optional(),
  height: z.number().min(0).max(1).nullable().optional(),
  required: z.boolean().default(true),
  link_id: z.string().max(100).nullable().optional(),
});
export const PlaceFieldsRequestSchema = z.object({
  fields: z.array(FieldPlacementInputSchema),
});
export type PlaceFieldsRequest = z.infer<typeof PlaceFieldsRequestSchema>;

export const SignStartRequestSchema = z.object({
  envelope_id: uuid,
  token: z.string().min(20),
});
export type SignStartRequest = z.infer<typeof SignStartRequestSchema>;

export const FillFieldRequestSchema = z
  .object({
    value_text: z.string().max(500).nullable().optional(),
    value_boolean: z.boolean().nullable().optional(),
  })
  .refine((v) => v.value_text != null || v.value_boolean != null, {
    message: 'value_required',
  });
export type FillFieldRequest = z.infer<typeof FillFieldRequestSchema>;

export const DeclineRequestSchema = z.object({
  reason: z.string().max(500).optional(),
});
export type DeclineRequest = z.infer<typeof DeclineRequestSchema>;

// Response DTOs
export const EnvelopeListItemSchema = EnvelopeSchema.pick({
  id: true,
  title: true,
  short_code: true,
  status: true,
  original_pages: true,
  sent_at: true,
  completed_at: true,
  expires_at: true,
  created_at: true,
  updated_at: true,
});
export type EnvelopeListItem = z.infer<typeof EnvelopeListItemSchema>;

export const EnvelopeListResponseSchema = z.object({
  items: z.array(EnvelopeListItemSchema),
  next_cursor: z.string().nullable(),
});
export type EnvelopeListResponse = z.infer<typeof EnvelopeListResponseSchema>;

export const VerifyResponseSchema = z.object({
  status: z.enum(ENVELOPE_STATUSES),
  short_code: z.string().length(13),
  created_at: iso,
  completed_at: iso.nullable(),
  declined_at: iso.nullable(),
  expired_at: iso.nullable(),
  signer_list: z.array(
    z.object({
      name_masked: z.string(),
      email_masked: z.string(),
      signed_at: iso.nullable(),
    }),
  ),
  original_sha256: sha256.nullable(),
  sealed_sha256: sha256.nullable(),
});
export type VerifyResponse = z.infer<typeof VerifyResponseSchema>;

export const ErrorSlugs = [
  'envelope_not_found',
  'envelope_not_draft',
  'envelope_terminal',
  'envelope_not_sealed',
  'audit_not_ready',
  'file_required',
  'file_too_large',
  'file_not_pdf',
  'file_unreadable',
  'no_signers',
  'no_fields',
  'signer_without_signature_field',
  'signer_not_in_envelope',
  'signer_email_taken',
  'stale_envelope',
  'remind_throttled',
  'invalid_token',
  'already_signed',
  'already_declined',
  'already_accepted',
  'missing_signer_session',
  'invalid_signer_session',
  'wrong_field_kind',
  'image_too_large',
  'image_not_png_or_jpeg',
  'image_unreadable',
  'tc_required',
  'signature_required',
  'missing_fields',
  'decline_reason_too_long',
  'contact_not_found',
  'validation_error',
  'invalid_cursor',
  'field_not_found',
] as const;
export type ErrorSlug = (typeof ErrorSlugs)[number];

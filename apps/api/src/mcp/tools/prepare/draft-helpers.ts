import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  isDateFormat,
  isExpiryWithinBounds,
  isFeatureEnabled,
  isValidTimeZone,
  type Envelope,
  type McpEnvelope,
} from 'shared';
import { McpToolFailure } from '../../tool-errors';
import type { McpToolContext } from '../../tool';
import { toMcpEnvelope } from '../envelope-mappers';

/** Annotations every draft write tool shares (closed world, safe to retry with its key). */
export const WRITE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export const DESTRUCTIVE_ANNOTATIONS = { ...WRITE_ANNOTATIONS, destructiveHint: true } as const;

/** Same calls as `GET /envelopes/:id`: owner check, then the document decoration. */
export async function loadEnvelope(ctx: McpToolContext, envelope_id: string): Promise<Envelope> {
  const envelope = await ctx.services.envelopes.getById(ctx.principal.ownerId, envelope_id);
  return ctx.services.documents.decorateEnvelope(envelope);
}

export async function loadMcpEnvelope(
  ctx: McpToolContext,
  envelope_id: string,
): Promise<McpEnvelope> {
  return toMcpEnvelope(await loadEnvelope(ctx, envelope_id));
}

/** Dry-run check: the envelope is the owner's and still a draft. */
export async function requireDraft(ctx: McpToolContext, envelope_id: string): Promise<Envelope> {
  const envelope = await loadEnvelope(ctx, envelope_id);
  if (envelope.status !== 'draft') throw new ConflictException('envelope_not_draft');
  return envelope;
}

/** A scope the call needs only for some arguments (e.g. a Drive source). */
export function requireScope(ctx: McpToolContext, scope: string): void {
  if (!(ctx.principal.scopes as readonly string[]).includes(scope)) {
    throw new McpToolFailure('insufficient_scope');
  }
}

/** The `PATCH /envelopes/:id` keys `envelopes_update` and `envelopes_prepare` accept. */
export interface MetadataArgs {
  readonly title?: string | undefined;
  readonly expires_at?: string | undefined;
  readonly tags?: readonly string[] | undefined;
  readonly reminders_enabled?: boolean | undefined;
  readonly reminder_first_after_days?: number | undefined;
  readonly reminder_interval_days?: number | undefined;
  readonly reminder_max?: number | undefined;
  readonly date_format?: string | undefined;
  readonly timezone?: string | undefined;
}

export type MetadataPatch = {
  -readonly [K in keyof MetadataArgs]?: Exclude<MetadataArgs[K], undefined>;
};

const METADATA_KEYS = [
  'title',
  'expires_at',
  'tags',
  'reminders_enabled',
  'reminder_first_after_days',
  'reminder_interval_days',
  'reminder_max',
  'date_format',
  'timezone',
] as const;

/**
 * The patch `EnvelopesService.patchDraft` gets, after the checks
 * `PatchEnvelopeDto` runs on the HTTP route: the expiry window while
 * custom reminders are on, and a known date format and IANA timezone
 * while field options are on. Flag-off keys are left for the service,
 * which rejects them exactly as it does for the controller.
 */
export function metadataPatch(args: MetadataArgs, now: Date): MetadataPatch {
  const patch: Record<string, unknown> = {};
  for (const key of METADATA_KEYS) {
    if (args[key] !== undefined) patch[key] = args[key];
  }
  if (
    args.expires_at !== undefined &&
    isFeatureEnabled('customReminders') &&
    !isExpiryWithinBounds(Date.parse(args.expires_at), now.getTime())
  ) {
    throw new BadRequestException('validation_error');
  }
  if (isFeatureEnabled('fieldMetaV2')) {
    if (args.date_format !== undefined && !isDateFormat(args.date_format)) {
      throw new BadRequestException('validation_error');
    }
    if (args.timezone !== undefined && !isValidTimeZone(args.timezone)) {
      throw new BadRequestException('validation_error');
    }
  }
  return patch as MetadataPatch;
}

/** The flag rules `patchDraft` applies, run without writing (dry runs). */
export function previewMetadata(patch: MetadataPatch): void {
  const cadence =
    patch.reminder_first_after_days !== undefined ||
    patch.reminder_interval_days !== undefined ||
    patch.reminder_max !== undefined;
  if (cadence && !isFeatureEnabled('customReminders')) {
    throw new BadRequestException('validation_error');
  }
  if (
    (patch.date_format !== undefined || patch.timezone !== undefined) &&
    !isFeatureEnabled('fieldMetaV2')
  ) {
    throw new BadRequestException('validation_error');
  }
}

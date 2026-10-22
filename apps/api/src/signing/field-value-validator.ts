import { BadRequestException } from '@nestjs/common';
import {
  formatCalendarDate,
  isDateFormat,
  isValidTimeZone,
  parseDateValue,
  validateTextValue,
  type AnyFieldKind,
  type FieldValueError,
} from 'shared';

/** What `fillField` is about to store. */
export interface FillBody {
  readonly value_text?: string | undefined;
  readonly value_boolean?: boolean | undefined;
}

export interface FillValidationContext {
  readonly kind: AnyFieldKind;
  /** The field's stored options (`{}` for a field placed without any). */
  readonly meta: Readonly<Record<string, unknown>>;
  /** The signer's display name, used to auto-fill a blank `name` field. */
  readonly signerName: string;
  /** Envelope date rendering (migration 0024); null keeps the signer's text. */
  readonly dateFormat: string | null | undefined;
  readonly timezone: string | null | undefined;
}

function reject(code: FieldValueError | 'field_read_only'): never {
  throw new BadRequestException(code);
}

/** `default` of the field as the text a signer would send, or null. */
function defaultText(meta: Readonly<Record<string, unknown>>): string | null {
  const d = meta['default'];
  if (typeof d === 'string') return d;
  if (typeof d === 'number') return String(d);
  return null;
}

/**
 * WP-07. Validate one fill against the field's kind and meta, and return
 * the body to store. Runs only while `fieldMetaV2` is on (the caller in
 * `SigningService.fillField` gates it), after the kind-to-payload check
 * that already guarantees `value_boolean` for checkbox and a string
 * `value_text` for everything else.
 *
 *   - `read_only` fields accept only their `default` (so the signer UI can
 *     "fill" them) and nothing else.
 *   - `name`: a blank value falls back to the signer's own name.
 *   - `date`: must parse (ISO, or the envelope's format); it is stored in
 *     the envelope's `date_format` when one is set, else as sent.
 *   - `email`: must look like an address (closes the old gap).
 *   - `text` char_limit, `number` range and format, `radio` / `dropdown`
 *     option membership: see `validateTextValue` in shared.
 *
 * Errors are 400 slugs: `field_value_too_long`, `field_value_not_a_number`,
 * `field_value_out_of_range`, `field_value_not_in_options`,
 * `field_value_invalid_email`, `field_value_invalid_date`,
 * `field_value_empty`, `field_read_only`.
 */
export function validateFieldFill(ctx: FillValidationContext, body: FillBody): FillBody {
  const { kind, meta } = ctx;

  if (kind === 'checkbox') {
    if (meta['read_only'] === true) reject('field_read_only');
    return body;
  }

  let value = body.value_text ?? '';

  if (meta['read_only'] === true) {
    const def = defaultText(meta);
    if (def === null || value !== def) reject('field_read_only');
  }

  if (kind === 'name' && value.trim().length === 0) value = ctx.signerName;

  if (kind === 'date') {
    const format = isDateFormat(ctx.dateFormat) ? ctx.dateFormat : null;
    const tz =
      typeof ctx.timezone === 'string' && isValidTimeZone(ctx.timezone) ? ctx.timezone : null;
    const parsed = parseDateValue(value, { format, timeZone: tz });
    if (parsed === null) reject('field_value_invalid_date');
    return {
      ...body,
      value_text: format !== null ? formatCalendarDate(parsed, format) : value.trim(),
    };
  }

  const problem = validateTextValue(kind, meta as Record<string, unknown>, value);
  if (problem !== null) reject(problem);

  // A number is stored as the plain value; `meta.format` is applied at
  // burn-in so the stored text stays machine-readable.
  return { ...body, value_text: kind === 'number' ? value.trim() : value };
}

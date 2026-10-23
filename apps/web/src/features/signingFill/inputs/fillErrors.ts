/**
 * Signer-facing text for the API's 400 slugs on `POST /sign/fields/:id`
 * (WP-07 `validateFieldFill`) and for the same checks run in the browser
 * with `validateTextValue`. One place so a client-side and a server-side
 * rejection read the same.
 */
import { translate } from '@/lib/i18n/useT';
import type { TFn } from '@/lib/i18n/useT';

export const FILL_ERROR_SLUGS = [
  'field_value_too_long',
  'field_value_not_a_number',
  'field_value_out_of_range',
  'field_value_not_in_options',
  'field_value_invalid_email',
  'field_value_invalid_date',
  'field_value_empty',
  'field_read_only',
] as const;
export type FillErrorSlug = (typeof FILL_ERROR_SLUGS)[number];

export function isFillErrorSlug(value: string): value is FillErrorSlug {
  return (FILL_ERROR_SLUGS as readonly string[]).includes(value);
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined;
}

function rangeMessage(min: number | undefined, max: number | undefined, t: TFn): string {
  if (min !== undefined && max !== undefined) {
    return t('signing.fillError.rangeBoth', { min, max });
  }
  if (min !== undefined) return t('signing.fillError.rangeMin', { min });
  if (max !== undefined) return t('signing.fillError.rangeMax', { max });
  return t('signing.fillError.rangeGeneric');
}

/**
 * Message for a slug, using the field's `meta` for the numbers it names
 * (character limit, range). An unknown slug (a network error, a legacy
 * message) comes back unchanged so nothing is hidden.
 */
export function fillErrorMessage(
  slug: string,
  meta: Readonly<Record<string, unknown>> | undefined,
  t: TFn = translate,
): string {
  if (!isFillErrorSlug(slug)) return slug;
  const m = meta ?? {};
  switch (slug) {
    case 'field_value_too_long': {
      const limit = num(m['char_limit']);
      return limit !== undefined
        ? t('signing.fillError.tooLong', { limit })
        : t('signing.fillError.tooLongGeneric');
    }
    case 'field_value_not_a_number':
      return t('signing.fillError.notNumber');
    case 'field_value_out_of_range':
      return rangeMessage(num(m['min']), num(m['max']), t);
    case 'field_value_not_in_options':
      return t('signing.fillError.notInOptions');
    case 'field_value_invalid_email':
      return t('signing.fillError.invalidEmail');
    case 'field_value_invalid_date':
      return t('signing.fillError.invalidDate');
    case 'field_value_empty':
      return t('signing.fillError.empty');
    case 'field_read_only':
      return t('signing.fillError.readOnly');
  }
}

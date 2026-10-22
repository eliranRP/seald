/**
 * Signer-facing text for the API's 400 slugs on `POST /sign/fields/:id`
 * (WP-07 `validateFieldFill`) and for the same checks run in the browser
 * with `validateTextValue`. One place so a client-side and a server-side
 * rejection read the same.
 */

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

function rangeMessage(min: number | undefined, max: number | undefined): string {
  if (min !== undefined && max !== undefined) {
    return `Enter a number from ${String(min)} to ${String(max)}.`;
  }
  if (min !== undefined) return `Enter a number of at least ${String(min)}.`;
  if (max !== undefined) return `Enter a number of at most ${String(max)}.`;
  return 'That number is out of range.';
}

/**
 * Message for a slug, using the field's `meta` for the numbers it names
 * (character limit, range). An unknown slug (a network error, a legacy
 * message) comes back unchanged so nothing is hidden.
 */
export function fillErrorMessage(
  slug: string,
  meta: Readonly<Record<string, unknown>> | undefined,
): string {
  if (!isFillErrorSlug(slug)) return slug;
  const m = meta ?? {};
  switch (slug) {
    case 'field_value_too_long': {
      const limit = num(m['char_limit']);
      return limit !== undefined
        ? `Use at most ${String(limit)} characters.`
        : 'That entry is too long.';
    }
    case 'field_value_not_a_number':
      return 'Enter a number, for example 1234.5.';
    case 'field_value_out_of_range':
      return rangeMessage(num(m['min']), num(m['max']));
    case 'field_value_not_in_options':
      return 'Choose one of the listed options.';
    case 'field_value_invalid_email':
      return 'Enter a valid email address, like name@example.com.';
    case 'field_value_invalid_date':
      return 'Enter a valid date.';
    case 'field_value_empty':
      return 'This field cannot be empty.';
    case 'field_read_only':
      return 'This field is read-only and cannot be changed.';
  }
}

import { z } from 'zod';

/**
 * Per-field options (WP-07, behind the `fieldMetaV2` flag).
 *
 * One strict Zod object per field kind, joined in a discriminated union on
 * `kind`. The `meta` column / wire property holds the options WITHOUT the
 * `kind` key (the field already has one); {@link parseFieldMeta} adds it
 * back for validation. Unknown keys are rejected so a typo never silently
 * disappears.
 */

/** The four kinds added by WP-07. */
export const NEW_FIELD_KINDS = ['name', 'number', 'radio', 'dropdown'] as const;
export type NewFieldKind = (typeof NEW_FIELD_KINDS)[number];

/** Every field kind the API knows while `fieldMetaV2` is on. */
export const ALL_FIELD_KINDS = [
  'signature',
  'initials',
  'date',
  'text',
  'checkbox',
  'email',
  ...NEW_FIELD_KINDS,
] as const;
export type AnyFieldKind = (typeof ALL_FIELD_KINDS)[number];

export function isNewFieldKind(kind: string): kind is NewFieldKind {
  return (NEW_FIELD_KINDS as readonly string[]).includes(kind);
}

export const FIELD_FONT_SIZE = { min: 8, max: 96 } as const;
export const FIELD_OPTIONS_MAX = 50;
/** Matches the 500-char cap `FillFieldDto.value_text` already has. */
export const FIELD_VALUE_MAX_CHARS = 500;

export const NUMBER_FORMATS = ['plain', 'thousands', 'fixed2', 'thousands_fixed2'] as const;
export type NumberFormat = (typeof NUMBER_FORMATS)[number];

const common = {
  label: z.string().min(1).max(100).optional(),
  placeholder: z.string().max(100).optional(),
  required: z.boolean().optional(),
  read_only: z.boolean().optional(),
  font_size: z.number().int().min(FIELD_FONT_SIZE.min).max(FIELD_FONT_SIZE.max).optional(),
};

const optionSchema = z.strictObject({
  label: z.string().min(1).max(100),
  value: z.string().min(1).max(100),
});
export type FieldOption = z.infer<typeof optionSchema>;

const optionsShape = {
  options: z.array(optionSchema).min(1).max(FIELD_OPTIONS_MAX),
  default: z.string().max(100).optional(),
};

/** options[] values must be unique; `default` must be one of them. */
function optionsRefine(
  v: { options: FieldOption[]; default?: string | undefined },
  ctx: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  v.options.forEach((o, i) => {
    if (seen.has(o.value)) {
      ctx.addIssue({
        code: 'custom',
        path: ['options', i, 'value'],
        message: 'option values must be unique',
      });
    }
    seen.add(o.value);
  });
  if (v.default !== undefined && !seen.has(v.default)) {
    ctx.addIssue({
      code: 'custom',
      path: ['default'],
      message: 'default must be one of the options',
    });
  }
}

const plain = <K extends AnyFieldKind>(kind: K) =>
  z.strictObject({ kind: z.literal(kind), ...common });

const textMeta = z.strictObject({
  kind: z.literal('text'),
  ...common,
  char_limit: z.number().int().min(1).max(FIELD_VALUE_MAX_CHARS).optional(),
  default: z.string().max(FIELD_VALUE_MAX_CHARS).optional(),
});

const numberMeta = z
  .strictObject({
    kind: z.literal('number'),
    ...common,
    min: z.number().optional(),
    max: z.number().optional(),
    format: z.enum(NUMBER_FORMATS).optional(),
    default: z.number().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.min !== undefined && v.max !== undefined && v.min > v.max) {
      ctx.addIssue({ code: 'custom', path: ['min'], message: 'min must not exceed max' });
    }
    if (
      v.default !== undefined &&
      ((v.min !== undefined && v.default < v.min) || (v.max !== undefined && v.default > v.max))
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['default'],
        message: 'default must be within min and max',
      });
    }
  });

const radioMeta = z
  .strictObject({ kind: z.literal('radio'), ...common, ...optionsShape })
  .superRefine(optionsRefine);
const dropdownMeta = z
  .strictObject({ kind: z.literal('dropdown'), ...common, ...optionsShape })
  .superRefine(optionsRefine);

export const FieldMetaSchema = z.discriminatedUnion('kind', [
  plain('signature'),
  plain('initials'),
  plain('date'),
  plain('email'),
  plain('checkbox'),
  plain('name'),
  textMeta,
  numberMeta,
  radioMeta,
  dropdownMeta,
]);
export type FieldMeta = z.infer<typeof FieldMetaSchema>;
/** The stored/wire form: the options without `kind`. */
export type FieldMetaOptions = Record<string, unknown>;

export interface FieldMetaIssue {
  readonly path: string;
  readonly message: string;
}

export type ParseFieldMetaResult =
  | { readonly ok: true; readonly meta: FieldMetaOptions }
  | { readonly ok: false; readonly issues: readonly FieldMetaIssue[] };

/**
 * Validate `meta` for a field of `kind`. `undefined` / `null` means "no
 * options" and yields `{}`. Anything that is not a plain object is
 * rejected, as is a `kind` key inside it.
 */
export function parseFieldMeta(kind: string, meta: unknown): ParseFieldMetaResult {
  if (meta === undefined || meta === null) return { ok: true, meta: {} };
  if (typeof meta !== 'object' || Array.isArray(meta)) {
    return { ok: false, issues: [{ path: 'meta', message: 'meta must be an object' }] };
  }
  if ('kind' in meta) {
    return { ok: false, issues: [{ path: 'meta.kind', message: 'meta must not contain kind' }] };
  }
  if (!(ALL_FIELD_KINDS as readonly string[]).includes(kind)) {
    return { ok: false, issues: [{ path: 'kind', message: `unknown field kind ${kind}` }] };
  }
  const result = FieldMetaSchema.safeParse({ ...(meta as Record<string, unknown>), kind });
  if (!result.success) {
    return {
      ok: false,
      issues: result.error.issues.map((i) => ({
        path: ['meta', ...i.path.map(String)].join('.'),
        message: i.message,
      })),
    };
  }
  const rest: Record<string, unknown> = { ...result.data };
  delete rest['kind'];
  return { ok: true, meta: rest };
}

/** Wire schema for `meta` on a field response: any object of options. */
export const FieldMetaWireSchema = z.record(z.string(), z.unknown());

// ---------- value validation (shared by API fill + SPA inputs) ----------

export type FieldValueError =
  | 'field_value_too_long'
  | 'field_value_not_a_number'
  | 'field_value_out_of_range'
  | 'field_value_not_in_options'
  | 'field_value_invalid_email'
  | 'field_value_invalid_date'
  | 'field_value_empty';

/** Pragmatic email check: one @, no spaces, a dot in the domain. */
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
export function isValidEmailValue(value: string): boolean {
  return value.length <= 254 && EMAIL.test(value);
}

const NUMERIC = /^-?(\d+\.?\d*|\.\d+)$/;

/** Parse a number a signer typed; null when it is not a plain decimal. */
export function parseNumberValue(text: string): number | null {
  const t = text.trim();
  if (!NUMERIC.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Render a number field's value per `meta.format`. */
export function formatNumberValue(text: string, format: NumberFormat | undefined): string {
  const n = parseNumberValue(text);
  if (n === null || format === undefined || format === 'plain') return text;
  const fixed = format === 'fixed2' || format === 'thousands_fixed2';
  const grouped = format === 'thousands' || format === 'thousands_fixed2';
  const [intPart = '', frac] = (fixed ? n.toFixed(2) : String(n)).split('.');
  const sign = intPart.startsWith('-') ? '-' : '';
  const digits = sign ? intPart.slice(1) : intPart;
  const body = grouped ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : digits;
  return `${sign}${body}${frac !== undefined ? `.${frac}` : ''}`;
}

/**
 * Check a text value against the kind's meta. Date parsing lives in the
 * API (it needs the envelope's format and timezone); this covers the
 * kind-and-meta rules that do not.
 */
export function validateTextValue(
  kind: AnyFieldKind,
  meta: Record<string, unknown>,
  value: string,
): FieldValueError | null {
  if (value.length > FIELD_VALUE_MAX_CHARS) return 'field_value_too_long';
  switch (kind) {
    case 'text': {
      const limit = typeof meta['char_limit'] === 'number' ? meta['char_limit'] : undefined;
      return limit !== undefined && value.length > limit ? 'field_value_too_long' : null;
    }
    case 'name':
      return value.trim().length === 0 ? 'field_value_empty' : null;
    case 'email':
      return isValidEmailValue(value) ? null : 'field_value_invalid_email';
    case 'number': {
      const n = parseNumberValue(value);
      if (n === null) return 'field_value_not_a_number';
      const min = typeof meta['min'] === 'number' ? meta['min'] : undefined;
      const max = typeof meta['max'] === 'number' ? meta['max'] : undefined;
      if ((min !== undefined && n < min) || (max !== undefined && n > max)) {
        return 'field_value_out_of_range';
      }
      return null;
    }
    case 'radio':
    case 'dropdown': {
      const options = Array.isArray(meta['options']) ? (meta['options'] as unknown[]) : [];
      const ok = options.some(
        (o) => typeof o === 'object' && o !== null && (o as { value?: unknown }).value === value,
      );
      return ok ? null : 'field_value_not_in_options';
    }
    default:
      return null;
  }
}

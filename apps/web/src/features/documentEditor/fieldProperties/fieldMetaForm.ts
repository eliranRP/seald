import {
  FIELD_FONT_SIZE,
  FIELD_OPTIONS_MAX,
  FIELD_VALUE_MAX_CHARS,
  NUMBER_FORMATS,
  isFeatureEnabled,
  parseFieldMeta,
  parseNumberValue,
  type FieldMetaOptions,
  type NumberFormat,
} from 'shared';
import type { FieldKind } from '@/types/sealdTypes';

/**
 * Pure model behind the field settings panel (WP-08). The panel edits a
 * string-valued draft; {@link metaFromDraft} turns it into the API's `meta`
 * and runs the same Zod union the API does (`parseFieldMeta`), so a value
 * the panel accepts is a value the API accepts.
 */

/** One option row. `id` is a stable React key only; it never leaves the draft. */
export interface OptionDraft {
  readonly id: string;
  readonly label: string;
  readonly value: string;
}

export interface MetaDraft {
  readonly label: string;
  readonly placeholder: string;
  readonly readOnly: boolean;
  readonly fontSize: string;
  readonly charLimit: string;
  /** Default for text (the text itself), number (as typed) and radio / dropdown (an option value). */
  readonly defaultValue: string;
  readonly min: string;
  readonly max: string;
  readonly format: NumberFormat | '';
  readonly options: ReadonlyArray<OptionDraft>;
}

export type DraftErrorKey =
  | 'label'
  | 'placeholder'
  | 'fontSize'
  | 'charLimit'
  | 'defaultValue'
  | 'min'
  | 'max'
  | 'options'
  | 'readOnly';

export interface DraftErrors {
  readonly fields: Partial<Record<DraftErrorKey, string>>;
  /** Per option row, keyed by `OptionDraft.id`. */
  readonly options: Readonly<Record<string, { label?: string; value?: string }>>;
}

export type MetaFromDraft =
  | { readonly ok: true; readonly meta: FieldMetaOptions }
  | { readonly ok: false; readonly errors: DraftErrors };

export const NUMBER_FORMAT_LABELS: Readonly<Record<NumberFormat, string>> = {
  plain: 'Plain (1234.5)',
  thousands: 'Thousands separator (1,234.5)',
  fixed2: 'Two decimals (1234.50)',
  thousands_fixed2: 'Thousands and two decimals (1,234.50)',
};

/** Kinds the settings panel edits. Signature, initials and checkbox keep their tile controls. */
const PANEL_KINDS: ReadonlyArray<FieldKind> = [
  'text',
  'name',
  'email',
  'date',
  'number',
  'radio',
  'dropdown',
];
const PLACEHOLDER_KINDS: ReadonlyArray<FieldKind> = ['text', 'name', 'email', 'number', 'dropdown'];
const READ_ONLY_KINDS: ReadonlyArray<FieldKind> = ['text', 'number', 'radio', 'dropdown'];
const FONT_SIZE_KINDS: ReadonlyArray<FieldKind> = [
  'text',
  'name',
  'email',
  'date',
  'number',
  'radio',
  'dropdown',
];

export function hasSettingsPanel(kind: FieldKind): boolean {
  return isFeatureEnabled('fieldMetaV2') && PANEL_KINDS.includes(kind);
}
export function supportsPlaceholder(kind: FieldKind): boolean {
  return PLACEHOLDER_KINDS.includes(kind);
}
export function supportsReadOnly(kind: FieldKind): boolean {
  return READ_ONLY_KINDS.includes(kind);
}
export function supportsFontSize(kind: FieldKind): boolean {
  return FONT_SIZE_KINDS.includes(kind);
}
export function hasOptions(kind: FieldKind): boolean {
  return kind === 'radio' || kind === 'dropdown';
}

let optionCounter = 0;
function nextOptionId(): string {
  optionCounter += 1;
  return `opt-${String(optionCounter)}`;
}

/** A fresh option row whose value does not collide with `existing`. */
export function newOption(existing: ReadonlyArray<OptionDraft>): OptionDraft {
  const taken = new Set(existing.map((o) => o.value));
  let n = existing.length + 1;
  while (taken.has(`option-${String(n)}`)) n += 1;
  return { id: nextOptionId(), label: `Option ${String(n)}`, value: `option-${String(n)}` };
}

/** Options a radio or dropdown starts with, so a freshly dropped field is already valid. */
function starterOptions(): ReadonlyArray<{ label: string; value: string }> {
  return [
    { label: 'Option 1', value: 'option-1' },
    { label: 'Option 2', value: 'option-2' },
  ];
}

/**
 * Meta a field of `kind` gets when it is dropped on the page. Only radio and
 * dropdown need any (the API refuses them without options); everything
 * else starts with none. Always undefined while `fieldMetaV2` is off.
 */
export function defaultFieldMeta(kind: FieldKind): FieldMetaOptions | undefined {
  if (!isFeatureEnabled('fieldMetaV2')) return undefined;
  return hasOptions(kind) ? { options: starterOptions() } : undefined;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function numStr(v: unknown): string {
  return typeof v === 'number' ? String(v) : '';
}

export function draftFromMeta(kind: FieldKind, meta: FieldMetaOptions | undefined): MetaDraft {
  const m = meta ?? {};
  const rawOptions = Array.isArray(m['options']) ? (m['options'] as unknown[]) : [];
  const options: OptionDraft[] = rawOptions.flatMap((o) => {
    if (typeof o !== 'object' || o === null) return [];
    const r = o as { label?: unknown; value?: unknown };
    return [{ id: nextOptionId(), label: str(r.label), value: str(r.value) }];
  });
  const format = m['format'];
  return {
    label: str(m['label']),
    placeholder: str(m['placeholder']),
    readOnly: m['read_only'] === true,
    fontSize: numStr(m['font_size']),
    charLimit: numStr(m['char_limit']),
    defaultValue: kind === 'number' ? numStr(m['default']) : str(m['default']),
    min: numStr(m['min']),
    max: numStr(m['max']),
    format: (NUMBER_FORMATS as readonly unknown[]).includes(format) ? (format as NumberFormat) : '',
    options,
  };
}

const WHOLE = /^\d+$/;

/** API meta key an issue path points at, to the control that edits it. */
const ISSUE_KEY_TARGET: Readonly<Record<string, DraftErrorKey>> = {
  font_size: 'fontSize',
  char_limit: 'charLimit',
  default: 'defaultValue',
  label: 'label',
  placeholder: 'placeholder',
  min: 'min',
  max: 'max',
  options: 'options',
};

function messageForIssue(key: string, message: string): string {
  if (key === 'font_size') {
    return `Font size must be a whole number from ${String(FIELD_FONT_SIZE.min)} to ${String(FIELD_FONT_SIZE.max)}.`;
  }
  if (key === 'char_limit') {
    return `Character limit must be a whole number from 1 to ${String(FIELD_VALUE_MAX_CHARS)}.`;
  }
  if (key === 'min' && message.includes('exceed')) return "Minimum can't be greater than maximum.";
  if (key === 'default' && message.includes('within')) {
    return 'Default must be between the minimum and the maximum.';
  }
  return message;
}

/**
 * Build the API `meta` from a draft, or the per-control errors. `original`
 * carries over a `required` the draft does not edit (templates may hold one).
 */
export function metaFromDraft(
  kind: FieldKind,
  draft: MetaDraft,
  original?: FieldMetaOptions,
): MetaFromDraft {
  const fields: Partial<Record<DraftErrorKey, string>> = {};
  const optionErrors: Record<string, { label?: string; value?: string }> = {};
  const meta: Record<string, unknown> = {};

  if (typeof original?.['required'] === 'boolean') meta['required'] = original['required'];

  const label = draft.label.trim();
  if (label !== '') meta['label'] = label;
  if (supportsPlaceholder(kind) && draft.placeholder !== '')
    meta['placeholder'] = draft.placeholder;
  if (supportsReadOnly(kind) && draft.readOnly) meta['read_only'] = true;

  if (supportsFontSize(kind) && draft.fontSize.trim() !== '') {
    const t = draft.fontSize.trim();
    if (WHOLE.test(t)) meta['font_size'] = Number(t);
    else fields.fontSize = messageForIssue('font_size', '');
  }

  if (kind === 'text') {
    if (draft.charLimit.trim() !== '') {
      const t = draft.charLimit.trim();
      if (WHOLE.test(t)) meta['char_limit'] = Number(t);
      else fields.charLimit = messageForIssue('char_limit', '');
    }
    if (draft.defaultValue !== '') {
      meta['default'] = draft.defaultValue;
      const limit = meta['char_limit'];
      if (typeof limit === 'number' && draft.defaultValue.length > limit) {
        fields.defaultValue = 'Default is longer than the character limit.';
      }
    }
  }

  if (kind === 'number') {
    for (const key of ['min', 'max'] as const) {
      const raw = draft[key].trim();
      if (raw === '') continue;
      const n = parseNumberValue(raw);
      if (n === null) fields[key] = 'Enter a number.';
      else meta[key] = n;
    }
    if (draft.format !== '') meta['format'] = draft.format;
    const rawDefault = draft.defaultValue.trim();
    if (rawDefault !== '') {
      const n = parseNumberValue(rawDefault);
      if (n === null) fields.defaultValue = 'Enter a number.';
      else meta['default'] = n;
    }
  }

  if (hasOptions(kind)) {
    if (draft.options.length > FIELD_OPTIONS_MAX) {
      fields.options = `Use at most ${String(FIELD_OPTIONS_MAX)} options.`;
    }
    const firstId = new Map<string, string>();
    for (const o of draft.options) {
      const entry: { label?: string; value?: string } = {};
      if (o.label.trim() === '') entry.label = 'Enter a label.';
      if (o.value.trim() === '') entry.value = 'Enter a value.';
      else if (firstId.has(o.value)) entry.value = 'Values must be unique.';
      else firstId.set(o.value, o.id);
      if (entry.label !== undefined || entry.value !== undefined) optionErrors[o.id] = entry;
    }
    if (draft.options.length === 0) fields.options = 'Add at least one option.';
    meta['options'] = draft.options.map((o) => ({ label: o.label, value: o.value }));
    if (draft.defaultValue !== '') {
      if (draft.options.some((o) => o.value === draft.defaultValue)) {
        meta['default'] = draft.defaultValue;
      } else {
        fields.defaultValue = 'Default must be one of the options.';
      }
    }
  }

  if (draft.readOnly && supportsReadOnly(kind) && meta['default'] === undefined) {
    if (fields.defaultValue === undefined) {
      fields.readOnly = 'A read-only field needs a default value.';
    }
  }

  // The API's own schema has the last word (length caps, key set, ranges).
  if (Object.keys(fields).length === 0 && Object.keys(optionErrors).length === 0) {
    const parsed = parseFieldMeta(kind, meta);
    if (parsed.ok) return { ok: true, meta: parsed.meta };
    for (const issue of parsed.issues) {
      const [, key] = issue.path.split('.');
      const target: DraftErrorKey = ISSUE_KEY_TARGET[key ?? ''] ?? 'label';
      fields[target] ??= messageForIssue(key ?? '', issue.message);
    }
  }
  return { ok: false, errors: { fields, options: optionErrors } };
}

/**
 * `{ meta }` to spread into a field placement request, or `{}`. Empty while
 * `fieldMetaV2` is off so a flag-off request is byte-identical to today's.
 */
export function placementMeta(field: { readonly meta?: FieldMetaOptions | undefined }): {
  meta?: FieldMetaOptions;
} {
  return isFeatureEnabled('fieldMetaV2') && field.meta !== undefined ? { meta: field.meta } : {};
}

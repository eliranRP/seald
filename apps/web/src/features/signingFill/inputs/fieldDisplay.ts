import {
  formatCalendarDate,
  formatNumberValue,
  isDateFormat,
  isFeatureEnabled,
  parseDateValue,
  type DateFormat,
  type NumberFormat,
} from 'shared';
import type { SignMeField } from '@/features/signing';

/** Kinds a signer fills through the meta-aware drawer while `fieldMetaV2` is on. */
const META_DRAWER_KINDS: ReadonlyArray<SignMeField['kind']> = [
  'text',
  'email',
  'date',
  'name',
  'number',
  'radio',
  'dropdown',
];

export function usesMetaDrawer(field: SignMeField): boolean {
  return isFeatureEnabled('fieldMetaV2') && META_DRAWER_KINDS.includes(field.kind);
}

export interface ChoiceOption {
  readonly label: string;
  readonly value: string;
}

export function metaOptions(meta: Readonly<Record<string, unknown>> | undefined): ChoiceOption[] {
  const raw = meta?.['options'];
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[]).flatMap((o) => {
    if (typeof o !== 'object' || o === null) return [];
    const r = o as { label?: unknown; value?: unknown };
    return typeof r.label === 'string' && typeof r.value === 'string'
      ? [{ label: r.label, value: r.value }]
      : [];
  });
}

export function isReadOnly(field: SignMeField): boolean {
  return isFeatureEnabled('fieldMetaV2') && field.meta?.['read_only'] === true;
}

/** The default as the text the API accepts for a read-only fill, or null. */
export function readOnlyDefault(field: SignMeField): string | null {
  const d = field.meta?.['default'];
  if (typeof d === 'string') return d;
  if (typeof d === 'number') return String(d);
  return null;
}

/** Sender-set label, when there is one. */
export function metaLabel(field: SignMeField): string | undefined {
  const l = field.meta?.['label'];
  return typeof l === 'string' && l.trim() !== '' ? l : undefined;
}

/**
 * What a filled field shows on the page: numbers in their `format`, choices
 * as their option label. Everything else is the stored text.
 */
export function displayText(field: SignMeField): string | null {
  const text = field.value_text;
  if (typeof text !== 'string' || text === '') return null;
  if (!isFeatureEnabled('fieldMetaV2')) return text;
  if (field.kind === 'number') {
    const format = field.meta?.['format'];
    return formatNumberValue(
      text,
      typeof format === 'string' ? (format as NumberFormat) : undefined,
    );
  }
  if (field.kind === 'radio' || field.kind === 'dropdown') {
    return metaOptions(field.meta).find((o) => o.value === text)?.label ?? text;
  }
  return text;
}

/**
 * Text for an `<input type="date">` (`yyyy-MM-dd`) from a stored date, which
 * the API writes in the envelope's format. Empty when it does not parse.
 */
export function dateToInputValue(
  stored: string,
  format: string | null | undefined,
  timeZone: string | null | undefined,
): string {
  const parsed = parseDateValue(stored, {
    format: isDateFormat(format) ? format : null,
    timeZone: timeZone ?? null,
  });
  return parsed === null ? '' : formatCalendarDate(parsed, 'yyyy-MM-dd' satisfies DateFormat);
}

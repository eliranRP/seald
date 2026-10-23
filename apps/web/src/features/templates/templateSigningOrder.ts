import { useEffect, useRef } from 'react';
import { isFeatureEnabled, MAX_SIGNING_ORDER } from 'shared';
import {
  stepNumbers,
  type OrderRow,
  type SigningOrderValue,
} from '@/features/signers/signingOrder/model';
import type { TemplateSummary } from './templates';

/**
 * Templates keep the signing order for their signer slots (WP-06 gap):
 * `delivery_mode` on the template and a 1-based `signing_order` on each
 * `last_signers` entry (slots with the same number sign together). Both are
 * read and written only while `signingOrder` is on, so with the flag off a
 * template looks and saves exactly as it did.
 */

type TemplateOrderSource = Pick<TemplateSummary, 'lastSigners' | 'deliveryMode'>;

/** The editor value a template's stored order stands for. */
export function signingOrderFromTemplate(template: TemplateOrderSource): SigningOrderValue {
  const signers = template.lastSigners ?? [];
  if (template.deliveryMode !== 'sequential' || signers.length < 2) {
    return { sequential: false, rows: [] };
  }
  // Stable sort by step; ties and missing numbers keep the saved order.
  const indexed = signers.map((s, i) => ({ id: s.id, step: s.signing_order ?? i + 1, i }));
  indexed.sort((a, b) => a.step - b.step || a.i - b.i);
  const rows: OrderRow[] = indexed.map((s, n) => ({
    id: s.id,
    joinsPrevious: n > 0 && indexed[n - 1]?.step === s.step,
  }));
  return { sequential: true, rows };
}

export interface TemplateOrderPatch {
  readonly delivery_mode?: 'parallel' | 'sequential';
}

/** `delivery_mode` to save with the template; empty while the flag is off. */
export function templateDeliveryMode(value: SigningOrderValue): TemplateOrderPatch {
  if (!isFeatureEnabled('signingOrder')) return {};
  return { delivery_mode: value.sequential && value.rows.length >= 2 ? 'sequential' : 'parallel' };
}

/**
 * Adds each signer's `signing_order` for the template's `last_signers`.
 * Signers the editor value does not list (kept as they were on a reduced
 * roster) are returned unchanged. Returns the list as is while the flag is
 * off or the order is "any order".
 */
export function withTemplateSigningOrder<T extends { readonly id: string }>(
  signers: ReadonlyArray<T>,
  value: SigningOrderValue,
): ReadonlyArray<T & { readonly signing_order?: number }> {
  if (!isFeatureEnabled('signingOrder') || !value.sequential || value.rows.length < 2) {
    return signers;
  }
  const numbers = stepNumbers(value.rows);
  return signers.map((s) => {
    const step = numbers.get(s.id);
    return step === undefined ? s : { ...s, signing_order: Math.min(step, MAX_SIGNING_ORDER) };
  });
}

/**
 * Seeds the editor's signing order from the template once per template, so
 * an envelope started from it sends with the order the template stores.
 * The user can still change it before sending.
 */
export function useSeedSigningOrderFromTemplate(
  template: TemplateSummary | undefined,
  setValue: (next: SigningOrderValue) => void,
): void {
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    if (!template || !isFeatureEnabled('signingOrder')) return;
    if (seededFor.current === template.id) return;
    seededFor.current = template.id;
    const value = signingOrderFromTemplate(template);
    if (value.sequential) setValue(value);
  }, [template, setValue]);
}

import { useEffect, useRef } from 'react';
import { useSigningSession } from '@/features/signing';
import { isReadOnly } from '../inputs/fieldDisplay';
import { isAutoField, todayIso } from './fieldOrder';

/**
 * Once the signer has started, fills their name and today's date into the
 * fields that take them. The value is recorded like any other fill, so it
 * is whatever the field holds when the signer submits (they can edit it).
 * Fields the sender made read-only are left to their own default fill, and
 * a field is tried once, so an edit is never overwritten.
 */
export function useSignerAutofill(enabled: boolean): void {
  const { fields, signer, fillField } = useSigningSession();
  const tried = useRef<Set<string>>(new Set());
  const fillRef = useRef(fillField);
  useEffect(() => {
    fillRef.current = fillField;
  });

  useEffect(() => {
    if (!enabled || !signer) return;
    for (const f of fields) {
      if (!isAutoField(f) || tried.current.has(f.id)) continue;
      if (f.value_text || isReadOnly(f)) continue;
      tried.current.add(f.id);
      const value = f.kind === 'date' ? todayIso() : signer.name;
      fillRef.current(f.id, { value_text: value }).catch(() => {
        // Not fatal: the field stays empty and shows up as the next thing to fill.
      });
    }
  }, [enabled, fields, signer]);
}

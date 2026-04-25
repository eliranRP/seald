import { useMemo } from 'react';
import type { SignMeField } from '@/features/signing';

interface UseFieldsByPageReturn {
  readonly fieldsByPage: ReadonlyMap<number, readonly SignMeField[]>;
  readonly fieldCountByPage: Readonly<Record<number, number>>;
}

/**
 * Groups signer fields by page and produces a per-page count for the
 * thumbnail rail. Single iteration each (rule 2.6 — consolidate passes).
 */
export function useFieldsByPage(fields: readonly SignMeField[]): UseFieldsByPageReturn {
  return useMemo(() => {
    const byPage = new Map<number, SignMeField[]>();
    const counts: Record<number, number> = {};
    for (const f of fields) {
      const list = byPage.get(f.page) ?? [];
      list.push(f);
      byPage.set(f.page, list);
      counts[f.page] = (counts[f.page] ?? 0) + 1;
    }
    return { fieldsByPage: byPage, fieldCountByPage: counts };
  }, [fields]);
}

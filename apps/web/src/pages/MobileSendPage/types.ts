/**
 * Local field model for the mobile-web send flow. Mirrors the desktop
 * `PlacedFieldValue` shape (apps/web/src/components/PlacedField/PlacedField.types.ts)
 * except this one is intentionally kept minimal & pixel-positioned because
 * the mobile flow renders its own canvas (rather than reusing the desktop
 * editor's geometry).
 *
 * `signerIds` is single-element after a drop, but kept as an array so the
 * type composes cleanly with the desktop's split-pill convention if we ever
 * back-port it. Today the mobile flow always splits N-signer assignments
 * into N independent single-signer fields (see `assignSigners` in the page
 * component) so the array is effectively `[string]` everywhere it renders.
 */
export type MobileFieldType = 'sig' | 'ini' | 'dat' | 'txt' | 'chk';

export interface MobileFieldDef {
  readonly k: MobileFieldType;
  readonly label: string;
  readonly icon: string;
  readonly w: number;
  readonly h: number;
}

export interface MobilePlacedField {
  readonly id: string;
  readonly type: MobileFieldType;
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly signerIds: ReadonlyArray<string>;
  readonly linkedPages: ReadonlyArray<number>;
}

export interface MobileSigner {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly color: string;
  readonly initials: string;
}

export type MobileStep = 'start' | 'file' | 'signers' | 'place' | 'review' | 'sent';

export type MobileApplyMode = 'this' | 'all' | 'allButLast' | 'last' | 'custom';

export const MOBILE_FIELD_DEFS: ReadonlyArray<MobileFieldDef> = [
  { k: 'sig', label: 'Signature', icon: 'pen-tool', w: 180, h: 50 },
  { k: 'ini', label: 'Initials', icon: 'type', w: 84, h: 40 },
  { k: 'dat', label: 'Date', icon: 'calendar', w: 96, h: 32 },
  { k: 'txt', label: 'Text', icon: 'square', w: 140, h: 32 },
  { k: 'chk', label: 'Checkbox', icon: 'check-square', w: 32, h: 32 },
];

export function getFieldDef(k: MobileFieldType): MobileFieldDef {
  const def = MOBILE_FIELD_DEFS.find((d) => d.k === k);
  if (!def) throw new Error(`Unknown field type: ${k}`);
  return def;
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) {
    const sole = parts[0];
    if (!sole) return '?';
    const ch = sole.charAt(0);
    return (ch || '?').toUpperCase();
  }
  const first = parts[0]?.charAt(0) ?? '';
  const last = parts[parts.length - 1]?.charAt(0) ?? '';
  return (first + last).toUpperCase() || '?';
}

/** Parse a comma-separated user-entered page list. Trims whitespace, dedupes,
 * drops out-of-range and non-integer entries, returns a sorted ascending list.
 * Always falls back to `[fallbackPage]` if nothing parses. */
export function parseCustomPages(
  raw: string,
  totalPages: number,
  fallbackPage: number,
): ReadonlyArray<number> {
  const set = new Set<number>();
  raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((tok) => {
      const n = Number.parseInt(tok, 10);
      if (Number.isInteger(n) && n >= 1 && n <= totalPages) set.add(n);
    });
  if (set.size === 0) return [fallbackPage];
  return Array.from(set).sort((a, b) => a - b);
}

/** Resolve an apply-mode + custom list into the `linkedPages` array. */
export function resolveApplyPages(
  mode: MobileApplyMode,
  totalPages: number,
  currentPage: number,
  customPages: ReadonlyArray<number>,
): ReadonlyArray<number> {
  switch (mode) {
    case 'this':
      return [currentPage];
    case 'all':
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    case 'allButLast':
      return Array.from({ length: Math.max(0, totalPages - 1) }, (_, i) => i + 1);
    case 'last':
      return [totalPages];
    case 'custom':
      return customPages.length > 0 ? customPages : [currentPage];
    default:
      return [currentPage];
  }
}

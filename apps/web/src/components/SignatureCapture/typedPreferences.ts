import type { SignatureCaptureKind } from './SignatureCapture.types';

const STORAGE_KEY = 'seald:signing:typed:v1';

type StoredEntry = Partial<Record<SignatureCaptureKind, string>>;
type StoredMap = Record<string, StoredEntry>;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function readMap(): StoredMap {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as StoredMap;
    }
    return {};
  } catch {
    return {};
  }
}

function writeMap(map: StoredMap): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // localStorage may be unavailable (private mode, quota, SSR) — silently noop.
  }
}

export function getTypedPreference(input: {
  readonly email: string;
  readonly kind: SignatureCaptureKind;
}): string | null {
  const key = normalizeEmail(input.email);
  if (!key) return null;
  if (typeof window === 'undefined' || !window.localStorage) return null;
  const map = readMap();
  const entry = map[key];
  const value = entry?.[input.kind];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function saveTypedPreference(input: {
  readonly email: string;
  readonly kind: SignatureCaptureKind;
  readonly value: string;
}): void {
  const key = normalizeEmail(input.email);
  if (!key) return;
  if (typeof window === 'undefined' || !window.localStorage) return;
  const trimmed = input.value.trim();
  const map = readMap();
  const existing: StoredEntry = map[key] ?? {};
  if (trimmed.length === 0) {
    delete existing[input.kind];
  } else {
    existing[input.kind] = trimmed;
  }
  if (Object.keys(existing).length === 0) {
    delete map[key];
  } else {
    map[key] = existing;
  }
  writeMap(map);
}

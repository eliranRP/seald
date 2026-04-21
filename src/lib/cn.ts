type ClassValue = string | false | null | undefined;

/** Joins class-name fragments, dropping falsy values. */
export function cn(...parts: ClassValue[]): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.length > 0).join(' ');
}

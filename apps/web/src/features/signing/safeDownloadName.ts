/**
 * Slugify an envelope title into a safe, human-readable PDF filename.
 *
 * The browser `download` attribute, left empty, falls back to whatever
 * basename the URL exposes. For Supabase pre-signed URLs that's an
 * opaque path like `<envelope-id>/sealed.pdf?token=…` — useless in a
 * downloads folder. Slugify the title so the saved file is searchable
 * by the signer later.
 *
 * Mirrors the helper in `apps/web/src/pages/VerifyPage/VerifyPage.tsx`
 * which is intentionally local to that page; the signing post-sign
 * surface needs the same behaviour, so the logic lives here for both
 * to import (rule 1.6 — use a shared helper rather than duplicating).
 */
export function safeDownloadName(title: string, suffix: string): string {
  const slug = title
    .normalize('NFKD')
    // Strip combining accents.
    .replace(/[\u0300-\u036f]/g, '')
    // Anything that isn't a safe filesystem char becomes `-`.
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  const base = slug.length > 0 ? slug : 'document';
  return `${base}${suffix}.pdf`;
}

/**
 * Inline tri-color Drive mark — duplicated from
 * `routes/settings/integrations/IntegrationsPage.tsx` so the WT-E
 * surfaces don't pull in the entire IntegrationsPage chunk just for a
 * 50-byte SVG. Both copies render identical pixel output; sync them if
 * the brand asset ever changes.
 *
 * Pass `aria-hidden` to render the mark decoratively (no `role`,
 * `aria-label`, or `<title>` — the surrounding label carries the
 * meaning). Used by the envelope download dropdown's "Save to Google
 * Drive" row, where the row's title already says "Google Drive".
 */
export interface GDriveLogoProps {
  readonly size?: number;
  readonly 'aria-hidden'?: boolean | 'true' | 'false';
}

export function GDriveLogo({ size = 32, 'aria-hidden': ariaHidden }: GDriveLogoProps) {
  const decorative = ariaHidden === true || ariaHidden === 'true';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': 'Google Drive' })}
      style={{ flexShrink: 0 }}
    >
      {decorative ? null : <title>Google Drive</title>}
      <path d="M11 4 L21 4 L31 21 L26 30 L16 13 Z" fill="#FBBC04" />
      <path d="M11 4 L1 21 L6 30 L16 13 Z" fill="#1FA463" />
      <path d="M6 30 L26 30 L31 21 L11 21 Z" fill="#4285F4" />
    </svg>
  );
}

/**
 * Inline tri-color Drive mark — duplicated from
 * `routes/settings/integrations/IntegrationsPage.tsx` so the WT-E
 * surfaces don't pull in the entire IntegrationsPage chunk just for a
 * 50-byte SVG. Both copies render identical pixel output; sync them if
 * the brand asset ever changes.
 */
export function GDriveLogo({ size = 32 }: { readonly size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="Google Drive"
      style={{ flexShrink: 0 }}
    >
      <title>Google Drive</title>
      <path d="M11 4 L21 4 L31 21 L26 30 L16 13 Z" fill="#FBBC04" />
      <path d="M11 4 L1 21 L6 30 L16 13 Z" fill="#1FA463" />
      <path d="M6 30 L26 30 L31 21 L11 21 Z" fill="#4285F4" />
    </svg>
  );
}

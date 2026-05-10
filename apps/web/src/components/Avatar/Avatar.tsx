import { forwardRef, useEffect, useState } from 'react';
import type { AvatarProps, AvatarTone } from './Avatar.types';
import { AvatarRoot, Img } from './Avatar.styles';

const TONES = [
  'indigo',
  'emerald',
  'amber',
  'danger',
  'slate',
] as const satisfies readonly AvatarTone[];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts
    .map((p) => p.charAt(0))
    .join('')
    .toUpperCase();
}

function pickTone(name: string): AvatarTone {
  // Hash the full name so contacts that share a first character (e.g.
  // "Eliran Azulay" and "Eliran NRO") still fall onto distinct tones.
  // djb2 — small, deterministic, and avalanches better than the
  // 31-multiplier sum for short related strings. `| 0` keeps the
  // running value a 32-bit int so a long name can't blow the
  // safe-integer range.
  let h = 5381;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) + h + name.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(h) % TONES.length;
  return TONES[idx] ?? 'indigo';
}

export const Avatar = forwardRef<HTMLDivElement, AvatarProps>((props, ref) => {
  const { name, size = 32, imageUrl, tone, ...rest } = props;
  const resolvedTone: AvatarTone = tone ?? pickTone(name);
  const [imgFailed, setImgFailed] = useState(false);

  // Reset the failure flag when the URL itself changes so a valid URL
  // replacing a broken one still gets a chance to load.
  useEffect(() => {
    setImgFailed(false);
  }, [imageUrl]);

  const showImage = Boolean(imageUrl) && !imgFailed;
  return (
    <AvatarRoot $size={size} $tone={resolvedTone} {...rest} ref={ref} role="img" aria-label={name}>
      {showImage ? (
        // Empty alt + aria-hidden prevents the browser from rendering alt
        // text if the URL fails to load — the surrounding AvatarRoot already
        // carries the accessible name via aria-label.
        <Img src={imageUrl} alt="" aria-hidden="true" onError={() => setImgFailed(true)} />
      ) : (
        <span aria-hidden>{initials(name)}</span>
      )}
    </AvatarRoot>
  );
});
Avatar.displayName = 'Avatar';

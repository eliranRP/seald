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
  const code = name.charCodeAt(0) || 0;
  const idx = code % TONES.length;
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

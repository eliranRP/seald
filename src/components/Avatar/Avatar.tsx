import { forwardRef } from 'react';
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
  return (
    <AvatarRoot $size={size} $tone={resolvedTone} {...rest} ref={ref} role="img" aria-label={name}>
      {imageUrl ? <Img src={imageUrl} alt={name} /> : <span aria-hidden>{initials(name)}</span>}
    </AvatarRoot>
  );
});
Avatar.displayName = 'Avatar';

import { forwardRef } from 'react';
import { X } from 'lucide-react';
import styled, { type DefaultTheme } from 'styled-components';

/**
 * Compact pill rendered for each envelope tag. Background colour is
 * derived from a djb2 hash of the tag name so the same tag always
 * renders in the same colour across the app — no per-tag colour
 * picker UI required. Same hash function as `Avatar.pickTone` so
 * "urgent" reads consistent everywhere.
 *
 * Six tints from the existing palette (indigo / amber / emerald /
 * red / sky / pink) — soft backgrounds on a neutral foreground so a
 * row of chips reads as a uniform list rather than a rainbow.
 */

const TONES = ['indigo', 'amber', 'emerald', 'danger', 'sky', 'pink'] as const;
type Tone = (typeof TONES)[number];

function pickTone(name: string): Tone {
  let h = 5381;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) + h + name.charCodeAt(i)) | 0;
  }
  return TONES[Math.abs(h) % TONES.length] ?? 'indigo';
}

function toneBg(theme: DefaultTheme, tone: Tone): string {
  switch (tone) {
    case 'indigo':
      return theme.color.indigo[50];
    case 'amber':
      return theme.color.warn[50];
    case 'emerald':
      return theme.color.success[50];
    case 'danger':
      return theme.color.danger[50];
    case 'sky':
      // Sky / pink fallbacks aren't in the existing palette — pick close
      // neighbors so the chip stays in-system without a token sprawl.
      return theme.color.indigo[50];
    case 'pink':
      return theme.color.danger[50];
  }
}

function toneFg(theme: DefaultTheme, tone: Tone): string {
  switch (tone) {
    case 'indigo':
      return theme.color.indigo[700];
    case 'amber':
      return theme.color.warn[700];
    case 'emerald':
      return theme.color.success[700];
    case 'danger':
      return theme.color.danger[700];
    case 'sky':
      return theme.color.indigo[700];
    case 'pink':
      return theme.color.danger[700];
  }
}

const Pill = styled.span<{ $tone: Tone }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: ${({ theme }) => theme.radius.pill};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: 11px;
  font-weight: ${({ theme }) => theme.font.weight.medium};
  line-height: 1.4;
  background: ${({ theme, $tone }) => toneBg(theme, $tone)};
  color: ${({ theme, $tone }) => toneFg(theme, $tone)};
  white-space: nowrap;
`;

const RemoveButton = styled.button`
  all: unset;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: ${({ theme }) => theme.radius.pill};
  cursor: pointer;
  &:hover {
    background: rgba(0, 0, 0, 0.08);
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export interface TagChipProps {
  readonly label: string;
  /** Optional remove handler — when set, renders a × button on the right. */
  readonly onRemove?: () => void;
}

export const TagChip = forwardRef<HTMLSpanElement, TagChipProps>((props, ref) => {
  const { label, onRemove } = props;
  const tone = pickTone(label);
  return (
    <Pill ref={ref} $tone={tone}>
      {label}
      {onRemove ? (
        <RemoveButton type="button" onClick={onRemove} aria-label={`Remove tag ${label}`}>
          <X size={10} aria-hidden />
        </RemoveButton>
      ) : null}
    </Pill>
  );
});
TagChip.displayName = 'TagChip';

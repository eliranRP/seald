import styled from 'styled-components';
import { hoverLift, rise } from '@/styles/motion';

const MOBILE = '@media (max-width: 640px)';

/** Positioning box: the card button plus the ⋯ sibling (never nested). */
export const Wrap = styled.div`
  position: relative;
  min-width: 0;
  ${rise}
`;

export const CardButton = styled.button<{ $compact: boolean }>`
  display: flex;
  flex-direction: ${({ $compact }) => ($compact ? 'row' : 'column')};
  align-items: ${({ $compact }) => ($compact ? 'center' : 'stretch')};
  gap: ${({ theme, $compact }) => ($compact ? theme.space[3] : theme.space[2])};
  width: 100%;
  min-height: ${({ $compact }) => ($compact ? '84px' : '0')};
  padding: ${({ theme, $compact }) =>
    $compact ? `${theme.space[3]} 60px ${theme.space[3]} ${theme.space[3]}` : theme.space[3]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  /* Tile: board .tpl-card (16px). Phone row: board .m-card (12px). */
  border-radius: ${({ theme, $compact }) => ($compact ? theme.radius.md : theme.radius.lg)};
  background: ${({ theme }) => theme.color.paper};
  font: inherit;
  color: ${({ theme }) => theme.color.fg[1]};
  text-align: left;
  cursor: pointer;
  ${hoverLift}

  &:focus-visible {
    outline: 0;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

/** Page thumbnail: grey text lines and one dashed field (canvas `.tpl-thumb`). */
export const Thumb = styled.span<{ $compact: boolean }>`
  display: flex;
  flex-direction: column;
  flex: none;
  gap: ${({ $compact }) => ($compact ? '4px' : '6px')};
  ${({ $compact }) => ($compact ? 'width: 48px; height: 60px;' : 'aspect-ratio: 4 / 3;')}
  padding: ${({ $compact }) => ($compact ? '8px' : '14px')};
  border: 1px solid ${({ theme }) => theme.color.ink[150]};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.ink[50]};

  i {
    display: block;
    height: 2px;
    border-radius: 1px;
    background: ${({ theme }) => theme.color.ink[200]};
  }
  i:nth-of-type(3) {
    width: 60%;
  }
  b {
    display: block;
    width: 40%;
    height: ${({ $compact }) => ($compact ? '8px' : '14px')};
    border: 1px dashed ${({ theme }) => theme.color.indigo[300]};
    border-radius: ${({ theme }) => theme.radius.xxs};
  }
`;

export const Text = styled.span<{ $compact: boolean }>`
  display: flex;
  flex-direction: column;
  gap: ${({ theme, $compact }) => ($compact ? '6px' : theme.space[2])};
  min-width: 0;
  flex: 1;
`;

/** Tile name is board .doc-title (14px); the phone row uses .h3 (16px). */
export const Name = styled.span<{ $compact: boolean }>`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: ${({ theme, $compact }) => ($compact ? theme.font.size.body : theme.font.size.bodySm)};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Meta = styled.span`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  font-size: ${({ theme }) => theme.font.size.xs};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const Dots = styled.span`
  display: inline-flex;
  gap: ${({ theme }) => theme.space[2]};
`;

/** Role colour dot (board .sig-dot, 8px). */
export const Dot = styled.span<{ $color: string }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ $color }) => $color};
`;

/** The ⋯ trigger, pinned to the card's top-right. */
export const More = styled.div<{ $compact: boolean }>`
  position: absolute;
  top: ${({ theme }) => theme.space[3]};
  right: ${({ theme }) => theme.space[3]};
  ${({ $compact }) => ($compact ? 'top: 50%; translate: 0 -50%; right: 4px;' : '')}
  ${MOBILE} {
    right: 4px;
  }
`;

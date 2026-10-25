import styled, { css } from 'styled-components';
import { fadeIn, rise } from '@/styles/motion';

/** Full-screen scanner. Sits above the app shell and its bottom nav. */
export const Root = styled.div`
  position: fixed;
  inset: 0;
  z-index: ${({ theme }) => theme.z.overlay};
  display: flex;
  flex-direction: column;
  background: ${({ theme }) => theme.color.ink[900]};
  color: ${({ theme }) => theme.color.paper};
  font-family: ${({ theme }) => theme.font.sans};
`;

export const CamView = styled.div`
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: ${({ theme }) => theme.color.ink[900]};
`;

export const Video = styled.video`
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

export const Flash = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: ${({ theme }) => theme.color.paper};
  opacity: 0.3;
  ${fadeIn}
`;

export const TopBar = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
  padding: 0 ${({ theme }) => theme.space[3]};
`;

export const IconButton = styled.button<{ $light?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: ${({ theme }) => theme.radius.pill};
  cursor: pointer;
  background: ${({ theme, $light }) => ($light ? theme.color.bg.subtle : 'transparent')};
  color: inherit;
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.border.focus};
    outline-offset: 2px;
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

/** `.cam-pill`, 28px above the camera bar. */
export const Hint = styled.div`
  position: absolute;
  left: 50%;
  bottom: 28px;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 ${({ theme }) => theme.space[3]};
  border-radius: ${({ theme }) => theme.radius.pill};
  background: rgba(255, 255, 255, 0.14);
  color: ${({ theme }) => theme.color.paper};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  white-space: nowrap;
`;

export const CamBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[4]};
  height: 120px;
  padding: 0 28px;
  padding-bottom: env(safe-area-inset-bottom);
  background: ${({ theme }) => theme.color.ink[900]};
`;

export const Shutter = styled.button`
  width: 72px;
  height: 72px;
  padding: 0;
  border: 4px solid ${({ theme }) => theme.color.paper};
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  cursor: pointer;
  &::after {
    content: '';
    display: block;
    width: 56px;
    height: 56px;
    margin: 4px;
    border-radius: 50%;
    background: ${({ theme }) => theme.color.paper};
  }
  &:active:not(:disabled)::after {
    transform: scale(0.92);
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.border.focus};
    outline-offset: 4px;
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

export const BarSlot = styled.div`
  width: 44px;
  display: flex;
  justify-content: center;
`;

export const CamThumb = styled.button`
  position: relative;
  width: 44px;
  height: 56px;
  padding: 0;
  border: 2px solid ${({ theme }) => theme.color.paper};
  border-radius: ${({ theme }) => theme.radius.xs};
  background: ${({ theme }) => theme.color.ink[50]};
  cursor: pointer;
  overflow: visible;
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.border.focus};
    outline-offset: 2px;
  }
`;

export const CountBadge = styled.span`
  position: absolute;
  top: -8px;
  right: -8px;
  min-width: 20px;
  height: 20px;
  padding: 0 4px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.accent.base};
  color: ${({ theme }) => theme.color.accent.ink};
  font-size: ${({ theme }) => theme.font.size.micro};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  display: inline-flex;
  align-items: center;
  justify-content: center;
`;

/** Review, building and blocked screens: light surface, not the dark camera. */
export const Sheet = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: ${({ theme }) => theme.color.bg.surface};
  color: ${({ theme }) => theme.color.fg[1]};
  ${fadeIn}
`;

/** `.m-top`: 56px phone header, 16px left / 8px right. */
export const SheetTop = styled.div`
  flex: none;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[1]};
  height: 56px;
  padding: 0 ${({ theme }) => theme.space[2]} 0 ${({ theme }) => theme.space[4]};
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
`;

/** `.h3` header title. */
export const SheetTitle = styled.h1`
  margin: 0;
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.body};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
`;

/** 44px tap height for the header's text button (Retake). */
export const TopAction = styled.span`
  display: inline-flex;
  margin-left: auto;
  & > button {
    min-height: 44px;
  }
`;

export const SheetBody = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: ${({ theme }) => theme.space[4]};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]};
`;

/** Tile number under the page (`.thumb-num`). */
const TILE_NUM_SPACE = '18px';

export const Grid = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: ${({ theme }) => theme.space[3]};
  row-gap: calc(${({ theme }) => theme.space[3]} + ${TILE_NUM_SPACE});
  @media (min-width: 641px) {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
`;

/** `.thumb`: letter-size page, 4px corners, number underneath. */
export const Tile = styled.li`
  position: relative;
  aspect-ratio: 8.5 / 11;
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.xxs};
  background: ${({ theme }) => theme.color.paper};
  ${rise}
`;

export const TileImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  border-radius: inherit;
`;

export const TileNumber = styled.span`
  position: absolute;
  left: 50%;
  bottom: -${TILE_NUM_SPACE};
  transform: translateX(-50%);
  font-size: ${({ theme }) => theme.font.size.micro};
  line-height: 1.5;
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const TileActions = styled.div`
  position: absolute;
  top: ${({ theme }) => theme.space[1]};
  right: ${({ theme }) => theme.space[1]};
  display: flex;
  gap: ${({ theme }) => theme.space[1]};
`;

export const TileButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.paper};
  color: ${({ theme }) => theme.color.fg[1]};
  cursor: pointer;
  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.border.focus};
    outline-offset: 2px;
  }
`;

export const AddTile = styled.li`
  aspect-ratio: 8.5 / 11;
  > button {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 1.5px dashed ${({ theme }) => theme.color.border[2]};
    border-radius: ${({ theme }) => theme.radius.xxs};
    background: transparent;
    color: ${({ theme }) => theme.color.fg[2]};
    font: inherit;
    font-size: ${({ theme }) => theme.font.size.caption};
    font-weight: ${({ theme }) => theme.font.weight.semibold};
    cursor: pointer;
    &:hover:not(:disabled) {
      background: ${({ theme }) => theme.color.bg.subtle};
    }
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    &:focus-visible {
      outline: 2px solid ${({ theme }) => theme.color.border.focus};
      outline-offset: 2px;
    }
  }
`;

export const SheetFoot = styled.div`
  padding: ${({ theme }) => theme.space[3]} ${({ theme }) => theme.space[4]};
  padding-bottom: calc(${({ theme }) => theme.space[6]} + env(safe-area-inset-bottom));
  border-top: 1px solid ${({ theme }) => theme.color.border[1]};
  background: ${({ theme }) => theme.color.bg.surface};
`;

export const Meta = styled.p<{ $error?: boolean }>`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme, $error }) => ($error ? theme.color.danger[700] : theme.color.fg[3])};
`;

export const Center = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.space[4]};
  padding: ${({ theme }) => theme.space[6]};
  text-align: center;
  ${({ theme }) => css`
    h2 {
      margin: 0;
      font-family: ${theme.font.serif};
      font-size: ${theme.font.size.x2l};
      font-weight: ${theme.font.weight.medium};
      line-height: ${theme.font.lineHeight.snug};
    }
  `}
`;

/** "Making your PDF…": 20px rhythm, full-width progress (Scan-M-making). */
export const MakingCenter = styled(Center)`
  gap: 20px;
`;

/** Primary action on the blocked screen: full width up to 320px, 48px tall. */
export const BlockAction = styled.span`
  display: flex;
  width: 100%;
  max-width: 320px;
  & > button {
    width: 100%;
    min-height: 48px;
  }
`;

export const StateIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.warn[50]};
  color: ${({ theme }) => theme.color.warn[700]};
`;

export const ProgressWrap = styled.div`
  width: 100%;
`;

export const HiddenInput = styled.input`
  display: none;
`;

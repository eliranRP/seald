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
  padding: ${({ theme }) => theme.space[4]};
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

export const Hint = styled.div`
  position: absolute;
  left: 50%;
  bottom: ${({ theme }) => theme.space[4]};
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  height: 32px;
  padding: 0 ${({ theme }) => theme.space[3]};
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.ink[700]};
  color: ${({ theme }) => theme.color.paper};
  font-size: ${({ theme }) => theme.font.size.xs};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  white-space: nowrap;
`;

export const CamBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[4]};
  height: 120px;
  padding: 0 ${({ theme }) => theme.space[6]};
  padding-bottom: env(safe-area-inset-bottom);
  background: ${({ theme }) => theme.color.ink[900]};
`;

export const Shutter = styled.button`
  width: 72px;
  height: 72px;
  padding: 0;
  border: 4px solid ${({ theme }) => theme.color.paper};
  border-radius: 50%;
  background: ${({ theme }) => theme.color.ink[700]};
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
  width: 56px;
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
  padding: 0 6px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.accent.base};
  color: ${({ theme }) => theme.color.accent.ink};
  font-size: ${({ theme }) => theme.font.size.badge};
  font-weight: ${({ theme }) => theme.font.weight.bold};
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

export const SheetTop = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.space[3]} ${({ theme }) => theme.space[4]};
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
`;

export const SheetTitle = styled.h1`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.x2l};
  font-weight: ${({ theme }) => theme.font.weight.medium};
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

export const Grid = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: ${({ theme }) => theme.space[3]};
  @media (min-width: 641px) {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
`;

export const Tile = styled.li`
  position: relative;
  aspect-ratio: 3 / 4;
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.bg.sunken};
  overflow: hidden;
  ${rise}
`;

export const TileImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
`;

export const TileNumber = styled.span`
  position: absolute;
  left: ${({ theme }) => theme.space[2]};
  bottom: ${({ theme }) => theme.space[2]};
  min-width: 24px;
  height: 24px;
  padding: 0 ${({ theme }) => theme.space[2]};
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.ink[900]};
  color: ${({ theme }) => theme.color.paper};
  font-size: ${({ theme }) => theme.font.size.xs};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  display: inline-flex;
  align-items: center;
  justify-content: center;
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
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.paper};
  color: ${({ theme }) => theme.color.fg[1]};
  box-shadow: ${({ theme }) => theme.shadow.sm};
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
  aspect-ratio: 3 / 4;
  > button {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: ${({ theme }) => theme.space[2]};
    border: 1.5px dashed ${({ theme }) => theme.color.border[2]};
    border-radius: ${({ theme }) => theme.radius.sm};
    background: transparent;
    color: ${({ theme }) => theme.color.fg[3]};
    font: inherit;
    font-size: ${({ theme }) => theme.font.size.bodySm};
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
  padding: ${({ theme }) => theme.space[4]};
  padding-bottom: calc(${({ theme }) => theme.space[4]} + env(safe-area-inset-bottom));
  border-top: 1px solid ${({ theme }) => theme.color.border[1]};
  background: ${({ theme }) => theme.color.bg.surface};
`;

export const Meta = styled.p<{ $error?: boolean }>`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme, $error }) => ($error ? theme.color.danger[700] : theme.color.fg[3])};
`;

export const Center = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.space[3]};
  padding: ${({ theme }) => theme.space[6]};
  text-align: center;
  ${({ theme }) => css`
    h2 {
      margin: 0;
      font-family: ${theme.font.serif};
      font-size: ${theme.font.size.x2l};
      font-weight: ${theme.font.weight.medium};
    }
  `}
`;

export const StateIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.warn[50]};
  color: ${({ theme }) => theme.color.warn[700]};
`;

export const ProgressWrap = styled.div`
  width: min(260px, 100%);
`;

export const HiddenInput = styled.input`
  display: none;
`;

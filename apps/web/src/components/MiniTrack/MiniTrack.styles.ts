import styled, { css } from 'styled-components';
import { ring, spring } from '@/styles/motion';
import { visuallyHidden } from '@/styles/mixins';
import type { MiniTrackState } from './MiniTrack.types';

export const TrackRoot = styled.ol`
  display: inline-flex;
  align-items: center;
  margin: 0;
  padding: 0;
  list-style: none;
`;

export const StepItem = styled.li`
  display: inline-flex;
  align-items: center;
`;

export const Dot = styled.span<{ $state: MiniTrackState }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid ${({ theme }) => theme.color.border[2]};
  background: ${({ theme }) => theme.color.paper};
  color: ${({ theme }) => theme.color.fgOnAccent};
  ${({ $state, theme }) => {
    if ($state === 'done')
      return css`
        background: ${theme.color.success[500]};
        border-color: ${theme.color.success[500]};
        ${spring}
        animation-duration: 320ms;
      `;
    if ($state === 'now')
      return css`
        border-color: ${theme.color.indigo[600]};
        box-shadow: 0 0 0 3px ${theme.color.indigo[50]};
        ${ring}
      `;
    if ($state === 'bad')
      return css`
        background: ${theme.color.danger[500]};
        border-color: ${theme.color.danger[500]};
      `;
    if ($state === 'off')
      return css`
        border-style: dashed;
      `;
    return '';
  }}
`;

export const Line = styled.span<{ $done: boolean }>`
  width: 18px;
  height: 2px;
  flex: none;
  background: ${({ theme, $done }) => ($done ? theme.color.success[500] : theme.color.border[1])};
`;

export const StepLabel = styled.span`
  ${visuallyHidden}
`;

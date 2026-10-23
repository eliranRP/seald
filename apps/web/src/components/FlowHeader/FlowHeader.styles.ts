import styled, { css } from 'styled-components';
import { visuallyHidden } from '@/styles/mixins';
import type { FlowStepState } from './FlowHeader.types';

const MOBILE = '@media (max-width: 640px)';

export const Root = styled.header`
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  min-height: 64px;
  padding: 0 ${({ theme }) => theme.space[6]};
  background: ${({ theme }) => theme.color.paper};
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
  flex-shrink: 0;

  ${MOBILE} {
    grid-template-columns: 1fr auto;
    grid-template-areas:
      'left right'
      'steps steps';
    min-height: 56px;
    padding: ${({ theme }) => `${theme.space[2]} ${theme.space[4]} 0`};
  }
`;

export const Left = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  min-width: 0;
  ${MOBILE} {
    grid-area: left;
  }
`;

export const TitleBlock = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

export const Title = styled.span`
  font-size: ${({ theme }) => theme.font.size.lg};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  ${MOBILE} {
    font-size: ${({ theme }) => theme.font.size.body};
  }
`;

export const Meta = styled.span`
  font-size: ${({ theme }) => theme.font.size.xs};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const Right = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  justify-self: end;
  ${MOBILE} {
    grid-area: right;
  }
`;

export const StepList = styled.ol`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  margin: 0;
  padding: 0;
  list-style: none;

  ${MOBILE} {
    grid-area: steps;
    gap: ${({ theme }) => theme.space[1]};
    padding: ${({ theme }) => `${theme.space[2]} 0 ${theme.space[3]}`};
  }
`;

export const StepItem = styled.li<{ $state: FlowStepState }>`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme, $state }) =>
    $state === 'active' ? theme.font.weight.semibold : theme.font.weight.medium};
  color: ${({ theme, $state }) => ($state === 'todo' ? theme.color.fg[3] : theme.color.fg[1])};

  ${MOBILE} {
    flex: 1;
    height: 4px;
    border-radius: ${({ theme }) => theme.radius.pill};
    background: ${({ theme, $state }) =>
      $state === 'todo' ? theme.color.ink[200] : theme.color.indigo[600]};
  }
`;

export const StepNum = styled.span<{ $state: FlowStepState }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: ${({ theme }) => theme.font.size.xs};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  border: 1.5px solid ${({ theme }) => theme.color.border[2]};
  ${({ theme, $state }) =>
    $state === 'active' &&
    css`
      background: ${theme.color.indigo[600]};
      border-color: ${theme.color.indigo[600]};
      color: ${theme.color.fgOnAccent};
    `}
  ${({ theme, $state }) =>
    $state === 'done' &&
    css`
      background: ${theme.color.success[500]};
      border-color: ${theme.color.success[500]};
      color: ${theme.color.fgOnAccent};
    `}
  ${MOBILE} {
    display: none;
  }
`;

export const StepLabel = styled.span`
  ${MOBILE} {
    ${visuallyHidden}
  }
`;

export const StepSep = styled.span`
  width: 32px;
  height: 1.5px;
  background: ${({ theme }) => theme.color.border[2]};
  ${MOBILE} {
    display: none;
  }
`;

import styled from 'styled-components';
import type { RunStatus } from './RunList.types';

export const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
`;

export const Item = styled.li`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]};
  padding: ${({ theme }) => theme.space[3]} 0;
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
  font-family: ${({ theme }) => theme.font.sans};
`;

export const Top = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[2]};
`;

export const Title = styled.span`
  font-size: ${({ theme }) => theme.font.size.body};
  color: ${({ theme }) => theme.color.fg[1]};
  min-width: 0;
  overflow-wrap: anywhere;
`;

const STATUS_COLOR = {
  queued: 'fg',
  running: 'fg',
  retrying: 'warn',
  succeeded: 'success',
  failed: 'danger',
} as const satisfies Record<RunStatus, 'fg' | 'warn' | 'success' | 'danger'>;

export const Status = styled.span<{ $status: RunStatus }>`
  flex-shrink: 0;
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme, $status }) => {
    const key = STATUS_COLOR[$status];
    return key === 'fg' ? theme.color.fg[3] : theme.color[key][700];
  }};
`;

export const Meta = styled.span`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const Reason = styled.span`
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[2]};
`;

export const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[2]};
  margin-top: ${({ theme }) => theme.space[2]};
`;

export const Empty = styled.p`
  margin: 0;
  padding: ${({ theme }) => theme.space[4]} 0;
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[3]};
`;

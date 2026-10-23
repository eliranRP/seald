import styled from 'styled-components';

/** Sent, the signer who is up, you: avatars joined by a line (canvas `.steps`). */
export const Steps = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: ${({ theme }) => theme.space[2]};
  margin: ${({ theme }) => theme.space[2]} 0;
`;

export const Step = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  min-width: 72px;
`;

export const Line = styled.span`
  width: 32px;
  height: 1px;
  margin-top: 20px;
  background: ${({ theme }) => theme.color.border[2]};
`;

export const Label = styled.span<{ readonly $strong?: boolean }>`
  font-size: ${({ theme }) => theme.font.size.xs};
  font-weight: ${({ theme, $strong }) =>
    $strong ? theme.font.weight.semibold : theme.font.weight.regular};
  color: ${({ theme, $strong }) => ($strong ? theme.color.fg[1] : theme.color.fg[3])};
  text-align: center;
`;

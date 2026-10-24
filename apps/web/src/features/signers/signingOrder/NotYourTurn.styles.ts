import styled from 'styled-components';

/** Sent, the signer who is up, you: avatars joined by a line (canvas `.steps`). */
export const Steps = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.space[3]};
  margin: ${({ theme }) => theme.space[2]} 0;
`;

/** Canvas `.step`: avatar over a 13px label. */
export const Step = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
`;

/** Canvas `.step-line`: 40 x 2. */
export const Line = styled.span`
  flex: none;
  width: 40px;
  height: 2px;
  background: ${({ theme }) => theme.color.ink[200]};
`;

export const Label = styled.span<{ readonly $strong?: boolean }>`
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme, $strong }) =>
    $strong ? theme.font.weight.semibold : theme.font.weight.medium};
  color: ${({ theme, $strong }) => ($strong ? theme.color.fg[1] : theme.color.fg[2])};
  text-align: center;
  white-space: nowrap;
`;

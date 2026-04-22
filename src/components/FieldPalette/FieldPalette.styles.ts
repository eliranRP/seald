import styled from 'styled-components';

export const Root = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
  font-family: ${({ theme }) => theme.font.sans};
  color: ${({ theme }) => theme.color.fg[2]};
`;

export const SectionHeader = styled.h3`
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.fg[3]};
  margin: 0;
  padding: ${({ theme }) => theme.space[2]} ${({ theme }) => theme.space[1]};
`;

export const SectionHeaderTop = styled(SectionHeader)`
  padding-top: ${({ theme }) => theme.space[2]};
`;

export const SectionHeaderNext = styled(SectionHeader)`
  padding-top: ${({ theme }) => theme.space[3]};
`;

export const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.color.fg[2]};
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  cursor: grab;
  user-select: none;
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
  &:active {
    cursor: grabbing;
  }
`;

export const RowLabel = styled.span`
  flex: 1;
`;

export const HintCard = styled.div`
  margin-top: ${({ theme }) => theme.space[4]};
  padding: ${({ theme }) => theme.space[3]};
  background: ${({ theme }) => theme.color.indigo[50]};
  border-radius: 10px;
  font-size: 12px;
  color: ${({ theme }) => theme.color.indigo[800]};
  line-height: 1.5;
`;

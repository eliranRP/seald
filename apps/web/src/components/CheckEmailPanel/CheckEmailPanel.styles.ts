import styled from 'styled-components';

export const StateIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: ${({ theme }) => theme.radius.lg};
  background: ${({ theme }) => theme.color.indigo[50]};
  color: ${({ theme }) => theme.color.indigo[700]};
`;

export const Strong = styled.b`
  color: ${({ theme }) => theme.color.fg[1]};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  overflow-wrap: anywhere;
`;

export const MailRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  width: 100%;

  & > a {
    flex: 1 1 160px;
  }
`;

export const ResendRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 4px;
`;

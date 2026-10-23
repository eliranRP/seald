import styled from 'styled-components';

export const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]};
`;

export const Warning = styled.p<{ readonly $danger?: boolean }>`
  margin: 0;
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[4]}`};
  border: 1px solid
    ${({ theme, $danger }) => ($danger ? theme.color.danger[500] : theme.color.warn[500])};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme, $danger }) => ($danger ? theme.color.danger[50] : theme.color.warn[50])};
  color: ${({ theme, $danger }) => ($danger ? theme.color.danger[700] : theme.color.warn[700])};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
`;

export const Row = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]};

  @media (min-width: 641px) {
    flex-direction: row;
    flex-wrap: wrap;
  }
`;

export const Fine = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const ConsentCard = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]};
  padding: ${({ theme }) => theme.space[5]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  background: ${({ theme }) => theme.color.paper};
`;

export const ConsentTitle = styled.h2`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.body};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
`;

export const InlineLink = styled.a`
  color: ${({ theme }) => theme.color.accent.base};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.indigo[500]};
    outline-offset: 2px;
    border-radius: ${({ theme }) => theme.radius.xs};
  }
`;

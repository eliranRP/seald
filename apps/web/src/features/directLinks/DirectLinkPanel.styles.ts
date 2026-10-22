import styled from 'styled-components';

export const Root = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]};
  min-width: 0;
`;

export const Heading = styled.h3`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.body};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Intro = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const Notice = styled.p<{ $tone?: 'error' | 'info' }>`
  margin: 0;
  padding: ${({ theme }) => theme.space[3]};
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  background: ${({ theme }) => theme.color.bg.sunken};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme, $tone }) => ($tone === 'error' ? theme.color.danger[700] : theme.color.fg[2])};
`;

export const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]};
`;

export const Label = styled.label`
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Select = styled.select`
  min-height: 44px;
  padding: 0 ${({ theme }) => theme.space[3]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.bg.surface};
  font: inherit;
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const NumberInput = styled.input`
  min-height: 44px;
  padding: 0 ${({ theme }) => theme.space[3]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.bg.surface};
  font: inherit;
  color: ${({ theme }) => theme.color.fg[1]};
  max-width: 160px;
`;

export const Hint = styled.span`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const Summary = styled.dl`
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: ${({ theme }) => theme.space[1]} ${({ theme }) => theme.space[4]};
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.bodySm};

  dt {
    color: ${({ theme }) => theme.color.fg[3]};
  }
  dd {
    margin: 0;
    color: ${({ theme }) => theme.color.fg[1]};
    min-width: 0;
    overflow-wrap: anywhere;
  }
`;

export const Mono = styled.code`
  font-family: ${({ theme }) => theme.font.mono};
`;

export const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
`;

export const Confirm = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]};
  padding: ${({ theme }) => theme.space[3]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
`;

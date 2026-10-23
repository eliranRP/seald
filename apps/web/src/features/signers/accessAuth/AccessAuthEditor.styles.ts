import styled from 'styled-components';

export const Root = styled.section`
  display: grid;
  gap: ${({ theme }) => theme.space[2]};
  font-family: ${({ theme }) => theme.font.sans};
`;

export const Overrides = styled.details`
  display: grid;
  gap: ${({ theme }) => theme.space[2]};
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[2]};

  & > summary {
    min-height: ${({ theme }) => theme.space[10]};
    display: flex;
    align-items: center;
    cursor: pointer;
    font-weight: ${({ theme }) => theme.font.weight.semibold};
    color: ${({ theme }) => theme.color.fg[1]};
  }
`;

export const SignerBlock = styled.fieldset`
  display: grid;
  gap: ${({ theme }) => theme.space[2]};
  margin: 0;
  padding: ${({ theme }) => theme.space[2]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.sm};
  min-width: 0;
`;

export const SignerLegend = styled.legend`
  padding: 0 ${({ theme }) => theme.space[1]};
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Choice = styled.div`
  display: grid;
  gap: ${({ theme }) => theme.space[1]};
`;

export const ChoiceLabel = styled.label`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[2]};
`;

export const Select = styled.select`
  min-height: calc(${({ theme }) => theme.space[10]} + ${({ theme }) => theme.space[1]});
  padding: 0 ${({ theme }) => theme.space[2]};
  font: inherit;
`;

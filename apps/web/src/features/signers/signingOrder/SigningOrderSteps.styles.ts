import styled from 'styled-components';

export const StepsRoot = styled.section`
  display: grid;
  gap: ${({ theme }) => theme.space[2]};
  margin-top: ${({ theme }) => theme.space[3]};
  font-family: ${({ theme }) => theme.font.sans};
`;

export const Heading = styled.h3`
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const StepList = styled.ol`
  display: grid;
  gap: ${({ theme }) => theme.space[2]};
  margin: 0;
  padding: 0;
  list-style: none;
`;

export const StepBox = styled.li`
  display: grid;
  gap: ${({ theme }) => theme.space[1]};
  padding: ${({ theme }) => theme.space[2]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.sm};
`;

export const StepHeading = styled.span`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 11px;
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const StepSignerList = styled.ul`
  display: grid;
  gap: ${({ theme }) => theme.space[1]};
  margin: 0;
  padding: 0;
  list-style: none;
`;

export const StepSigner = styled.li`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[2]};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[1]};
`;

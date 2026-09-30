import styled from 'styled-components';

export const Root = styled.div`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.space[2]};
  min-height: 44px;
  margin: 0;
  cursor: pointer;
  font-family: ${({ theme }) => theme.font.sans};
`;

export const Input = styled.input`
  appearance: none;
  width: 36px;
  height: 22px;
  margin: 0;
  flex-shrink: 0;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.ink[300]};
  position: relative;
  cursor: pointer;

  &::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    border-radius: ${({ theme }) => theme.radius.pill};
    background: ${({ theme }) => theme.color.paper};
  }

  &:checked {
    background: ${({ theme }) => theme.color.accent.base};
  }

  &:checked::after {
    transform: translateX(14px);
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.border.focus};
    outline-offset: 2px;
  }

  &:disabled {
    cursor: not-allowed;
  }
`;

export const CopyCol = styled.span`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]};
  padding-top: ${({ theme }) => theme.space[1]};
`;

export const Text = styled.label`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  color: ${({ theme }) => theme.color.fg[1]};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  line-height: ${({ theme }) => theme.font.lineHeight.snug};
`;

export const Copy = styled.span`
  color: ${({ theme }) => theme.color.fg[3]};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.regular};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
`;

import styled from 'styled-components';

export const Root = styled.div`
  position: relative;
  display: inline-flex;
`;

export const Trigger = styled.button`
  appearance: none;
  background: transparent;
  border: none;
  padding: 0;
  border-radius: ${({ theme }) => theme.radius.pill};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const Name = styled.div`
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Email = styled.div`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
  margin-top: 2px;
  font-weight: ${({ theme }) => theme.font.weight.regular};
`;

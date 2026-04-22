import styled from 'styled-components';

export const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: ${({ theme }) => theme.z.modal};
  background: rgba(15, 23, 42, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.space[5]};
`;

export const Card = styled.div`
  width: 460px;
  max-width: 100%;
  background: ${({ theme }) => theme.color.bg.surface};
  border-radius: ${({ theme }) => theme.radius.xl};
  box-shadow: ${({ theme }) => theme.shadow.xl};
  padding: ${({ theme }) => `${theme.space[8]} ${theme.space[6]} ${theme.space[5]}`};
`;

export const Title = styled.h2`
  margin: 0 0 ${({ theme }) => theme.space[5]};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.h4};
  font-weight: ${({ theme }) => theme.font.weight.bold};
  color: ${({ theme }) => theme.color.fg[1]};
  text-align: center;
`;

export const OptionList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]};
  margin-bottom: ${({ theme }) => theme.space[5]};
`;

/**
 * A labeled radio row — click the whole row to select. The native input is
 * kept so keyboard + screen-reader semantics are preserved, but the visual
 * dot is drawn by the surrounding label styles.
 */
export const OptionLabel = styled.label`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  padding: ${({ theme }) => `${theme.space[2]} 0`};
  cursor: pointer;
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.body};
  color: ${({ theme }) => theme.color.fg[1]};
  font-weight: ${({ theme }) => theme.font.weight.medium};
`;

export const Radio = styled.input.attrs({ type: 'radio' })`
  appearance: none;
  width: 20px;
  height: 20px;
  border-radius: ${({ theme }) => theme.radius.pill};
  border: 2px solid ${({ theme }) => theme.color.ink[300]};
  background: ${({ theme }) => theme.color.bg.surface};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition:
    border-color 120ms ease,
    background 120ms ease;

  &:checked {
    border-color: ${({ theme }) => theme.color.success[500]};
  }

  &:checked::after {
    content: '';
    width: 10px;
    height: 10px;
    border-radius: ${({ theme }) => theme.radius.pill};
    background: ${({ theme }) => theme.color.success[500]};
  }

  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const Footer = styled.div`
  border-top: 1px solid ${({ theme }) => theme.color.border[1]};
  margin: ${({ theme }) => `${theme.space[4]} -${theme.space[6]} 0`};
  padding: ${({ theme }) => `${theme.space[4]} ${theme.space[6]} 0`};
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: ${({ theme }) => theme.space[4]};
`;

export const CancelButton = styled.button`
  background: transparent;
  border: none;
  color: ${({ theme }) => theme.color.danger[500]};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
  padding: ${({ theme }) => `${theme.space[2]} ${theme.space[1]}`};

  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
    border-radius: ${({ theme }) => theme.radius.sm};
  }
`;

export const RemoveButton = styled.button`
  background: ${({ theme }) => theme.color.danger[500]};
  border: none;
  color: ${({ theme }) => theme.color.fg.inverse};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  cursor: pointer;
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[5]}`};
  border-radius: ${({ theme }) => theme.radius.md};
  transition: filter 120ms ease;

  &:hover {
    filter: brightness(1.06);
  }

  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

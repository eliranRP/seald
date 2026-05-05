import styled, { css } from 'styled-components';

export const FieldRoot = styled.div<{
  $width: number;
  $height: number;
  $selected: boolean;
  $filled: boolean;
  $hasSignatureLine?: boolean;
}>`
  width: ${({ $width }) => `${$width}px`};
  height: ${({ $height }) => `${$height}px`};
  display: inline-flex;
  ${({ $hasSignatureLine }) =>
    $hasSignatureLine
      ? css`
          flex-direction: column;
          align-items: flex-start;
          justify-content: center;
          gap: 4px;
        `
      : css`
          align-items: center;
          gap: ${({ theme }) => theme.space[2]};
        `}
  padding: 0 ${({ theme }) => theme.space[3]};
  border: 1.5px dashed ${({ theme }) => theme.color.indigo[400]};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.indigo[50]};
  color: ${({ theme }) => theme.color.indigo[800]};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.caption};
  cursor: pointer;
  user-select: none;
  ${({ theme, $selected }) =>
    $selected &&
    css`
      box-shadow: ${theme.shadow.focus};
      border-style: solid;
    `}
  ${({ theme, $filled }) =>
    $filled &&
    css`
      background: ${theme.color.success[50]};
      border-color: ${theme.color.success[500]};
      color: ${theme.color.success[700]};
    `}
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }

  /* Icon + label row when in signature-line layout */
  ${({ $hasSignatureLine }) =>
    $hasSignatureLine &&
    css`
      > span {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
    `}
`;

/** Horizontal line showing where the signature will be placed. */
export const SignatureLine = styled.div`
  width: 80%;
  height: 0;
  border-bottom: 1.5px solid ${({ theme }) => theme.color.indigo[300]};
  align-self: center;
`;

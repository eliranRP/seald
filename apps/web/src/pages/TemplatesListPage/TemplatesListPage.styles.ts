import styled from 'styled-components';

const MOBILE = '@media (max-width: 640px)';

export const Main = styled.div`
  flex: 1 1 auto;
  min-width: 0;
  padding: ${({ theme }) => `${theme.space[8]} ${theme.space[8]} ${theme.space[20]}`};
  ${MOBILE} {
    padding: ${({ theme }) => `${theme.space[4]} ${theme.space[4]} ${theme.space[24]}`};
  }
`;

export const Inner = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[6]};
  ${MOBILE} {
    gap: ${({ theme }) => theme.space[4]};
  }
`;

export const HeaderRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  min-height: 44px;
`;

export const Title = styled.h1`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.x4l};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  letter-spacing: ${({ theme }) => theme.font.tracking.tight};
  color: ${({ theme }) => theme.color.fg[1]};
  ${MOBILE} {
    font-size: ${({ theme }) => theme.font.size.x3l};
  }
`;

export const Count = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.ink[100]};
  color: ${({ theme }) => theme.color.ink[600]};
  font-size: ${({ theme }) => theme.font.size.xs};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  line-height: 1;
`;

export const Spacer = styled.span`
  flex: 1;
`;

export const Toolbar = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  min-width: 0;
  ${MOBILE} {
    flex-direction: column;
    align-items: stretch;
  }
`;

export const SearchField = styled.label`
  flex: 1;
  max-width: 360px;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  height: 44px;
  padding: 0 ${({ theme }) => theme.space[3]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.paper};
  color: ${({ theme }) => theme.color.fg[3]};
  transition:
    border-color ${({ theme }) => theme.motion.durFast} ${({ theme }) => theme.motion.easeStandard},
    box-shadow ${({ theme }) => theme.motion.durBase} ${({ theme }) => theme.motion.easeOut};

  &:focus-within {
    border-color: ${({ theme }) => theme.color.indigo[600]};
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
  input {
    flex: 1;
    min-width: 0;
    height: 100%;
    border: 0;
    outline: 0;
    background: transparent;
    font: ${({ theme }) =>
      `${theme.font.weight.regular} ${theme.font.size.bodySm} ${theme.font.sans}`};
    color: ${({ theme }) => theme.color.fg[1]};
  }
  input::placeholder {
    color: ${({ theme }) => theme.color.fg[3]};
  }
  ${MOBILE} {
    max-width: none;
  }
`;

/** Tag filter row (canvas `.pills`). */
export const Pills = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[2]};
  min-width: 0;
  overflow-x: auto;
  ${MOBILE} {
    margin: 0 -${({ theme }) => theme.space[4]};
    padding: 0 ${({ theme }) => theme.space[4]};
  }
`;

export const Pill = styled.button<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  height: 36px;
  padding: 0 ${({ theme }) => theme.space[3]};
  border-radius: ${({ theme }) => theme.radius.pill};
  border: 1px solid
    ${({ theme, $active }) => ($active ? theme.color.ink[900] : theme.color.border[1])};
  background: ${({ theme, $active }) => ($active ? theme.color.ink[900] : theme.color.paper)};
  color: ${({ theme, $active }) => ($active ? theme.color.fgOnAccent : theme.color.fg[2])};
  font: inherit;
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color ${({ theme }) => theme.motion.durFast}
      ${({ theme }) => theme.motion.easeStandard},
    border-color ${({ theme }) => theme.motion.durFast} ${({ theme }) => theme.motion.easeStandard};

  &:focus-visible {
    outline: 0;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
  ${MOBILE} {
    height: 44px;
  }
`;

export const Meta = styled.div`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: ${({ theme }) => theme.space[4]};
  ${MOBILE} {
    grid-template-columns: 1fr;
    gap: ${({ theme }) => theme.space[2]};
  }
`;

export const SkeletonCard = styled.div`
  height: 260px;
  ${MOBILE} {
    height: 84px;
  }
`;

export const SheetHead = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  padding: ${({ theme }) => `${theme.space[1]} ${theme.space[1]} ${theme.space[3]}`};
  font-size: ${({ theme }) => theme.font.size.bodyMd};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const SheetActions = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]};
  padding-top: ${({ theme }) => theme.space[2]};
  border-top: 1px solid ${({ theme }) => theme.color.ink[150]};
`;

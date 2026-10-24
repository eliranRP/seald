import styled from 'styled-components';
import { drop } from '@/styles/motion';

const MOBILE = '@media (max-width: 640px)';

export const Root = styled.div`
  position: relative;
  min-width: 0;
`;

/** The closed picker (canvas `.person-pick`). */
export const Trigger = styled.button<{ $open: boolean; $empty: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  width: 100%;
  min-width: 0;
  height: 48px;
  padding: 0 ${({ theme }) => theme.space[3]};
  border: 1px ${({ $empty }) => ($empty ? 'dashed' : 'solid')}
    ${({ theme, $open }) => ($open ? theme.color.indigo[600] : theme.color.border[1])};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.paper};
  box-shadow: ${({ theme, $open }) => ($open ? theme.shadow.focus : 'none')};
  font: inherit;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme, $empty }) => ($empty ? theme.color.fg[3] : theme.color.fg[1])};
  text-align: left;
  cursor: pointer;
  transition:
    border-color ${({ theme }) => theme.motion.durFast} ${({ theme }) => theme.motion.easeStandard},
    box-shadow ${({ theme }) => theme.motion.durBase} ${({ theme }) => theme.motion.easeOut};

  &:hover {
    border-color: ${({ theme, $open }) =>
      $open ? theme.color.indigo[600] : theme.color.border[2]};
  }
  &:focus-visible {
    outline: 0;
    border-color: ${({ theme }) => theme.color.indigo[600]};
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
  ${MOBILE} {
    height: 52px;
  }
`;

export const Two = styled.span`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  flex: 1;
  min-width: 0;
  line-height: 1.3;
`;

export const PersonName = styled.span`
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const PersonMeta = styled.span`
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const Placeholder = styled.span`
  flex: 1;
  min-width: 0;
`;

export const Chevron = styled.span`
  display: inline-flex;
  flex: none;
  color: ${({ theme }) => theme.color.fg[3]};
`;

/** The list under the trigger (floats on desktop, sits in the flow on phones). */
export const Panel = styled.div<{ $inline: boolean }>`
  position: ${({ $inline }) => ($inline ? 'static' : 'absolute')};
  margin-top: ${({ theme, $inline }) => ($inline ? theme.space[1] : '0')};
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: ${({ theme }) => theme.z.overlay};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]};
  padding: ${({ theme }) => theme.space[2]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.paper};
  box-shadow: ${({ theme }) => theme.shadow.lg};
  ${drop}
  transform-origin: top center;

  ${MOBILE} {
    position: static;
    margin-top: ${({ theme }) => theme.space[1]};
    box-shadow: ${({ theme }) => theme.shadow.md};
  }
`;

export const Search = styled.label`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  height: 40px;
  padding: 0 ${({ theme }) => theme.space[3]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ theme }) => theme.color.fg[3]};

  &:focus-within {
    border-color: ${({ theme }) => theme.color.indigo[600]};
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
  input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    font: ${({ theme }) =>
      `${theme.font.weight.regular} ${theme.font.size.bodySm} ${theme.font.sans}`};
    color: ${({ theme }) => theme.color.fg[1]};
  }
`;

export const List = styled.div`
  display: flex;
  flex-direction: column;
  max-height: 232px;
  overflow-y: auto;
`;

export const Option = styled.button<{ $selected: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  width: 100%;
  min-height: 48px;
  padding: ${({ theme }) => `${theme.space[2]} ${theme.space[3]}`};
  border: 0;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme, $selected }) => ($selected ? theme.color.indigo[50] : 'transparent')};
  font: inherit;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[1]};
  text-align: left;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.color.ink[100]};
  }
  &:focus-visible {
    outline: 0;
    box-shadow: inset ${({ theme }) => theme.shadow.focus};
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export const Empty = styled.div`
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[3]}`};
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const Sep = styled.div`
  height: 1px;
  margin: ${({ theme }) => `${theme.space[1]} 0`};
  background: ${({ theme }) => theme.color.ink[150]};
`;

export const NewRow = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
  padding: ${({ theme }) => theme.space[1]};
`;

export const NewFields = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[2]};
`;

export const ErrorText = styled.span`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.danger[700]};
`;

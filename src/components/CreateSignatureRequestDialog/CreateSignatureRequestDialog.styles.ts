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
  width: 560px;
  max-width: 100%;
  max-height: calc(100vh - ${({ theme }) => theme.space[8]});
  overflow: auto;
  background: ${({ theme }) => theme.color.bg.surface};
  border-radius: ${({ theme }) => theme.radius.xl};
  box-shadow: ${({ theme }) => theme.shadow.xl};
  padding: ${({ theme }) => `${theme.space[8]} ${theme.space[6]} ${theme.space[5]}`};
`;

export const Title = styled.h2`
  margin: 0 0 ${({ theme }) => theme.space[2]};
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.h4};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Subtitle = styled.p`
  margin: 0 0 ${({ theme }) => theme.space[4]};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.body};
  color: ${({ theme }) => theme.color.fg[2]};
`;

export const ChipList = styled.ul`
  list-style: none;
  margin: 0 0 ${({ theme }) => theme.space[3]};
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space[2]};
`;

export const Chip = styled.li`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  padding: ${({ theme }) =>
    `${theme.space[1]} ${theme.space[2]} ${theme.space[1]} ${theme.space[1]}`};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.bg.surface};
  max-width: 100%;
`;

export const ChipInitials = styled.span<{ $color: string }>`
  width: 20px;
  height: 20px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ $color }) => $color};
  color: ${({ theme }) => theme.color.fg.inverse};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: ${({ theme }) => theme.font.sans};
  font-size: 10px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  flex: none;
`;

export const ChipName = styled.span`
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[1]};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 160px;
`;

export const ChipRemove = styled.button`
  width: 18px;
  height: 18px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: transparent;
  border: none;
  color: ${({ theme }) => theme.color.fg[2]};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;

  &:hover {
    background: ${({ theme }) => theme.color.danger[50]};
    color: ${({ theme }) => theme.color.danger[700]};
  }

  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const EmptyHint = styled.p`
  margin: 0 0 ${({ theme }) => theme.space[3]};
  padding: ${({ theme }) => `${theme.space[4]} ${theme.space[3]}`};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[2]};
  text-align: center;
  border: 1px dashed ${({ theme }) => theme.color.border[2]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.bg.subtle};
`;

export const AddReceiverButton = styled.button`
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.space[2]};
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[4]}`};
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px dashed ${({ theme }) => theme.color.indigo[300]};
  background: ${({ theme }) => theme.color.indigo[50]};
  color: ${({ theme }) => theme.color.indigo[700]};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.color.indigo[100]};
  }

  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const AddReceiverWrap = styled.div`
  position: relative;
  margin-top: ${({ theme }) => theme.space[2]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.bg.surface};
  overflow: hidden;

  /* Render the embedded AddSignerDropdown inline instead of as a floating overlay. */
  & > [role='combobox'] {
    position: static;
    margin-top: 0;
    border: none;
    border-radius: 0;
    box-shadow: none;
  }
`;

export const Footer = styled.div`
  border-top: 1px solid ${({ theme }) => theme.color.border[1]};
  margin: ${({ theme }) => `${theme.space[5]} -${theme.space[6]} 0`};
  padding: ${({ theme }) => `${theme.space[4]} ${theme.space[6]} 0`};
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: ${({ theme }) => theme.space[4]};
`;

export const CancelButton = styled.button`
  background: transparent;
  border: none;
  color: ${({ theme }) => theme.color.fg[2]};
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

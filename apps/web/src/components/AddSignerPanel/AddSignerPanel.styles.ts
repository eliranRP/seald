import styled from 'styled-components';
import { rise } from '@/styles/motion';
import { DialogSectionedCard } from '../DialogPrimitives';

export const Root = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]};
`;

export const Eyebrow = styled.span`
  font-size: ${({ theme }) => theme.font.size.xs};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  letter-spacing: ${({ theme }) => theme.font.tracking.wider};
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const RecentRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space[2]};
`;

export const RecentButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  &:hover {
    box-shadow: 0 0 0 2px ${({ theme }) => theme.color.indigo[200]};
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const ButtonRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.space[2]};
`;

export const FormCard = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
  padding: ${({ theme }) => theme.space[3]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.paper};
  ${rise}
`;

export const FormActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.space[2]};
`;

export const SavedNote = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: ${({ theme }) => theme.font.size.xs};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const FormError = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.xs};
  color: ${({ theme }) => theme.color.danger[700]};
`;

/* ---- contact picker ---- */

export const PickerCard = styled(DialogSectionedCard)`
  max-width: 480px;
  max-height: 80vh;
`;

export const PickerTitle = styled.h2`
  flex: 1;
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.xl};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const SearchWrap = styled.div`
  margin-bottom: ${({ theme }) => theme.space[3]};
`;

export const ContactList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
`;

export const ContactRow = styled.label<{ $disabled: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  padding: 8px 10px;
  border-radius: ${({ theme }) => theme.radius.sm};
  cursor: ${({ $disabled }) => ($disabled ? 'default' : 'pointer')};
  opacity: ${({ $disabled }) => ($disabled ? 0.7 : 1)};
  &:hover {
    background: ${({ theme, $disabled }) => ($disabled ? 'transparent' : theme.color.bg.subtle)};
  }
  & > input {
    width: 18px;
    height: 18px;
    accent-color: ${({ theme }) => theme.color.indigo[600]};
  }
`;

export const ContactText = styled.span`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
`;

export const ContactName = styled.span`
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const ContactEmail = styled.span`
  font-size: ${({ theme }) => theme.font.size.xs};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const AddedTag = styled.span`
  padding: 2px 8px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.ink[100]};
  font-size: ${({ theme }) => theme.font.size.xs};
  color: ${({ theme }) => theme.color.fg[2]};
`;

export const EmptyNote = styled.p`
  margin: ${({ theme }) => theme.space[4]} 0;
  text-align: center;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const SheetFoot = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.space[2]};
  padding-top: ${({ theme }) => theme.space[3]};
`;

import styled from 'styled-components';
import { mobileInputText } from '@/styles/mixins';
import { DialogSectionedCard } from '../DialogPrimitives';

export const Card = styled(DialogSectionedCard)`
  max-width: 560px;
`;

export const Title = styled.h2`
  flex: 1;
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.xl};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]};
`;

export const RecipientsRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
`;

export const Avatars = styled.div`
  display: flex;
  & > span + span {
    margin-left: -8px;
  }
`;

export const Dot = styled.span<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid ${({ theme }) => theme.color.paper};
  background: ${({ $color }) => $color};
  color: ${({ theme }) => theme.color.ink[900]};
  font-size: ${({ theme }) => theme.font.size.badge};
  font-weight: ${({ theme }) => theme.font.weight.bold};
`;

export const Meta = styled.span`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const SettingRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  min-height: 52px;
  border-bottom: 1px solid ${({ theme }) => theme.color.ink[150]};
  @media (max-width: 640px) {
    flex-wrap: wrap;
    padding: ${({ theme }) => `${theme.space[2]} 0`};
  }
`;

export const SettingIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: ${({ theme }) => theme.color.ink[100]};
  color: ${({ theme }) => theme.color.fg[2]};
`;

export const SettingLabel = styled.span`
  flex: 1;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Select = styled.select`
  height: 40px;
  padding: 0 12px;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  background: ${({ theme }) => theme.color.paper};
  font-family: inherit;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  ${mobileInputText}
  color: ${({ theme }) => theme.color.fg[1]};
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const SealBadge = styled.span`
  padding: 4px 10px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.success[50]};
  color: ${({ theme }) => theme.color.success[700]};
  font-size: ${({ theme }) => theme.font.size.xs};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
`;

export const Advanced = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]};
  padding-top: ${({ theme }) => theme.space[3]};
`;

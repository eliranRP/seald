import styled from 'styled-components';

export const Main = styled.div`
  flex: 1 1 auto;
  min-width: 0;
  overflow: auto;
  padding: ${({ theme }) => theme.space[12]} ${({ theme }) => theme.space[12]}
    ${({ theme }) => theme.space[20]};
`;

export const Inner = styled.div`
  max-width: 960px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[6]};
`;

export const TopBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[4]};
`;

export const Crumb = styled.button`
  all: unset;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  font-size: 13px;
  color: ${({ theme }) => theme.color.fg[3]};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  &:hover,
  &:focus-visible {
    color: ${({ theme }) => theme.color.fg[1]};
  }
  &:focus-visible {
    box-shadow: ${({ theme }) => theme.shadow.focus};
    border-radius: ${({ theme }) => theme.radius.sm};
  }
`;

export const TopBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  padding: 4px 10px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.indigo[50]};
  color: ${({ theme }) => theme.color.indigo[700]};
  font-size: 11px;
  font-weight: ${({ theme }) => theme.font.weight.bold};
  letter-spacing: 0.06em;
  text-transform: uppercase;
`;

export const SummaryGrid = styled.div`
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: ${({ theme }) => theme.space[6]};
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  padding: ${({ theme }) => theme.space[6]};
`;

export const Cover = styled.div<{ $color: string }>`
  position: relative;
  width: 184px;
  height: 232px;
  margin: 0 auto;
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.sm};
  box-shadow: ${({ theme }) => theme.shadow.paper};
  padding: 18px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  &::before {
    content: '';
    position: absolute;
    top: 14px;
    right: 14px;
    width: 36px;
    height: 6px;
    border-radius: 3px;
    background: ${({ $color }) => $color};
  }
`;

export const CoverLine = styled.div<{ $width: number }>`
  height: 3px;
  border-radius: 1.5px;
  background: ${({ theme }) => theme.color.ink[150]};
  width: ${({ $width }) => `${$width}%`};
`;

export const SummaryBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]};
`;

export const SummaryEyebrow = styled.div`
  font-size: 11px;
  font-family: ${({ theme }) => theme.font.mono};
  color: ${({ theme }) => theme.color.fg[3]};
  letter-spacing: 0.04em;
`;

export const SummaryTitle = styled.h1`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 32px;
  font-weight: ${({ theme }) => theme.font.weight.medium};
  letter-spacing: -0.02em;
  color: ${({ theme }) => theme.color.fg[1]};
  margin: 0;
  line-height: 1.15;
`;

export const SummaryMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space[5]};
  font-size: 13px;
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const SummaryMetaItem = styled.span`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[1]};
`;

export const ActionsRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[3]};
  margin-top: ${({ theme }) => theme.space[2]};
`;

export const FieldsCard = styled.section`
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  padding: ${({ theme }) => theme.space[6]};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]};
`;

export const FieldsHeading = styled.h2`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 22px;
  font-weight: ${({ theme }) => theme.font.weight.medium};
  letter-spacing: -0.01em;
  color: ${({ theme }) => theme.color.fg[1]};
  margin: 0;
`;

export const FieldsCaption = styled.p`
  margin: 0;
  font-size: 13px;
  color: ${({ theme }) => theme.color.fg[3]};
  line-height: 1.55;
`;

export const FieldsList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: ${({ theme }) => theme.space[3]};
`;

export const FieldRow = styled.li`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  background: ${({ theme }) => theme.color.ink[50]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[4]}`};
`;

export const FieldGlyph = styled.span`
  width: 32px;
  height: 32px;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.indigo[50]};
  color: ${({ theme }) => theme.color.indigo[700]};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

export const FieldText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

export const FieldKind = styled.span`
  font-size: 13px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
  text-transform: capitalize;
`;

export const FieldRule = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const NotFoundCard = styled.div`
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  padding: ${({ theme }) => theme.space[10]};
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]};
`;

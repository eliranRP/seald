import styled from 'styled-components';

export const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: ${({ theme }) => theme.z.modal};
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
`;

export const Card = styled.div`
  width: 760px;
  max-width: 100%;
  max-height: 88vh;
  background: ${({ theme }) => theme.color.paper};
  border-radius: 18px;
  box-shadow: ${({ theme }) => theme.shadow.xl};
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

export const Header = styled.div`
  padding: 22px 24px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
`;

export const HeaderRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 14px;
`;

export const HeaderIcon = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 11px;
  background: ${({ theme }) => theme.color.indigo[50]};
  color: ${({ theme }) => theme.color.indigo[700]};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

export const HeaderText = styled.div`
  flex: 1;
  min-width: 0;
`;

export const Title = styled.h2`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 22px;
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
  letter-spacing: -0.01em;
  line-height: 1.2;
`;

export const Subtitle = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.color.fg[3]};
  margin-top: 4px;
  line-height: 1.5;
`;

export const CloseButton = styled.button`
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 6px;
  border-radius: 8px;
  color: ${({ theme }) => theme.color.fg[3]};
  display: inline-flex;
  align-items: center;
  justify-content: center;

  &:hover,
  &:focus-visible {
    background: ${({ theme }) => theme.color.ink[100]};
    color: ${({ theme }) => theme.color.fg[1]};
  }
`;

export const SearchRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: 10px;
  background: ${({ theme }) => theme.color.paper};
  margin-top: 14px;

  & > input {
    flex: 1;
    border: none;
    outline: none;
    font-size: 13px;
    font-family: inherit;
    color: ${({ theme }) => theme.color.fg[1]};
    background: transparent;
  }

  & > input::placeholder {
    color: ${({ theme }) => theme.color.fg[3]};
  }
`;

export const FilterRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  flex-wrap: wrap;
`;

export const FilterLabel = styled.span`
  font-size: 11px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[4]};
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin-right: 4px;
`;

export const ActiveTagPill = styled.span<{ $bg: string; $fg: string }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: ${({ theme }) => theme.radius.pill};
  font-size: 11.5px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  background: ${({ $bg }) => $bg};
  color: ${({ $fg }) => $fg};
`;

export const ActiveTagDot = styled.span<{ $color: string }>`
  width: 6px;
  height: 6px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ $color }) => $color};
`;

export const ActiveTagRemove = styled.button`
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  padding: 0;
  margin-left: 2px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: inherit;
  opacity: 0.7;

  &:hover,
  &:focus-visible {
    opacity: 1;
  }
`;

export const List = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 12px 24px 18px;
`;

export const Empty = styled.div`
  padding: 36px 16px;
  text-align: center;
  color: ${({ theme }) => theme.color.fg[3]};
  font-size: 13px;
`;

export const Row = styled.button`
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px;
  border-radius: 12px;
  cursor: pointer;
  border: 1px solid transparent;
  margin-bottom: 6px;
  background: transparent;
  width: 100%;
  text-align: left;
  font-family: inherit;
  color: inherit;

  &:hover,
  &:focus-visible {
    background: ${({ theme }) => theme.color.ink[50]};
    border-color: ${({ theme }) => theme.color.border[1]};
  }
`;

export const Swatch = styled.div<{ $bg: string; $mark: string }>`
  width: 44px;
  height: 56px;
  background: ${({ $bg }) => $bg};
  border-radius: 6px;
  position: relative;
  flex-shrink: 0;
  overflow: hidden;
  border: 1px solid ${({ theme }) => theme.color.border[2]};

  &::before,
  &::after {
    content: '';
    position: absolute;
    border-radius: 1px;
  }

  &::before {
    left: 18%;
    right: 18%;
    top: 18%;
    height: 3px;
    background: ${({ $mark }) => $mark};
  }

  &::after {
    left: 18%;
    right: 56%;
    bottom: 18%;
    height: 5px;
    background: ${({ $mark }) => $mark};
    opacity: 0.4;
  }
`;

export const SwatchLine = styled.span<{ $top: string; $right: string }>`
  position: absolute;
  left: 18%;
  right: ${({ $right }) => $right};
  top: ${({ $top }) => $top};
  height: 2px;
  background: rgba(15, 23, 42, 0.18);
  border-radius: 1px;
`;

export const RowMain = styled.div`
  flex: 1;
  min-width: 0;
`;

export const RowName = styled.div`
  font-size: 14px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const Meta = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  font-size: 11.5px;
  color: ${({ theme }) => theme.color.fg[3]};
  flex-wrap: wrap;
`;

export const MetaCell = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
`;

export const MetaDot = styled.span`
  width: 2px;
  height: 2px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.ink[300]};
`;

export const MetaMono = styled.span`
  font-family: ${({ theme }) => theme.font.mono};
`;

export const TagRow = styled.div`
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 6px;
  flex-wrap: wrap;
`;

export const TagChip = styled.span<{ $bg: string; $fg: string }>`
  font-size: 10px;
  font-weight: ${({ theme }) => theme.font.weight.bold};
  letter-spacing: 0.02em;
  padding: 2px 7px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ $bg }) => $bg};
  color: ${({ $fg }) => $fg};
`;

export const TagOverflow = styled.span`
  font-size: 10px;
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const Chevron = styled.div`
  color: ${({ theme }) => theme.color.fg[4]};
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
`;

export const Footer = styled.div`
  padding: 14px 24px;
  border-top: 1px solid ${({ theme }) => theme.color.border[1]};
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: ${({ theme }) => theme.color.ink[50]};
`;

export const Count = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
`;

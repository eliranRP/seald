import styled from 'styled-components';
import { rise, stagger } from '@/styles/motion';

const MOBILE = '@media (max-width: 640px)';

export const Root = styled.section`
  display: block;
  width: 100%;
`;

/** 20px under the header (canvas Prepare stack gap); 16px on phones. */
export const Header = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  min-height: 20px;
  margin-bottom: ${({ theme }) => theme.space[5]};
  ${MOBILE} {
    /* Room for the 44px signing-order switch target (PrepareMobile). */
    min-height: 44px;
    margin-bottom: ${({ theme }) => theme.space[4]};
  }
`;

export const Title = styled.h2`
  margin: 0;
  line-height: 1.5;
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.xs};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  letter-spacing: ${({ theme }) => theme.font.tracking.wider};
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.fg[3]};
`;

/** Canvas `.count` pill. */
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

export const List = styled.ul`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
  margin: 0;
  padding: 0;
  list-style: none;
`;

export const Row = styled.li<{ readonly $index: number }>`
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 52px;
  padding: 8px 10px;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  background: ${({ theme }) => theme.color.paper};
  ${rise}
  ${({ $index }) => stagger($index)}
  ${MOBILE} {
    min-height: 62px;
  }
`;

export const OrderNum = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1.5px solid ${({ theme }) => theme.color.border[2]};
  font-size: ${({ theme }) => theme.font.size.micro};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[2]};
`;

export const Initials = styled.span<{ readonly $color: string }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: ${({ $color }) => $color};
  color: ${({ theme }) => theme.color.ink[900]};
  font-size: ${({ theme }) => theme.font.size.badge};
  font-weight: ${({ theme }) => theme.font.weight.bold};
  line-height: 1;
  ${MOBILE} {
    width: 36px;
    height: 36px;
    font-size: ${({ theme }) => theme.font.size.xs};
  }
`;

export const Info = styled.span<{ readonly $clickable: boolean }>`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  appearance: none;
  border: 0;
  background: transparent;
  padding: 0;
  text-align: left;
  font: inherit;
  color: inherit;
  cursor: ${({ $clickable }) => ($clickable ? 'pointer' : 'default')};
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
    border-radius: ${({ theme }) => theme.radius.xs};
  }
`;

/** Canvas `.signer-row .name` / `.meta`: 14 / 13px at 1.3 line height. */
export const Name = styled.span`
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  line-height: 1.3;
  color: ${({ theme }) => theme.color.fg[1]};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const Meta = styled.span`
  font-size: ${({ theme }) => theme.font.size.caption};
  line-height: 1.3;
  color: ${({ theme }) => theme.color.fg[3]};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const RemoveButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: transparent;
  color: ${({ theme }) => theme.color.fg[3]};
  cursor: pointer;
  &:hover {
    background: ${({ theme }) => theme.color.ink[100]};
    color: ${({ theme }) => theme.color.fg[1]};
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
  ${MOBILE} {
    width: 44px;
    height: 44px;
    border-radius: ${({ theme }) => theme.radius.md};
  }
`;

export const AddButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 36px;
  padding: 0 12px;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px dashed ${({ theme }) => theme.color.border[2]};
  background: transparent;
  color: ${({ theme }) => theme.color.fg[2]};
  font: inherit;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  cursor: pointer;
  &:hover {
    background: ${({ theme }) => theme.color.bg.subtle};
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

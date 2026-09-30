import { Link } from 'react-router-dom';
import styled from 'styled-components';

export const Page = styled.div`
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  padding: ${({ theme }) => `${theme.space[4]} ${theme.space[4]} ${theme.space[16]}`};
  box-sizing: border-box;

  @media (min-width: 768px) {
    padding: ${({ theme }) => `${theme.space[6]} ${theme.space[8]} ${theme.space[20]}`};
  }
`;

export const BackLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  margin-bottom: ${({ theme }) => theme.space[2]};
  color: ${({ theme }) => theme.color.fg[3]};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  text-decoration: none;

  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const Crumb = styled.nav`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  margin-bottom: ${({ theme }) => theme.space[3]};
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const CrumbLink = styled(Link)`
  color: ${({ theme }) => theme.color.fg[3]};
  text-decoration: none;
  min-height: 44px;
  display: inline-flex;
  align-items: center;

  &:hover {
    color: ${({ theme }) => theme.color.fg[1]};
  }

  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const Title = styled.h1`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.h3};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
  letter-spacing: ${({ theme }) => theme.font.tracking.tight};
  line-height: ${({ theme }) => theme.font.lineHeight.tight};
`;

export const Lede = styled.p`
  margin: ${({ theme }) => `${theme.space[2]} 0 0`};
  font-size: ${({ theme }) => theme.font.size.body};
  line-height: ${({ theme }) => theme.font.lineHeight.relaxed};
  color: ${({ theme }) => theme.color.fg[2]};
`;

export const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]};
  margin-top: ${({ theme }) => theme.space[6]};
`;

export const Row = styled.article`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
  padding: ${({ theme }) => theme.space[4]};
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
`;

export const RowHead = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[3]};
`;

export const Name = styled.h2`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.body};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Meta = styled.p`
  margin: ${({ theme }) => `${theme.space[1]} 0 0`};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
  word-break: break-all;
  direction: ltr;
  unicode-bidi: isolate;
`;

export const Expiry = styled.p`
  margin: ${({ theme }) => `${theme.space[1]} 0 0`};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[2]};
`;

export const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
`;

export const TextButton = styled.button`
  appearance: none;
  border: none;
  background: transparent;
  padding: ${({ theme }) => `${theme.space[2]} 0`};
  min-height: 44px;
  font: inherit;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[2]};
  cursor: pointer;

  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const Panel = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]};
  padding-top: ${({ theme }) => theme.space[2]};
`;

export const Fieldset = styled.fieldset`
  border: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]};
`;

export const Legend = styled.legend`
  padding: 0;
  margin-bottom: ${({ theme }) => theme.space[2]};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Segment = styled.div`
  display: flex;
  width: 100%;
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  overflow: hidden;
`;

export const SegmentOption = styled.label<{ $on: boolean }>`
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  cursor: pointer;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme, $on }) =>
    $on ? theme.font.weight.semibold : theme.font.weight.regular};
  color: ${({ theme }) => theme.color.fg[1]};
  background: ${({ theme, $on }) => ($on ? theme.color.accent.subtle : theme.color.bg.surface)};
  border-right: 1px solid ${({ theme }) => theme.color.border[1]};

  &:last-child {
    border-right: none;
  }

  &:focus-within {
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }

  input {
    position: absolute;
    opacity: 0;
    width: ${({ theme }) => theme.space[1]};
    height: ${({ theme }) => theme.space[1]};
  }
`;

export const Notice = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.color.danger[700]};
  font-size: ${({ theme }) => theme.font.size.bodySm};
`;

export const CapNote = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.color.fg[2]};
  font-size: ${({ theme }) => theme.font.size.bodySm};
`;

export const Muted = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.color.fg[3]};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
`;

export const Toast = styled.div`
  position: fixed;
  left: ${({ theme }) => theme.space[4]};
  right: ${({ theme }) => theme.space[4]};
  bottom: ${({ theme }) => theme.space[4]};
  z-index: ${({ theme }) => theme.z.toast};
  margin: 0 auto;
  max-width: 720px;
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[4]}`};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.ink[900]};
  color: ${({ theme }) => theme.color.fg.inverse};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  box-shadow: ${({ theme }) => theme.shadow.lg};
`;

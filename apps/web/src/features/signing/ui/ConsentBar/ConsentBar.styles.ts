import styled from 'styled-components';
import { rise } from '@/styles/motion';

/** Consent bar above the first page (canvas `.consent-bar`). */
export const Bar = styled.section`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.space[4]};
  width: 100%;
  max-width: 880px;
  box-sizing: border-box;
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[4]} ${theme.space[3]} ${theme.space[5]}`};
  border: 1px solid ${({ theme }) => theme.color.indigo[200]};
  border-radius: ${({ theme }) => theme.radius.lg};
  background: ${({ theme }) => theme.color.paper};
  box-shadow: ${({ theme }) => theme.shadow.sm};
  ${rise}

  /* Mobile stacks: who, then the checkbox row, then a full-width Start. */
  @media (max-width: 640px) {
    flex-direction: column;
    flex-wrap: nowrap;
    align-items: stretch;
    gap: ${({ theme }) => theme.space[3]};
    padding: ${({ theme }) => theme.space[4]};
  }
`;

export const Who = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[4]};
  min-width: 0;
  flex: 1 1 240px;

  @media (max-width: 640px) {
    flex: none;
    gap: ${({ theme }) => theme.space[3]};
  }
`;

export const WhoText = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;

  @media (max-width: 640px) {
    gap: 2px;
  }
`;

export const Asked = styled.span`
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  line-height: 1.3;
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Meta = styled.span`
  font-size: ${({ theme }) => theme.font.size.caption};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const Agree = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[4]};
  flex: 0 1 auto;
  min-width: 0;

  @media (max-width: 640px) {
    flex: none;
    flex-wrap: wrap;
    gap: ${({ theme }) => theme.space[2]};
  }
`;

/** Canvas `.consent-bar label`: 16px box, 12px gap, 14px text. */
export const AgreeLabel = styled.label<{ readonly $disabled: boolean }>`
  display: inline-flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.space[3]};
  min-width: 0;
  cursor: ${({ $disabled }) => ($disabled ? 'not-allowed' : 'pointer')};
  opacity: ${({ $disabled }) => ($disabled ? 0.6 : 1)};

  @media (max-width: 640px) {
    min-height: 44px;
  }
`;

export const AgreeBox = styled.input`
  flex: none;
  width: 16px;
  height: 16px;
  /* Centre the box on the 21px first line of the label. */
  margin: 2.5px 0 0;
  accent-color: ${({ theme }) => theme.color.indigo[600]};
  cursor: inherit;
`;

export const AgreeTextCol = styled.span`
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

export const AgreeText = styled.span`
  font-size: ${({ theme }) => theme.font.size.bodySm};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
  color: ${({ theme }) => theme.color.fg[1]};
`;

/** The device-access statement the checkbox also confirms (kept verbatim). */
export const AgreeHint = styled.span`
  font-size: ${({ theme }) => theme.font.size.xs};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
  color: ${({ theme }) => theme.color.fg[3]};
`;

/**
 * On a phone the link sits under the consent text it explains (indented by
 * the 16px box + 12px gap) and gets a 44px tap height.
 */
export const DisclosureLink = styled.a`
  flex-shrink: 0;
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.regular};
  color: ${({ theme }) => theme.color.indigo[700]};

  @media (max-width: 640px) {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    margin-top: -${({ theme }) => theme.space[2]};
    margin-inline-start: calc(${({ theme }) => theme.space[4]} + ${({ theme }) => theme.space[3]});
  }
`;

export const StartSlot = styled.div`
  flex: none;

  @media (max-width: 640px) {
    align-self: stretch;
  }
`;

export const ErrorLine = styled.p`
  flex-basis: 100%;
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.danger[700]};

  @media (max-width: 640px) {
    flex-basis: auto;
  }
`;

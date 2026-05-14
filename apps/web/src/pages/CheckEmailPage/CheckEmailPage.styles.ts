import styled from 'styled-components';

/**
 * Center-align the entire confirmation stack inside the centered
 * `FormSide` (audit C: CheckEmail #6). The badge + heading + body all
 * collapse to a vertical, center-aligned column so the page reads as a
 * canonical "we sent you something" confirmation screen.
 */
export const Wrap = styled.div`
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
`;

export const IconBadge = styled.div`
  width: 56px;
  height: 56px;
  border-radius: 999px;
  background: ${({ theme }) => theme.color.indigo[50]};
  color: ${({ theme }) => theme.color.indigo[600]};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: ${({ theme }) => theme.space[5]};
`;

export const Title = styled.h1`
  font-family: ${({ theme }) => theme.font.serif};
  /* Theme tokens replace raw px / em literals (audit C: CheckEmail #5).
     The h2 token (36px) and tracking.tight (-0.02em) match the
     editorial scale used by other auth headings. */
  font-size: ${({ theme }) => theme.font.size.h2};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
  letter-spacing: ${({ theme }) => theme.font.tracking.tight};
  line-height: 1.15;
  margin: 0;
`;

export const Body = styled.p`
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[3]};
  margin: ${({ theme }) => theme.space[3]} 0 0;
  /* theme.font.lineHeight.relaxed (1.65) replaces the raw 1.6 (audit C
     CheckEmail #5). Adjacent confirmation paragraphs share the value. */
  line-height: ${({ theme }) => theme.font.lineHeight.relaxed};
`;

export const Actions = styled.div`
  margin-top: ${({ theme }) => theme.space[8]};
  display: flex;
  gap: ${({ theme }) => theme.space[3]};
  width: 100%;
  /* On narrow phones (< 400 px), stack vertically with the Primary CTA
     on top — column-reverse so DOM order (Secondary, Primary) renders as
     (Primary, Secondary) on mobile (audit C: CheckEmail #13). */
  @media (max-width: 400px) {
    flex-direction: column-reverse;
  }
`;

/* Both buttons share the same min-height (48px) so they tower-align across
   the row and clear WCAG 2.5.5 AAA (audit C: CheckEmail #13). */
export const Secondary = styled.button`
  flex: 1;
  min-height: 48px;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.color.border[2]};
  background: ${({ theme }) => theme.color.paper};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
  cursor: pointer;
`;

export const Primary = styled.button`
  flex: 1;
  min-height: 48px;
  border-radius: ${({ theme }) => theme.radius.md};
  border: none;
  background: ${({ theme }) => theme.color.ink[900]};
  color: ${({ theme }) => theme.color.fg.inverse};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  cursor: pointer;
`;

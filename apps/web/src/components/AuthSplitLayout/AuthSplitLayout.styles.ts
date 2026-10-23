import styled from 'styled-components';

const TABLET = '(max-width: 768px)';

export const Root = styled.div<{ $panel: boolean }>`
  min-height: 100dvh;
  display: grid;
  grid-template-columns: ${({ $panel }) =>
    $panel ? 'minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(0, 1fr)'};
  background: ${({ theme }) => theme.color.paper};
  font-family: ${({ theme }) => theme.font.sans};
  color: ${({ theme }) => theme.color.fg[2]};

  @media ${TABLET} {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const Main = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 32px 48px;

  @media ${TABLET} {
    padding: 24px 20px 8px;
  }
`;

export const Logo = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  align-self: flex-start;
  min-height: 44px;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.xl};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
  text-decoration: none;
  letter-spacing: -0.01em;
`;

export const LogoMark = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.indigo[600]};
  color: ${({ theme }) => theme.color.fgOnAccent};
`;

export const Body = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 0;
  padding: 32px 0;

  @media ${TABLET} {
    justify-content: flex-start;
    padding: 56px 0 24px;
  }
`;

export const FootRow = styled.footer`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 8px 16px;
  padding-top: 24px;
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};

  & a,
  & button {
    color: inherit;
    text-underline-offset: 2px;
  }
  & a:hover,
  & button:hover {
    color: ${({ theme }) => theme.color.fg[1]};
  }
  & a:focus-visible,
  & button:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.accent.base};
    outline-offset: 2px;
    border-radius: ${({ theme }) => theme.radius.xxs};
  }
`;

export const FootLinkButton = styled.button`
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
`;

export const Panel = styled.aside`
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 32px;
  padding: 48px;
  overflow: hidden;
  background: linear-gradient(
    160deg,
    ${({ theme }) => theme.color.indigo[50]},
    ${({ theme }) => theme.color.ink[50]} 70%
  );
  border-left: 1px solid ${({ theme }) => theme.color.border[1]};

  @media ${TABLET} {
    display: none;
  }
`;

export const PaperStage = styled.div`
  position: relative;
  width: 352px;
  height: 300px;
  flex: none;
`;

export const Paper = styled.div`
  position: absolute;
  left: 0;
  top: 0;
  width: 352px;
  padding: 28px 32px 32px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: ${({ theme }) => theme.color.paper};
  border-radius: ${({ theme }) => theme.radius.hair};
  box-shadow: ${({ theme }) => theme.shadow.paper};
  transform: rotate(-3deg);
  transform-origin: 0 0;
`;

export const PaperHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const PaperLine = styled.i<{ $w: string }>`
  display: block;
  height: 6px;
  width: ${({ $w }) => $w};
  border-radius: ${({ theme }) => theme.radius.xxs};
  background: ${({ theme }) => theme.color.ink[150]};
`;

export const SigField = styled.div`
  margin: 16px 0 8px;
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  height: 48px;
  padding: 0 12px;
  border: 1px solid ${({ theme }) => theme.color.success[200]};
  background: ${({ theme }) => theme.color.success[50]};
  border-radius: ${({ theme }) => theme.radius.xs};
  font-family: ${({ theme }) => theme.font.script};
  font-size: ${({ theme }) => theme.font.size.x2l};
  color: ${({ theme }) => theme.color.indigo[800]};
`;

export const Benefits = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

export const Benefit = styled.li`
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: ${({ theme }) => theme.font.size.body};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
`;

/** `.auth-form`: the centred column every auth view renders into. */
export const FormColumn = styled.div<{ $center?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  max-width: 380px;
  margin: 0 auto;
  ${({ $center }) => ($center ? 'align-items: center; text-align: center;' : '')}

  @media ${TABLET} {
    max-width: none;
  }
`;

/** `.auth-title`: serif headline, 32px desktop / 28px mobile. */
export const Title = styled.h1`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.x4l};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  line-height: ${({ theme }) => theme.font.lineHeight.tight};
  color: ${({ theme }) => theme.color.fg[1]};

  @media ${TABLET} {
    font-size: ${({ theme }) => theme.font.size.x3l};
  }
`;

/** `.meta`: small secondary line. */
export const Meta = styled.div`
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const BenefitIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.paper};
  color: ${({ theme }) => theme.color.indigo[700]};
  box-shadow: ${({ theme }) => theme.shadow.sm};
`;

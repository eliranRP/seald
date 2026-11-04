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

/** Canvas `.logo`: 28px mark, 20px serif word, 8px apart. A 44px target on a phone. */
export const Logo = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  align-self: flex-start;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.xl};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
  text-decoration: none;

  @media ${TABLET} {
    min-height: 44px;
  }
`;

/** Canvas `.logo-mark`: indigo square with the script "S". */
export const LogoMark = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.indigo[600]};
  color: ${({ theme }) => theme.color.fgOnAccent};
  font-family: ${({ theme }) => theme.font.script};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  font-size: ${({ theme }) => theme.font.size.xl};
  line-height: 1;
`;

export const Body = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 0;

  @media ${TABLET} {
    justify-content: flex-start;
    padding: 56px 0 24px;
  }
`;

/**
 * Legal links (canvas `.meta` row). Desktop: one line, dot-separated, the
 * dot drawn by `li + li::before` so it is never a stray item of its own. Phone:
 * the row wraps, so no dots at all (a wrapped line would start or end on one);
 * each link is a 12px, 44px-tall target with its own padding as the gap.
 */
export const FootRow = styled.footer`
  padding-top: ${({ theme }) => theme.space[6]};
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};

  & a,
  & button {
    color: inherit;
    text-underline-offset: 2px;
  }

  @media ${TABLET} {
    font-size: ${({ theme }) => theme.font.size.xs};

    & a,
    & button {
      display: inline-flex;
      align-items: center;
      min-height: 44px;
      padding: 0 ${({ theme }) => theme.space[2]};
      text-decoration: none;
    }
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

export const FootList = styled.ul`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  margin: 0;
  padding: 0;
  list-style: none;

  & > li {
    display: inline-flex;
    align-items: center;
    gap: ${({ theme }) => theme.space[2]};
  }

  & > li + li::before {
    /* Empty alt text: the dot is decoration, not read aloud. */
    content: '·' / '';
  }

  @media ${TABLET} {
    gap: 0;

    & > li + li::before {
      content: none;
    }
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
  height: 456px;
  flex: none;
`;

/**
 * Canvas `.paper` at full size (640 wide, letter ratio, 56/64 padding),
 * scaled to 0.55 and tilted 3deg, so the page reads as a thumbnail.
 */
export const Paper = styled.div`
  position: absolute;
  left: 0;
  top: 0;
  width: 640px;
  aspect-ratio: 8.5 / 11;
  padding: 56px 64px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: ${({ theme }) => theme.color.paper};
  border-radius: ${({ theme }) => theme.radius.hair};
  box-shadow: ${({ theme }) => theme.shadow.paper};
  transform: rotate(-3deg) scale(0.55);
  transform-origin: 0 0;
`;

export const PaperHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 8px;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.lg};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const PaperLine = styled.i<{ $w: string }>`
  display: block;
  height: 6px;
  width: ${({ $w }) => $w};
  border-radius: ${({ theme }) => theme.radius.hair};
  background: ${({ theme }) => theme.color.ink[150]};
`;

/** The signed field (canvas `.sfield.is-done`): 280 x 48 inside an 88px band. */
export const SigField = styled.div`
  position: relative;
  height: 88px;
  margin-top: 28px;

  & > span {
    position: absolute;
    left: 0;
    top: 20px;
    display: flex;
    align-items: center;
    width: 280px;
    height: 48px;
    padding: 0 8px;
    font-family: ${({ theme }) => theme.font.script};
    font-size: ${({ theme }) => theme.font.size.x3l};
    font-weight: ${({ theme }) => theme.font.weight.semibold};
    line-height: 1;
    color: ${({ theme }) => theme.color.ink[900]};
  }
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
  font-size: ${({ theme }) => theme.font.size.bodyMd};
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

/** `.auth-title`: 32px serif at every width, line height 1.15. */
export const Title = styled.h1`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.x4l};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  line-height: 1.15;
  color: ${({ theme }) => theme.color.fg[1]};
`;

/** `.meta`: 13px secondary line. */
export const Meta = styled.div`
  font-size: ${({ theme }) => theme.font.size.caption};
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

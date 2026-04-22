import styled from 'styled-components';

const Wrap = styled.div`
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.space[12]};
`;

const Card = styled.div`
  max-width: 520px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]};
`;

const Eyebrow = styled.div`
  font-size: 13px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.color.fg[3]};
  text-transform: uppercase;
`;

const Title = styled.h1`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.h2};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
`;

const Body = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.body};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export interface PlaceholderPageProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
}

/**
 * L4 page — minimal "coming soon" surface for routes whose UI isn't part of
 * the current design pass (e.g. Templates, Reports). Keeps the NavBar item
 * clickable so the top-nav feels complete, without promising features that
 * aren't wired yet.
 */
export function PlaceholderPage(props: PlaceholderPageProps) {
  const { eyebrow, title, body } = props;
  return (
    <Wrap>
      <Card>
        <Eyebrow>{eyebrow}</Eyebrow>
        <Title>{title}</Title>
        <Body>{body}</Body>
      </Card>
    </Wrap>
  );
}

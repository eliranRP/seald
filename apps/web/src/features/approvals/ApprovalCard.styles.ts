import styled from 'styled-components';

export const Root = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]};
  width: 100%;
  box-sizing: border-box;
  padding: ${({ theme }) => theme.space[5]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  background: ${({ theme }) => theme.color.paper};
  box-shadow: ${({ theme }) => theme.shadow.sm};
  color: ${({ theme }) => theme.color.fg[1]};
  font-family: ${({ theme }) => theme.font.sans};
`;

/** WP-45: the facts of a request with no document (a key's name, scopes, expiry). */
export const FactList = styled.dl`
  display: grid;
  grid-template-columns: minmax(0, max-content) minmax(0, 1fr);
  gap: ${({ theme }) => `${theme.space[2]} ${theme.space[4]}`};
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.bodySm};

  dt {
    color: ${({ theme }) => theme.color.fg[3]};
  }

  dd {
    margin: 0;
    color: ${({ theme }) => theme.color.fg[1]};
    overflow-wrap: anywhere;
  }
`;

export const BadgeRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space[2]};
`;

export const Heading = styled.h2`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.h4};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  line-height: ${({ theme }) => theme.font.lineHeight.snug};
`;

export const DocTitle = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.body};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  overflow-wrap: anywhere;
`;

export const Meta = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[3]};
  overflow-wrap: anywhere;
`;

export const SectionLabel = styled.h3`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  letter-spacing: ${({ theme }) => theme.font.tracking.wide};
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const RecipientList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
`;

export const RecipientRow = styled.li`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  min-width: 0;
`;

export const RecipientText = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1 1 auto;
`;

export const RecipientName = styled.span`
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  overflow-wrap: anywhere;
`;

export const RecipientEmail = styled.span`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
  overflow-wrap: anywhere;
`;

export const MoreButton = styled.button`
  align-self: flex-start;
  min-height: 44px;
  padding: 0 ${({ theme }) => theme.space[2]};
  border: none;
  background: none;
  color: ${({ theme }) => theme.color.accent.base};
  font: inherit;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.indigo[500]};
    outline-offset: 2px;
    border-radius: ${({ theme }) => theme.radius.xs};
  }
`;

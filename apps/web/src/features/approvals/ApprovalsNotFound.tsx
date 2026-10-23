import { Link } from 'react-router-dom';
import styled from 'styled-components';

const Wrap = styled.main`
  min-height: 60dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.space[3]};
  padding: ${({ theme }) => theme.space[8]} ${({ theme }) => theme.space[4]};
  background: ${({ theme }) => theme.color.bg.app};
  font-family: ${({ theme }) => theme.font.sans};
  color: ${({ theme }) => theme.color.fg[1]};
  text-align: center;
`;

const Heading = styled.h1`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.h5};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
`;

const Back = styled(Link)`
  color: ${({ theme }) => theme.color.accent.base};
  font-weight: ${({ theme }) => theme.font.weight.semibold};

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.indigo[500]};
    outline-offset: 2px;
    border-radius: ${({ theme }) => theme.radius.xs};
  }
`;

/**
 * What every approval route renders when the feature is off, and what an
 * owner sees for an approval that is not theirs (the API answers 404, not
 * 403, so the page does not reveal that the id exists).
 */
export function ApprovalsNotFound() {
  return (
    <Wrap>
      <Heading>Page not found</Heading>
      <Back to="/">Go to Seald</Back>
    </Wrap>
  );
}

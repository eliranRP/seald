import styled, { keyframes } from 'styled-components';

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const Wrap = styled.div`
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: ${({ theme }) => theme.color.bg.app};
`;

const Spinner = styled.span`
  width: 22px;
  height: 22px;
  border-radius: 999px;
  border: 2px solid ${({ theme }) => theme.color.ink[200]};
  border-top-color: ${({ theme }) => theme.color.ink[900]};
  animation: ${spin} 0.8s linear infinite;
`;

/**
 * Full-page spinner used while the initial Supabase `getSession()` resolves.
 * Prevents the route guards from flashing a redirect before the client has
 * had a chance to hydrate a session from storage.
 */
export function AuthLoadingScreen() {
  return (
    <Wrap role="status" aria-live="polite" aria-label="Loading">
      <Spinner aria-hidden />
    </Wrap>
  );
}

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';

/**
 * Landing page for the Google Drive OAuth return on mobile. The mobile
 * flow uses a full-page redirect (Q2 in clarifications-mobile.md) — iOS
 * Safari blocks popup-based OAuth — so the API's callback bounces the
 * user to `/m/send/drive` after a successful token exchange. This route
 * is a near-zero-LOC bounce: it forwards into the Upload screen
 * (`/document/new`) with `?gdrive_connected=1` so UploadRoute re-opens the
 * Drive picker on landing. The old `/m/send` wizard it used to return to is
 * retired. Replace=true so the back-button skips the hop.
 *
 * Slice-D §9 MEDIUM (audit fix): previously rendered `null`, which on
 * iOS Safari produced a 150-300 ms blank-page flash that reads as
 * broken. We now show a centered status spinner + "Opening your Drive…"
 * caption so the user has feedback during the navigation hop. Pattern
 * mirrors `RedirectWhenAuthed.tsx:20-22` / `AuthLoadingScreen`.
 */
const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const Wrap = styled.div`
  min-height: 100dvh;
  display: grid;
  place-items: center;
  background: ${({ theme }) => theme.color.paper};
  gap: ${({ theme }) => theme.space[4]};
  padding: ${({ theme }) => theme.space[6]};
`;

const Inner = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
`;

const Spinner = styled.span`
  width: 22px;
  height: 22px;
  border-radius: ${({ theme }) => theme.radius.pill};
  border: 2px solid ${({ theme }) => theme.color.ink[200]};
  border-top-color: ${({ theme }) => theme.color.ink[900]};
  animation: ${spin} 0.8s linear infinite;

  @media (prefers-reduced-motion: reduce) {
    animation-duration: 2.4s;
  }
`;

const Caption = styled.p`
  margin: 0;
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[3]};
  text-align: center;
`;

export function MobileGdriveReturnPage() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate('/document/new?gdrive_connected=1', { replace: true });
  }, [navigate]);
  return (
    <Wrap role="status" aria-live="polite" aria-label="Opening your Drive">
      <Inner>
        <Spinner aria-hidden />
        <Caption>Opening your Drive…</Caption>
      </Inner>
    </Wrap>
  );
}

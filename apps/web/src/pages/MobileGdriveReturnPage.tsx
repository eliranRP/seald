import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';

/**
 * Landing page for the Google Drive OAuth return on mobile. The mobile
 * flow uses a full-page redirect (Q2 in clarifications-mobile.md) — iOS
 * Safari blocks popup-based OAuth — so the API's callback bounces the
 * user to `/m/send/drive` after a successful token exchange. This route
 * is a near-zero-LOC bounce: it forwards back into `/m/send` with
 * `?gdrive_connected=1` so MobileSendPage's auto-open effect re-opens
 * the picker sheet on landing. Replace=true so the back-button skips
 * the hop.
 *
 * Slice-D §9 MEDIUM (audit fix): previously rendered `null`, which on
 * iOS Safari produced a 150-300 ms blank-page flash that reads as
 * broken. We now show a centered status spinner + "Returning from
 * Google Drive…" caption so the user has feedback during the
 * navigation hop. Pattern mirrors `RedirectWhenAuthed.tsx:20-22` /
 * `AuthLoadingScreen`.
 */
const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const Wrap = styled.div`
  min-height: 100dvh;
  display: grid;
  place-items: center;
  background: #fff;
  gap: 16px;
  padding: 24px;
`;

const Inner = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
`;

const Spinner = styled.span`
  width: 22px;
  height: 22px;
  border-radius: 999px;
  border: 2px solid var(--ink-200);
  border-top-color: var(--ink-900);
  animation: ${spin} 0.8s linear infinite;
`;

const Caption = styled.p`
  margin: 0;
  font-family: ${({ theme }) => theme.font.sans};
  font-size: 14px;
  color: var(--fg-3);
  text-align: center;
`;

export function MobileGdriveReturnPage() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate('/m/send?gdrive_connected=1', { replace: true });
  }, [navigate]);
  return (
    <Wrap role="status" aria-live="polite" aria-label="Returning from Google Drive">
      <Inner>
        <Spinner aria-hidden />
        <Caption>Returning from Google Drive…</Caption>
      </Inner>
    </Wrap>
  );
}

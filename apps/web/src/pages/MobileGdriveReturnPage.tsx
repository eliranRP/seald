import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Landing page for the Google Drive OAuth return on mobile. The mobile
 * flow uses a full-page redirect (Q2 in clarifications-mobile.md) — iOS
 * Safari blocks popup-based OAuth — so the API's callback bounces the
 * user to `/m/send/drive` after a successful token exchange. This route
 * is a near-zero-LOC bounce: it forwards back into `/m/send` with
 * `?gdrive_connected=1` so MobileSendPage's auto-open effect re-opens
 * the picker sheet on landing. Replace=true so the back-button skips
 * the hop.
 */
export function MobileGdriveReturnPage() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate('/m/send?gdrive_connected=1', { replace: true });
  }, [navigate]);
  return null;
}

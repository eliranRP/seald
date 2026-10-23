import { useMemo } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { XCircle } from 'lucide-react';
import { Icon } from '@/components/Icon';
import { readDoneSnapshot } from '@/features/signing';
import { useT } from '@/lib/i18n';
import type { TFn } from '@/lib/i18n';

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.color.ink[100]};
  font-family: ${({ theme }) => theme.font.sans};
`;

const Inner = styled.div`
  max-width: 560px;
  margin: 0 auto;
  padding: 56px 24px 80px;
  text-align: center;
`;

const IconBadge = styled.div`
  width: 88px;
  height: 88px;
  border-radius: ${({ theme }) => theme.radius.pill};
  /* Item 26 — danger[50]/danger[700] pair so the badge reads as
     "stopped state" at a glance instead of the previous grey-on-grey
     that blended into the page chrome. */
  background: ${({ theme }) => theme.color.danger[50]};
  color: ${({ theme }) => theme.color.danger[700]};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 20px;
`;

const Hero = styled.h1`
  font-family: ${({ theme }) => theme.font.serif};
  /* Item 25 — 36px matches theme.font.size.h2 exactly. */
  font-size: ${({ theme }) => theme.font.size.h2};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
  letter-spacing: -0.02em;
  line-height: 1.1;
  margin: 0;
`;

const Body = styled.p`
  font-size: 15px;
  color: ${({ theme }) => theme.color.fg[3]};
  margin: ${({ theme }) => theme.space[4]} 0 0;
  line-height: 1.6;
`;

/**
 * Item 24 — finality / sender-notified copy. A separate paragraph
 * (instead of a sentence appended to Body) so screen-readers register
 * it as its own discrete reading unit.
 */
const Finality = styled.p`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
  margin: ${({ theme }) => theme.space[4]} 0 0;
  line-height: 1.5;
`;

const ExitBtn = styled.button`
  margin-top: ${({ theme }) => theme.space[8]};
  padding: 12px 24px;
  border: none;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.ink[900]};
  color: ${({ theme }) => theme.color.paper};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  cursor: pointer;
`;

/**
 * Item 23 — copy variants. `consent-withdrawn` is the ESIGN §7001(c)(1)
 * path; `not-the-recipient` covers the "wrong recipient?" handoff; the
 * default decline covers everything else (including older snapshots
 * that don't carry `decline_reason`).
 */
function bodyCopyFor(
  reason: string | undefined,
  senderName: string | null,
  t: TFn,
): { readonly heading: string; readonly body: string } {
  const senderClause = senderName
    ? t('signing.declined.letSender', { sender: senderName })
    : t('signing.declined.letSenderAnonymous');
  // The consent-withdrawn copy is ESIGN wording (D2b): it stays English.
  if (reason === 'consent-withdrawn') {
    return {
      heading: 'You withdrew consent to sign electronically.',
      body: `${senderClause} We've recorded the withdrawal in the audit trail.`,
    };
  }
  if (reason === 'not-the-recipient') {
    return {
      heading: t('signing.declined.headingWrongRecipient'),
      body: t('signing.declined.bodyWrongRecipient', { clause: senderClause }),
    };
  }
  return {
    heading: t('signing.declined.headingDeclined'),
    body: t('signing.declined.bodyDeclined', { clause: senderClause }),
  };
}

/**
 * `/sign/:envelopeId/declined` — terminal state after the recipient declines.
 * Reads the sessionStorage snapshot; missing → route to entry.
 */
export function SigningDeclinedPage() {
  const t = useT();
  const navigate = useNavigate();
  const params = useParams<{ readonly envelopeId: string }>();
  const envelopeId = params.envelopeId ?? '';
  const snap = useMemo(() => readDoneSnapshot(envelopeId), [envelopeId]);

  if (!snap || snap.kind !== 'declined') {
    return <Navigate to={`/sign/${envelopeId}`} replace />;
  }

  const copy = bodyCopyFor(snap.decline_reason, snap.sender_name, t);

  return (
    <Page>
      <Inner>
        <IconBadge>
          <Icon icon={XCircle} size={42} />
        </IconBadge>
        <Hero>{copy.heading}</Hero>
        <Body>{copy.body}</Body>
        <Finality>{t('signing.declined.final')}</Finality>
        <ExitBtn type="button" onClick={() => navigate('/')}>
          {t('signing.declined.takeMeOut')}
        </ExitBtn>
      </Inner>
    </Page>
  );
}

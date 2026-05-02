import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { CheckCircle2, FileText, ShieldCheck, Sparkles } from 'lucide-react';
import { Icon } from '@/components/Icon';
import { readDoneSnapshot } from '@/features/signing';

/**
 * T-18 — keep this in sync with `ENVELOPE_RETENTION_YEARS` (default `7`)
 * in `apps/api/src/config/env.schema.ts`. The signer-facing retention
 * disclosure is informational; the legal authoritative value is on the
 * Privacy Policy and audit PDF, both of which read the env var at
 * issuance time.
 */
const RETENTION_YEARS = 7;

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
  background: ${({ theme }) => theme.color.success[50]};
  color: ${({ theme }) => theme.color.success[700]};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 20px;
`;

const Hero = styled.h1`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 42px;
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

const Actions = styled.div`
  margin-top: ${({ theme }) => theme.space[8]};
  display: inline-flex;
  gap: 10px;
`;

const SecondaryBtn = styled.button`
  padding: 12px 18px;
  border: 1px solid ${({ theme }) => theme.color.border[2]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.paper};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
`;

const Upsell = styled.div`
  margin-top: ${({ theme }) => theme.space[10]};
  padding: 28px 24px;
  background: ${({ theme }) => theme.color.ink[900]};
  color: ${({ theme }) => theme.color.paper};
  border-radius: ${({ theme }) => theme.radius.lg};
  text-align: left;
  position: relative;
  overflow: hidden;
`;

const UpsellChip = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: rgba(255, 255, 255, 0.1);
  font-size: ${({ theme }) => theme.font.size.micro};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  letter-spacing: 0.02em;
  margin-bottom: 14px;
`;

const UpsellTitle = styled.div`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 24px;
  font-weight: ${({ theme }) => theme.font.weight.medium};
  line-height: 1.2;
`;

const UpsellBody = styled.div`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: rgba(255, 255, 255, 0.72);
  margin-top: 8px;
  line-height: 1.55;
`;

const UpsellForm = styled.form`
  margin-top: 18px;
  display: flex;
  gap: 8px;
`;

const UpsellInput = styled.input`
  flex: 1;
  padding: 12px 14px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: ${({ theme }) => theme.radius.md};
  background: rgba(255, 255, 255, 0.06);
  color: ${({ theme }) => theme.color.paper};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  outline: none;
`;

const UpsellBtn = styled.button`
  padding: 0 18px;
  border: none;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.paper};
  color: ${({ theme }) => theme.color.ink[900]};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.bold};
  cursor: pointer;
`;

const UpsellError = styled.div`
  margin-top: 10px;
  padding: 8px 12px;
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.4);
  border-radius: ${({ theme }) => theme.radius.sm};
  color: #fecaca;
  font-size: ${({ theme }) => theme.font.size.micro};
  line-height: 1.4;
  text-align: left;
`;

const ExitLink = styled.button`
  margin-top: ${({ theme }) => theme.space[6]};
  background: transparent;
  border: none;
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[3]};
  cursor: pointer;
`;

const RetentionCard = styled.div`
  margin-top: ${({ theme }) => theme.space[8]};
  padding: 14px 16px;
  background: ${({ theme }) => theme.color.ink[50]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  text-align: left;
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[2]};
  line-height: 1.55;
  display: flex;
  gap: 10px;
  align-items: flex-start;
`;

const AesNote = styled.p`
  margin: ${({ theme }) => theme.space[4]} 0 0;
  font-size: ${({ theme }) => theme.font.size.micro};
  color: ${({ theme }) => theme.color.fg[3]};
  line-height: 1.55;
  text-align: left;
`;

/**
 * `/sign/:envelopeId/done` — terminal success screen. Reads the sessionStorage
 * snapshot written by the submit mutation; if missing (user deep-linked),
 * bounce back to the entry page. Offers a "Save a copy" upsell that takes
 * the recipient to sign-up with their email prefilled.
 */
export function SigningDonePage() {
  const navigate = useNavigate();
  const params = useParams<{ readonly envelopeId: string }>();
  const envelopeId = params.envelopeId ?? '';
  const snap = useMemo(() => readDoneSnapshot(envelopeId), [envelopeId]);
  const [email, setEmail] = useState(snap?.recipient_email ?? '');
  const [saveError, setSaveError] = useState<string | null>(null);

  if (!snap || snap.kind !== 'submitted') {
    return <Navigate to={`/sign/${envelopeId}`} replace />;
  }

  const handleSave = (e: React.FormEvent): void => {
    e.preventDefault();
    const trimmed = email.trim();
    // Original code silently `return`-ed on empty input and forwarded
    // any non-empty string straight to `/signup?email=…`. Signers got
    // zero feedback when they submitted blanks, and garbage like
    // `hello` was happily encoded into the signup URL where it failed
    // far from the field that produced it. Validate locally and surface
    // an inline alert so the failure point matches the field.
    if (!trimmed) {
      setSaveError('Please enter an email address.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setSaveError('Please enter a valid email address.');
      return;
    }
    setSaveError(null);
    navigate(`/signup?email=${encodeURIComponent(trimmed)}`);
  };

  return (
    <Page>
      <Inner>
        <IconBadge>
          <Icon icon={CheckCircle2} size={42} />
        </IconBadge>
        <Hero>Seald.</Hero>
        <Body>
          Your signature has been recorded. We&apos;ve sent a signed copy to{' '}
          <b style={{ color: 'inherit' }}>{snap.recipient_email}</b>
          {snap.sender_name ? (
            <>
              {' '}
              and notified <b style={{ color: 'inherit' }}>{snap.sender_name}</b>
            </>
          ) : null}
          .
        </Body>

        <Actions>
          <SecondaryBtn type="button" disabled>
            <Icon icon={FileText} size={14} />
            Check your email for the signed copy
          </SecondaryBtn>
        </Actions>

        <RetentionCard>
          <Icon icon={ShieldCheck} size={16} />
          <span>
            Seald retains the sealed PDF and audit trail for <b>{RETENTION_YEARS} years</b> from
            sealing. You can verify it any time at{' '}
            <a
              href={`/verify/${snap.short_code}`}
              style={{ color: 'inherit', textDecoration: 'underline' }}
            >
              /verify/{snap.short_code}
            </a>
            .
          </span>
        </RetentionCard>

        <AesNote>
          Seald produces an Advanced Electronic Signature (PAdES-LT) — legally equivalent to a
          handwritten signature in most jurisdictions. Some documents (wills, real-estate
          conveyances, certain DE/FR/IT/ES instruments) require a Qualified Electronic Signature or
          wet ink. Consult counsel if unsure.
        </AesNote>

        <Upsell>
          <UpsellChip>
            <Icon icon={Sparkles} size={11} />
            Free forever
          </UpsellChip>
          <UpsellTitle>Keep this signed copy in your Seald library.</UpsellTitle>
          <UpsellBody>
            Create a free account to save this document, request signatures from others, and access
            your full signing history.
          </UpsellBody>
          <UpsellForm onSubmit={handleSave} noValidate>
            <UpsellInput
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              type="email"
              aria-label="Your email"
            />
            <UpsellBtn type="submit">Save my copy</UpsellBtn>
          </UpsellForm>
          {saveError ? <UpsellError role="alert">{saveError}</UpsellError> : null}
        </Upsell>

        <ExitLink type="button" onClick={() => navigate('/')}>
          No thanks, take me out
        </ExitLink>
      </Inner>
    </Page>
  );
}

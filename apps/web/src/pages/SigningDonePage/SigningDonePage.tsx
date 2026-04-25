import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { CheckCircle2, FileText, Sparkles } from 'lucide-react';
import { Icon } from '@/components/Icon';
import { readDoneSnapshot } from '@/features/signing';

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

const ExitLink = styled.button`
  margin-top: ${({ theme }) => theme.space[6]};
  background: transparent;
  border: none;
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[3]};
  cursor: pointer;
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

  if (!snap || snap.kind !== 'submitted') {
    return <Navigate to={`/sign/${envelopeId}`} replace />;
  }

  const handleSave = (e: React.FormEvent): void => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    navigate(`/signup?email=${encodeURIComponent(trimmed)}`);
  };

  return (
    <Page>
      <Inner>
        <IconBadge>
          <Icon icon={CheckCircle2} size={42} />
        </IconBadge>
        <Hero>Sealed.</Hero>
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

        <Upsell>
          <UpsellChip>
            <Icon icon={Sparkles} size={11} />
            Free forever
          </UpsellChip>
          <UpsellTitle>Keep this signed copy in your Sealed library.</UpsellTitle>
          <UpsellBody>
            Create a free account to save this document, request signatures from others, and access
            your full signing history.
          </UpsellBody>
          <UpsellForm onSubmit={handleSave}>
            <UpsellInput
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              type="email"
              aria-label="Your email"
            />
            <UpsellBtn type="submit">Save my copy</UpsellBtn>
          </UpsellForm>
        </Upsell>

        <ExitLink type="button" onClick={() => navigate('/')}>
          No thanks, take me out
        </ExitLink>
      </Inner>
    </Page>
  );
}

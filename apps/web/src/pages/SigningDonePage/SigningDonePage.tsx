import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import styled, { type DefaultTheme } from 'styled-components';
import { CheckCircle2, Download, ShieldCheck, Sparkles } from 'lucide-react';
import { SEAL_DOWNLOAD_ERROR } from 'shared';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { RetentionNotice } from '@/components/RetentionNotice';
import { SignatureLevelNote } from '@/components/SignatureLevelNote';
import { Spinner } from '@/components/shared/Spinner';
import { readDoneSnapshot, safeDownloadName, useSealedDownload } from '@/features/signing';

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
  /* Item 21 — standardize the signer-flow hero to 40px (matches
     SigningPrepPage.Hero) instead of the previous 42px so the visual
     rhythm across prep / done holds. theme.font.size.h2 (36px) is one
     step below; 40px is intentionally between h2 and h1. */
  font-size: 40px;
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
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
`;

// Shared button base — applied to both <a> (enabled) and <button>
// (disabled / sealing) so screen-readers see consistent visual chrome
// regardless of element. Mobile breakpoint (≤ 640 px) snaps the action
// row to full-width per CLAUDE.md mobile lock contract.
const buttonBase = `
  padding: 14px 20px;
  border-radius: 10px;
  font-weight: 600;
  font-size: 15px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  text-decoration: none;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
`;

const PrimaryDownloadLink = styled.a`
  ${buttonBase}
  background: ${({ theme }) => theme.color.ink[900]};
  color: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.ink[900]};
  &:hover {
    background: ${({ theme }) => theme.color.ink[700]};
  }
  @media (max-width: 640px) {
    width: 100%;
  }
`;

const PrimaryDownloadBtn = styled.button`
  ${buttonBase}
  background: ${({ theme }) => theme.color.ink[900]};
  color: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.ink[900]};
  &:disabled {
    background: ${({ theme }) => theme.color.ink[200]};
    color: ${({ theme }) => theme.color.fg[3]};
    border-color: ${({ theme }) => theme.color.ink[200]};
    cursor: not-allowed;
  }
  @media (max-width: 640px) {
    width: 100%;
  }
`;

const DownloadHint = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.micro};
  color: ${({ theme }) => theme.color.fg[3]};
  line-height: 1.4;
`;

const DownloadError = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.micro};
  color: ${({ theme }) => theme.color.danger[700]};
  line-height: 1.4;
`;

const Upsell = styled.section`
  margin-top: ${({ theme }) => theme.space[10]};
  padding: 28px 24px;
  background: ${({ theme }) => theme.color.ink[900]};
  color: ${({ theme }) => theme.color.paper};
  border-radius: ${({ theme }) => theme.radius.lg};
  text-align: left;
  position: relative;
  container-type: inline-size;
  container-name: upsell;
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

/**
 * Card content width where the email field and the save action can share
 * a row. Narrower than this, the action stacks so a long label wraps
 * inside the card instead of spilling past its edge. The length is four
 * space.24 steps plus space.16.
 */
const upsellRowMin = (theme: DefaultTheme): string =>
  `calc(${theme.space[24]} * 4 + ${theme.space[16]})`;

/** Floor for the email field so a long save label cannot collapse it. Five space.10 steps. */
const upsellFieldMin = (theme: DefaultTheme): string => `calc(${theme.space[10]} * 5)`;

const UpsellForm = styled.form`
  margin-top: ${({ theme }) => theme.space[4]};
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: ${({ theme }) => theme.space[2]};

  @container upsell (min-width: ${({ theme }) => upsellRowMin(theme)}) {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;

    & > input {
      width: auto;
      flex: 1 1 ${({ theme }) => upsellFieldMin(theme)};
      /* The 200px floor only applies in the row. In the stack it overflows below ~296px. */
      min-width: ${({ theme }) => upsellFieldMin(theme)};
    }
  }
`;

/**
 * Beside the field the slot keeps its label width. If that no longer fits,
 * flex-wrap drops it onto the next line at the full row width instead of
 * squeezing the label into three or four lines.
 */
const SaveSlot = styled.div`
  width: 100%;
  min-height: ${({ theme }) => theme.space[12]};

  @container upsell (min-width: ${({ theme }) => upsellRowMin(theme)}) {
    width: auto;
    flex: 0 0 auto;
    max-width: 100%;

    & > button {
      width: auto;
      max-width: 100%;
      padding-inline: ${({ theme }) => theme.space[5]};
    }
  }

  & > button {
    min-height: ${({ theme }) => theme.space[12]};
    overflow-wrap: anywhere;
    /* lg padding leaves a 65-character label on a third line at phone width. */
    padding-inline: ${({ theme }) => theme.space[2]};
  }

  /* The shared halo is ~1.14:1 on this ink card. Use the focus stroke instead. */
  & > button:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.border.focus};
    outline-offset: 2px;
  }
`;

const UpsellInput = styled.input`
  flex: 1 1 auto;
  width: 100%;
  min-height: ${({ theme }) => theme.space[12]};
  padding: 12px 14px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: ${({ theme }) => theme.radius.md};
  background: rgba(255, 255, 255, 0.06);
  color: ${({ theme }) => theme.color.paper};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  outline: none;
`;

const UpsellError = styled.div`
  margin-top: 10px;
  padding: 8px 12px;
  /* Item 20 — replaced a hardcoded translucent red background and
     danger-200 text with theme tokens. The Upsell sits on a dark ink[900] surface so we
     use danger[500] (with 0.12 alpha) for the soft bg and danger[50]
     (light) for the text — passes WCAG AA at micro size. */
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid ${({ theme }) => theme.color.danger[500]};
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ theme }) => theme.color.danger[50]};
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

  // Poll the public verify endpoint for this envelope's seal status.
  // Hook is always mounted (rule 4.4 — single responsibility) but the
  // query is gated by `enabled: shortCode.length > 0` inside the hook,
  // so this is safe even when the snapshot is missing on the next line.
  const verify = useSealedDownload(snap?.short_code ?? '');

  if (!snap || snap.kind !== 'submitted') {
    return <Navigate to={`/sign/${envelopeId}`} replace />;
  }

  const sealedUrl = verify.data?.envelope.status === 'completed' ? verify.data.sealed_url : null;
  const isSealing = !sealedUrl && !verify.isError;
  const downloadName = safeDownloadName(snap.title, '-signed');

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
        {/* Item 17 — verb-led affirmation. The IconBadge above already
            carries the brand check mark; the previous "Seald." was
            redundant chrome for a legal completion screen. */}
        <Hero>Signed.</Hero>
        <Body>
          Your signature has been recorded. When everyone has signed, we&apos;ll email you a link to
          the sealed PDF.
        </Body>

        <Actions>
          {sealedUrl ? (
            <PrimaryDownloadLink
              href={sealedUrl}
              download={downloadName}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon icon={Download} size={16} />
              Download signed PDF (.pdf)
            </PrimaryDownloadLink>
          ) : (
            <PrimaryDownloadBtn type="button" disabled aria-busy={isSealing}>
              {/* Item 19 — surface a Spinner inside the disabled button
                  while the seal worker is still finalizing the PDF. The
                  `data-testid` is the test-suite handle; everywhere else
                  we prefer accessible queries (rule 4.6 escape hatch
                  identical to the existing __pathname__ probe). */}
              {isSealing ? (
                <Spinner $size={16} data-testid="signing-spinner" aria-hidden="true" />
              ) : (
                <Icon icon={Download} size={16} />
              )}
              {isSealing ? 'Preparing signed PDF…' : 'Download signed PDF (.pdf)'}
            </PrimaryDownloadBtn>
          )}
          {isSealing ? (
            <DownloadHint>
              We&apos;re finalizing the seal. This usually takes a few seconds.
            </DownloadHint>
          ) : null}
          {verify.isError && !sealedUrl ? (
            <DownloadError role="alert">{SEAL_DOWNLOAD_ERROR}</DownloadError>
          ) : null}
        </Actions>

        <RetentionCard>
          <Icon icon={ShieldCheck} size={16} />
          <RetentionNotice verifyPath={`/verify/${snap.short_code}`} />
        </RetentionCard>

        <SignatureLevelNote />

        <Upsell aria-label="Create your free Seald account">
          <UpsellChip>
            <Icon icon={Sparkles} size={11} />
            Free during beta
          </UpsellChip>
          {/* Item 18 — CTA copy disambiguates from "send another copy"
              and surfaces the signup intent up front. */}
          <UpsellTitle>Create your free Seald account to save this.</UpsellTitle>
          <UpsellBody>
            Save this document, request signatures from others, and access your full signing
            history.
          </UpsellBody>
          <UpsellForm onSubmit={handleSave} noValidate>
            <UpsellInput
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              type="email"
              aria-label="Your email"
            />
            <SaveSlot>
              <Button fullWidth type="submit" variant="secondary" size="lg">
                Save to my Seald account
              </Button>
            </SaveSlot>
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

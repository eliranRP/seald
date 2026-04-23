import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Download, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { EmailCard } from '../../components/EmailCard';
import { EmailMasthead } from '../../components/EmailMasthead';
import { fetchEmailPreview } from '../../lib/mockApi';
import type { EmailPreviewContent } from '../../lib/mockApi';
import type { EmailPreviewPageProps } from './EmailPreviewPage.types';
import {
  ActionRow,
  BackButton,
  Body,
  CTA,
  DocCard,
  DocMeta,
  DocName,
  DocPreview,
  DocSub,
  Emerald,
  Envelope,
  Eyebrow,
  Foot,
  LoadingState,
  SealedRow,
  SignalRow,
  SignerLine,
  Title,
  Trust,
  Wrap,
} from './EmailPreviewPage.styles';

/**
 * L4 page — renders the two transactional email templates (request + completed)
 * as a visual preview. The designs in `Design-Guide/ui_kits/email/*.html` are
 * reference-only HTML files; this page implements them using the library's
 * tokens so they follow the same theme (dark mode, tokens, etc.) as the rest
 * of the app.
 *
 * Content strings are fetched from the mock API on mount so the page mimics
 * how a production implementation would pull copy from the server's template
 * rendering endpoint rather than hard-coding it in the component tree.
 */
export function EmailPreviewPage(props: EmailPreviewPageProps) {
  const { variant } = props;
  const navigate = useNavigate();
  const [content, setContent] = useState<EmailPreviewContent | null>(null);

  useEffect(() => {
    let cancelled = false;
    setContent(null);
    fetchEmailPreview(variant)
      .then((result) => {
        if (!cancelled) {
          setContent(result);
        }
      })
      .catch(() => {
        /* leave content as null — the loading placeholder stays visible */
      });
    return () => {
      cancelled = true;
    };
  }, [variant]);

  return (
    <Wrap>
      <Envelope>
        <SignalRow>
          <BackButton type="button" onClick={() => navigate(-1)}>
            ← Back
          </BackButton>
        </SignalRow>
        {content ? (
          <>
            <EmailMasthead brand={content.brand} />

            {content.variant === 'request' ? (
              <EmailCard>
                <Eyebrow>{content.eyebrow}</Eyebrow>
                <Title>{content.title}</Title>
                <Body>{content.body}</Body>
                <DocCard>
                  <DocPreview aria-hidden />
                  <DocMeta>
                    <DocName>{content.document.name}</DocName>
                    <DocSub>{content.document.meta}</DocSub>
                  </DocMeta>
                </DocCard>
                <CTA href="#" role="button">
                  {content.ctaLabel} <ArrowRight size={16} />
                </CTA>
                <Trust>
                  <ShieldCheck size={16} /> {content.trust}
                </Trust>
                <Foot>{content.footer}</Foot>
              </EmailCard>
            ) : (
              <EmailCard>
                <SealedRow>
                  <Emerald>
                    <CheckCircle2 size={28} />
                  </Emerald>
                  <Title>{content.title}</Title>
                </SealedRow>
                <Body>{content.body}</Body>
                <div>
                  {content.signers.map((signer) => (
                    <SignerLine key={signer.email}>
                      <Emerald>
                        <CheckCircle2 size={16} />
                      </Emerald>
                      {signer.name} · {signer.email}
                    </SignerLine>
                  ))}
                </div>
                <ActionRow>
                  <CTA href="#" role="button">
                    <Download size={16} /> {content.primaryActionLabel}
                  </CTA>
                  <BackButton type="button">{content.secondaryActionLabel}</BackButton>
                </ActionRow>
                <Foot>{content.footer}</Foot>
              </EmailCard>
            )}
          </>
        ) : (
          <EmailCard>
            <LoadingState role="status" aria-live="polite">
              Loading preview…
            </LoadingState>
          </EmailCard>
        )}
      </Envelope>
    </Wrap>
  );
}

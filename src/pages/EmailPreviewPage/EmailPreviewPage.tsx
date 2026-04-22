import { ArrowRight, CheckCircle2, Download, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';

const Wrap = styled.div`
  flex: 1 1 auto;
  overflow: auto;
  background: ${({ theme }) => theme.color.ink[100]};
  padding: ${({ theme }) => theme.space[10]} ${({ theme }) => theme.space[6]};
  display: flex;
  justify-content: center;
`;

const Envelope = styled.div`
  width: 100%;
  max-width: 640px;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]};
`;

const Masthead = styled.div`
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  padding: ${({ theme }) => theme.space[5]};
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.h5};
  color: ${({ theme }) => theme.color.fg[1]};
`;

const MastheadMark = styled.div`
  width: 32px;
  height: 32px;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.indigo[600]};
  color: ${({ theme }) => theme.color.fg.inverse};
  display: inline-flex;
  align-items: center;
  justify-content: center;
`;

const Card = styled.div`
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  padding: ${({ theme }) => theme.space[8]};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[5]};
`;

const Eyebrow = styled.div`
  font-size: 13px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.color.fg[3]};
  text-transform: uppercase;
`;

const Title = styled.h1`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.h2};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  letter-spacing: ${({ theme }) => theme.font.tracking.tight};
  color: ${({ theme }) => theme.color.fg[1]};
`;

const Body = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.body};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
  color: ${({ theme }) => theme.color.fg[2]};
`;

const DocCard = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[4]};
  align-items: center;
  padding: ${({ theme }) => theme.space[4]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.bg.sunken};
`;

const DocPreview = styled.div`
  width: 48px;
  height: 60px;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  flex-shrink: 0;
`;

const DocMeta = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

const DocName = styled.div`
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  font-size: 14px;
  color: ${({ theme }) => theme.color.fg[1]};
`;

const DocSub = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
`;

const CTA = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.space[2]};
  background: ${({ theme }) => theme.color.indigo[600]};
  color: ${({ theme }) => theme.color.fg.inverse};
  text-decoration: none;
  border-radius: ${({ theme }) => theme.radius.sm};
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[5]}`};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  font-size: 14px;
  align-self: flex-start;
  cursor: pointer;
  &:hover {
    background: ${({ theme }) => theme.color.indigo[700]};
  }
`;

const Trust = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  color: ${({ theme }) => theme.color.fg[3]};
  font-size: 13px;
`;

const Foot = styled.div`
  text-align: center;
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
`;

const SealedRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
`;

const SignerLine = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  font-size: 14px;
  color: ${({ theme }) => theme.color.fg[2]};
`;

const Emerald = styled.span`
  color: ${({ theme }) => theme.color.success[500]};
  display: inline-flex;
  align-items: center;
`;

const ActionRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[3]};
  flex-wrap: wrap;
`;

const SignalRow = styled.div`
  display: flex;
  justify-content: center;
  margin-bottom: ${({ theme }) => theme.space[4]};
`;

const BackButton = styled.button`
  appearance: none;
  background: transparent;
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  color: ${({ theme }) => theme.color.fg[2]};
  font-size: 13px;
  font-weight: ${({ theme }) => theme.font.weight.medium};
  font-family: ${({ theme }) => theme.font.sans};
  padding: ${({ theme }) => `${theme.space[2]} ${theme.space[4]}`};
  border-radius: ${({ theme }) => theme.radius.pill};
  cursor: pointer;
  &:hover {
    background: ${({ theme }) => theme.color.bg.surface};
  }
`;

export interface EmailPreviewPageProps {
  readonly variant: 'request' | 'completed';
}

/**
 * L4 page — renders the two transactional email templates (request + completed)
 * as a visual preview. The designs in `Design-Guide/ui_kits/email/*.html` are
 * reference-only HTML files; this page implements them using the library's
 * tokens so they follow the same theme (dark mode, tokens, etc.) as the rest
 * of the app.
 *
 * Rendered inside the app chrome purely as a preview — actual transactional
 * email delivery would render these into raw HTML via a server-side template
 * engine in a production deployment.
 */
export function EmailPreviewPage(props: EmailPreviewPageProps) {
  const { variant } = props;
  const navigate = useNavigate();
  return (
    <Wrap>
      <Envelope>
        <SignalRow>
          <BackButton type="button" onClick={() => navigate(-1)}>
            ← Back
          </BackButton>
        </SignalRow>
        <Masthead>
          <MastheadMark aria-hidden>S</MastheadMark>
          <span>Sealed</span>
        </Masthead>

        {variant === 'request' ? (
          <Card>
            <Eyebrow>Signature request</Eyebrow>
            <Title>Ana Torres requested your signature</Title>
            <Body>
              Ana Torres has prepared a document for your review and signature. Please open it and
              complete the highlighted fields when you have a moment.
            </Body>
            <DocCard>
              <DocPreview aria-hidden />
              <DocMeta>
                <DocName>Master services agreement</DocName>
                <DocSub>8 pages · expires in 7 days</DocSub>
              </DocMeta>
            </DocCard>
            <CTA href="#" role="button">
              Review and sign <ArrowRight size={16} />
            </CTA>
            <Trust>
              <ShieldCheck size={16} /> Signed with 256-bit encryption. A full audit trail is
              recorded.
            </Trust>
            <Foot>
              Sealed · You received this because Ana Torres added your email to a signature request.
            </Foot>
          </Card>
        ) : (
          <Card>
            <SealedRow>
              <Emerald>
                <CheckCircle2 size={28} />
              </Emerald>
              <Title>This document is sealed.</Title>
            </SealedRow>
            <Body>
              Everyone has signed the document. A copy is attached for your records along with a
              link to the full audit trail.
            </Body>
            <div>
              <SignerLine>
                <Emerald>
                  <CheckCircle2 size={16} />
                </Emerald>
                Ana Torres · ana@farrow.law
              </SignerLine>
              <SignerLine>
                <Emerald>
                  <CheckCircle2 size={16} />
                </Emerald>
                Meilin Chen · meilin@chen.co
              </SignerLine>
              <SignerLine>
                <Emerald>
                  <CheckCircle2 size={16} />
                </Emerald>
                Jamie Okonkwo · jamie@okonkwo.co
              </SignerLine>
            </div>
            <ActionRow>
              <CTA href="#" role="button">
                <Download size={16} /> Download signed copy
              </CTA>
              <BackButton type="button">View audit trail</BackButton>
            </ActionRow>
            <Foot>Sealed · Secure electronic signatures.</Foot>
          </Card>
        )}
      </Envelope>
    </Wrap>
  );
}

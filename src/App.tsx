import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import styled, { useTheme } from 'styled-components';
import { RotateCcw } from 'lucide-react';
import {
  Button,
  DocThumb,
  SignaturePad,
  SignerRow,
  type SignatureValue,
  type Signer,
} from './index';

const Page = styled.main`
  max-width: 880px;
  margin: 0 auto;
  padding: ${({ theme }) => theme.space[8]} ${({ theme }) => theme.space[6]};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[8]};
  font-family: ${({ theme }) => theme.font.sans};
  color: ${({ theme }) => theme.color.fg[1]};
`;

const Heading = styled.h1`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.h2};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  letter-spacing: ${({ theme }) => theme.font.tracking.tight};
  margin: 0;
`;

const Section = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]};
`;

const SectionTitle = styled.h2`
  font-size: ${({ theme }) => theme.font.size.h5};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[2]};
  margin: 0;
`;

const SignerList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
`;

const DocRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[4]};
`;

const StatusBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]};
  padding: ${({ theme }) => theme.space[4]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.bg.surface};
`;

const StatusLine = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[2]};
`;

const TypedPreview = styled.span`
  font-family: ${({ theme }) => theme.font.script};
  font-size: ${({ theme }) => theme.font.size.h4};
  color: ${({ theme }) => theme.color.fg[1]};
`;

const ImagePreviewFrame = styled.div`
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.sm};
  padding: ${({ theme }) => theme.space[2]};
  background: ${({ theme }) => theme.color.bg.surface};
  width: fit-content;
`;

const ImagePreview = styled.img`
  display: block;
  max-width: 240px;
  max-height: 96px;
`;

const Controls = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[3]};
`;

const SIGNERS: ReadonlyArray<Signer> = [
  { id: 's1', name: 'Ada Lovelace', email: 'ada@analytical.engine', status: 'awaiting-you' },
  { id: 's2', name: 'Alan Turing', email: 'alan@bletchley.park', status: 'awaiting-others' },
  { id: 's3', name: 'Grace Hopper', email: 'grace@cobol.dev', status: 'completed' },
];

function renderCommittedPreview(value: SignatureValue) {
  if (value.kind === 'typed') {
    return (
      <StatusLine>
        Signed: <TypedPreview>{value.text}</TypedPreview>
      </StatusLine>
    );
  }
  const label = value.kind === 'drawn' ? 'Drawn signature' : `Uploaded: ${value.fileName}`;
  return (
    <>
      <StatusLine>{label}</StatusLine>
      <ImagePreviewFrame>
        <ImagePreview src={value.pngDataUrl} alt="Committed signature preview" />
      </ImagePreviewFrame>
    </>
  );
}

export function App() {
  const theme = useTheme();
  const [committed, setCommitted] = useState<SignatureValue | null>(null);
  const [padKey, setPadKey] = useState(0);

  const handleCommit = useCallback((value: SignatureValue) => {
    setCommitted(value);
  }, []);

  const handleReset = useCallback(() => {
    setCommitted(null);
    setPadKey((k) => k + 1);
  }, []);

  let statusNode: ReactNode;
  if (committed === null) {
    statusNode = <StatusLine>No signature committed yet.</StatusLine>;
  } else {
    statusNode = renderCommittedPreview(committed);
  }

  return (
    <Page style={{ background: theme.color.bg.app }}>
      <Heading>Seald — Phase 1 Demo</Heading>

      <Section aria-labelledby="signers-heading">
        <SectionTitle id="signers-heading">Signers</SectionTitle>
        <SignerList>
          {SIGNERS.map((signer) => (
            <li key={signer.id}>
              <SignerRow signer={signer} />
            </li>
          ))}
        </SignerList>
      </Section>

      <Section aria-labelledby="doc-heading">
        <SectionTitle id="doc-heading">Document</SectionTitle>
        <DocRow>
          <DocThumb title="Master Services Agreement" size={72} />
          <StatusLine>Master Services Agreement — 4 pages</StatusLine>
        </DocRow>
      </Section>

      <Section aria-labelledby="pad-heading">
        <SectionTitle id="pad-heading">Sign</SectionTitle>
        <SignaturePad key={padKey} onCommit={handleCommit} />
        <StatusBlock aria-live="polite">
          <SectionTitle as="h3">Status</SectionTitle>
          {statusNode}
          <Controls>
            <Button variant="secondary" iconLeft={RotateCcw} onClick={handleReset}>
              Reset pad
            </Button>
          </Controls>
        </StatusBlock>
      </Section>
    </Page>
  );
}

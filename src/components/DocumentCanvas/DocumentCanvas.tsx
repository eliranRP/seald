import { forwardRef } from 'react';
import type { DocumentCanvasProps } from './DocumentCanvas.types';
import {
  ContentRow,
  DocMeta,
  HeaderGap,
  Paper,
  SignatureLineCaption,
  SignatureLineCell,
  SignatureLineRow,
  SignatureLineRule,
  SignatureLinesWrap,
  Title,
} from './DocumentCanvas.styles';

const DEFAULT_TITLE = 'Master Services Agreement';
const DEFAULT_DOC_ID = 'DOC-8F3A-4291';
const DEFAULT_SIGNATURE_LABELS: ReadonlyArray<string> = [
  'CLIENT SIGNATURE',
  'COUNTERPARTY SIGNATURE',
];

function deriveRowCount(currentPage: number, totalPages: number): number {
  return currentPage === totalPages ? 8 : 14;
}

function computeRowWidthPct(index: number): number {
  return 70 + ((index * 7) % 30);
}

export const DocumentCanvas = forwardRef<HTMLDivElement, DocumentCanvasProps>((props, ref) => {
  const {
    title = DEFAULT_TITLE,
    docId = DEFAULT_DOC_ID,
    currentPage,
    totalPages,
    showSignatureLines,
    signatureLineLabels = DEFAULT_SIGNATURE_LABELS,
    contentRowCount,
    children,
    ...rest
  } = props;

  const isLastPage = currentPage === totalPages;
  const shouldShowSignatureLines = showSignatureLines ?? isLastPage;
  const rowCount = contentRowCount ?? deriveRowCount(currentPage, totalPages);
  const rows = Array.from({ length: rowCount }, (_v, i) => i);

  return (
    <Paper
      {...rest}
      ref={ref}
      role="document"
      aria-label={`${title} — page ${currentPage} of ${totalPages}`}
    >
      <Title>{title}</Title>
      <DocMeta>
        {docId} · Page {currentPage} of {totalPages}
      </DocMeta>
      <HeaderGap />
      {rows.map((i) => (
        <ContentRow key={i} $widthPct={computeRowWidthPct(i)} aria-hidden />
      ))}
      {shouldShowSignatureLines ? (
        <SignatureLinesWrap aria-hidden>
          <SignatureLineRow>
            {signatureLineLabels.map((label) => (
              <SignatureLineCell key={label}>
                <SignatureLineRule />
                <SignatureLineCaption>{label}</SignatureLineCaption>
              </SignatureLineCell>
            ))}
          </SignatureLineRow>
        </SignatureLinesWrap>
      ) : null}
      {children}
    </Paper>
  );
});

DocumentCanvas.displayName = 'DocumentCanvas';

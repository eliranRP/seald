import { forwardRef } from 'react';
import { PdfPageView } from '../PdfPageView';
import type { DocumentCanvasProps } from './DocumentCanvas.types';
import {
  ContentRow,
  DocMeta,
  HeaderGap,
  LoadingPaper,
  LoadingSpinner,
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
const DEFAULT_PDF_WIDTH = 560;

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
    pdfDoc,
    pdfPageWidth,
    pdfLoading,
    children,
    ...rest
  } = props;

  const isPdfMode = pdfDoc != null;
  // Parsing a large PDF can take a few seconds — show a centered spinner in
  // the paper slot so the user knows the upload is still being processed and
  // doesn't think the app hung.
  const isPdfParsing = !isPdfMode && Boolean(pdfLoading);
  const isLastPage = currentPage === totalPages;
  const shouldShowSignatureLines = showSignatureLines ?? isLastPage;
  const rowCount = contentRowCount ?? deriveRowCount(currentPage, totalPages);
  const rows = Array.from({ length: rowCount }, (_v, i) => i);

  return (
    <Paper
      {...rest}
      ref={ref}
      $pdfMode={isPdfMode}
      role="document"
      aria-label={`${title} — page ${String(currentPage)} of ${String(totalPages)}`}
    >
      {isPdfMode ? (
        <PdfPageView
          doc={pdfDoc}
          pageNumber={currentPage}
          width={pdfPageWidth ?? DEFAULT_PDF_WIDTH}
        />
      ) : null}
      {!isPdfMode && isPdfParsing ? (
        <LoadingPaper role="status" aria-live="polite" aria-label="Loading document">
          <LoadingSpinner $size={32} $borderWidth={3} aria-hidden />
          <span>Loading document…</span>
        </LoadingPaper>
      ) : null}
      {!isPdfMode && !isPdfParsing ? (
        <>
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
        </>
      ) : null}
      {children}
    </Paper>
  );
});

DocumentCanvas.displayName = 'DocumentCanvas';

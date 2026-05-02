import { Info, RotateCcw } from 'lucide-react';
import styled from 'styled-components';
import { PdfPageView } from '@/components/PdfPageView/PdfPageView';
import type { PDFDocumentProxy } from '@/lib/pdf';

const Wrap = styled.div`
  padding: 4px 16px 24px;
`;

const Card = styled.div`
  background: #fff;
  border: 1px solid var(--border-1);
  border-radius: 18px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const PdfThumb = styled.div`
  width: 160px;
  min-height: 208px;
  border-radius: 8px;
  background: #fff;
  box-shadow:
    0 1px 2px rgba(11, 18, 32, 0.06),
    0 8px 24px rgba(11, 18, 32, 0.06);
  padding: 16px 14px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const RealThumbWrap = styled.div`
  /* The PdfPageView renders its own canvas at 132 px CSS width. We drop
     the inner padding so the rasterized page fills the thumb edge-to-edge
     instead of looking inset on a phone. */
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 0 0 1px rgba(11, 18, 32, 0.06) inset;
`;

const ThumbTitle = styled.div`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 11px;
  font-weight: 500;
`;

const ThumbLine = styled.div<{ $w: number }>`
  height: 3px;
  border-radius: 2px;
  background: var(--ink-150);
  margin: 4px 0;
  width: ${({ $w }) => $w}%;
`;

const Meta = styled.div`
  margin-top: 18px;
  text-align: center;
  max-width: 100%;
  min-width: 0;
`;

const Name = styled.div`
  font-size: 15px;
  font-weight: 600;
  color: var(--fg-1);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Sub = styled.div`
  font-size: 13px;
  color: var(--fg-3);
  margin-top: 4px;
  font-family: ${({ theme }) => theme.font.mono};
`;

const Replace = styled.button`
  margin-top: 14px;
  border: 1px solid var(--border-1);
  background: #fff;
  border-radius: 12px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 600;
  color: var(--fg-2);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font: inherit;

  &:focus-visible {
    outline: 2px solid var(--indigo-600);
    outline-offset: 2px;
  }
`;

const Notice = styled.div`
  margin-top: 14px;
  padding: 12px 14px;
  background: var(--accent-subtle);
  border: 1px solid var(--indigo-200);
  border-radius: 14px;
  display: flex;
  gap: 10px;
  align-items: flex-start;
`;

const NoticeText = styled.div`
  font-size: 12px;
  color: var(--indigo-700);
  line-height: 1.5;
`;

export interface MWFileProps {
  readonly fileName: string;
  readonly totalPages: number;
  readonly fileSizeBytes?: number;
  /**
   * Loaded pdf.js document for the picked file. Optional so the screen
   * still renders during the brief window between pick and parse — when
   * `null`, the placeholder thumbnail is shown.
   */
  readonly doc?: PDFDocumentProxy | null;
  readonly onReplace: () => void;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function MWFile(props: MWFileProps) {
  const { fileName, totalPages, fileSizeBytes, doc, onReplace } = props;
  return (
    <Wrap>
      <Card>
        <PdfThumb aria-hidden={doc ? undefined : true}>
          {doc ? (
            <RealThumbWrap data-testid="mw-file-thumb">
              <PdfPageView doc={doc} pageNumber={1} width={132} />
            </RealThumbWrap>
          ) : (
            <div style={{ width: '100%' }}>
              <ThumbTitle>{fileName.replace(/\.pdf$/i, '')}</ThumbTitle>
              <div style={{ height: 6 }} />
              {[60, 78, 66, 88, 71, 84, 62, 96, 70, 80].map((w, i) => (
                <ThumbLine key={`tl-${w}-${i}`} $w={w} />
              ))}
            </div>
          )}
        </PdfThumb>
        <Meta>
          <Name>{fileName}</Name>
          <Sub>
            {totalPages} {totalPages === 1 ? 'page' : 'pages'}
            {fileSizeBytes !== undefined ? ` · ${formatBytes(fileSizeBytes)}` : ''}
          </Sub>
        </Meta>
        <Replace type="button" onClick={onReplace} aria-label="Replace file">
          <RotateCcw size={14} aria-hidden /> Replace file
        </Replace>
      </Card>
      <Notice role="note">
        <Info size={16} aria-hidden style={{ color: 'var(--indigo-600)', marginTop: 2 }} />
        <NoticeText>Stay on this tab to finish — closing it will discard the draft.</NoticeText>
      </Notice>
    </Wrap>
  );
}

import styled from 'styled-components';

/**
 * Paper surface that hosts either the mocked placeholder content OR a real
 * PDF page. In `$pdfMode` padding/min-height are stripped so the rendered
 * PDF canvas can fill the paper edge-to-edge; placed fields still position
 * against the paper's CSS pixel space.
 */
export const Paper = styled.div<{ readonly $pdfMode?: boolean | undefined }>`
  width: 560px;
  background: ${({ theme }) => theme.color.bg.surface};
  border-radius: ${({ theme }) => theme.radius.xs};
  box-shadow: ${({ theme }) => theme.shadow.paper};
  position: relative;
  margin: 0 auto;
  user-select: none;
  box-sizing: border-box;
  ${({ $pdfMode }) =>
    $pdfMode ? 'padding: 0; overflow: hidden;' : 'padding: 56px 64px; min-height: 740px;'}
`;

export const Title = styled.div`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 22px;
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const DocMeta = styled.div`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 11px;
  color: ${({ theme }) => theme.color.fg[3]};
  margin-top: ${({ theme }) => theme.space[1]};
`;

export const HeaderGap = styled.div`
  height: 18px;
`;

export const ContentRow = styled.div<{ readonly $widthPct: number }>`
  height: 6px;
  border-radius: 2px;
  background: ${({ theme }) => theme.color.ink[150]};
  margin: ${({ theme }) => theme.space[2]} 0;
  width: ${({ $widthPct }) => `${$widthPct}%`};
`;

export const SignatureLinesWrap = styled.div`
  position: absolute;
  left: 64px;
  right: 64px;
  top: 540px;
  display: flex;
  flex-direction: column;
  gap: 28px;
`;

export const SignatureLineRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[3]};
`;

export const SignatureLineCell = styled.div`
  flex: 1;
`;

export const SignatureLineRule = styled.div`
  border-bottom: 1.5px solid ${({ theme }) => theme.color.ink[300]};
  height: 54px;
`;

export const SignatureLineCaption = styled.div`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 10px;
  color: ${({ theme }) => theme.color.fg[3]};
  margin-top: ${({ theme }) => theme.space[1]};
  letter-spacing: 0.04em;
`;

/**
 * Centered column used while a PDF is still parsing. Mirrors the paper's
 * baseline dimensions so the surrounding layout (scaler, scroll area, rails)
 * doesn't jump around when the real PDF eventually replaces it.
 */
export const LoadingPaper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.space[3]};
  min-height: 740px;
  color: ${({ theme }) => theme.color.fg[3]};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: 13px;
`;

/**
 * Same CSS-only spinner as PdfPageView, duplicated here to keep DocumentCanvas
 * self-contained (no cross-component style import). Kept small so a change in
 * one place is easy to mirror in the other.
 */
export const LoadingSpinner = styled.div`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 3px solid ${({ theme }) => theme.color.ink[100]};
  border-top-color: ${({ theme }) => theme.color.indigo[600]};
  animation: doc-canvas-spin 0.8s linear infinite;

  @keyframes doc-canvas-spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

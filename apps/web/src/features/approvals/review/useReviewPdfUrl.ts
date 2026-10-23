import { useQuery } from '@tanstack/react-query';
import { getEnvelopeDownloadUrl } from '@/features/envelopes';
import { approvalKeys } from '../approvalsApi';

export const reviewPdfKey = (envelopeId: string, documentId: string | undefined) =>
  [...approvalKeys.all, 'review-pdf', envelopeId, documentId ?? 'main'] as const;

// The signed URL lives five minutes. Refetch before that so a long review
// still renders a page the owner steps back to.
const URL_STALE_MS = 4 * 60 * 1000;

/**
 * The short-lived signed URL of one document's original PDF, for the
 * review. A failure leaves `data` empty and the page canvas falls back to
 * its placeholder; the field boxes still show where everything is.
 */
export function useReviewPdfUrl(envelopeId: string, documentId: string | undefined) {
  return useQuery<string>({
    queryKey: reviewPdfKey(envelopeId, documentId),
    staleTime: URL_STALE_MS,
    retry: false,
    queryFn: async ({ signal }) => {
      const res = await getEnvelopeDownloadUrl(
        envelopeId,
        'original',
        signal,
        documentId !== undefined ? { documentId } : undefined,
      );
      return res.url;
    },
  });
}

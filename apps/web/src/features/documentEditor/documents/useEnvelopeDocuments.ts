import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { EnvelopeDocument } from 'shared';
import { envelopeKeys } from '@/features/envelopes';
import { removeEnvelopeDocument, reorderEnvelopeDocuments } from './documentsApi';

/**
 * Reorder / remove for the documents of a server-side draft. Both refresh
 * the envelope detail so the list and every field's `document_id` come
 * back in the new order.
 */
export function useReorderEnvelopeDocumentsMutation(envelopeId: string) {
  const qc = useQueryClient();
  return useMutation<ReadonlyArray<EnvelopeDocument>, Error, ReadonlyArray<string>>({
    mutationFn: (documentIds) => reorderEnvelopeDocuments(envelopeId, documentIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: envelopeKeys.detail(envelopeId) }),
  });
}

export function useRemoveEnvelopeDocumentMutation(envelopeId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (documentId) => removeEnvelopeDocument(envelopeId, documentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: envelopeKeys.detail(envelopeId) }),
  });
}

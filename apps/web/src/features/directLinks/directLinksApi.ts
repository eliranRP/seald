import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ClaimDirectLinkInput,
  ClaimDirectLinkResult,
  CreateDirectLinkInput,
  DirectLink,
  DirectLinkWithToken,
  PublicDirectLink,
  UpdateDirectLinkInput,
} from 'shared';
import { apiClient } from '@/lib/api/apiClient';
import { verifyApiClient } from '@/lib/api/verifyApiClient';

/** Owner side (WP-37). The template's one direct link; `null` before one exists. */

export const directLinkKey = (templateId: string) =>
  ['templates', templateId, 'direct-link'] as const;

const base = (templateId: string): string =>
  `/templates/${encodeURIComponent(templateId)}/direct-link`;

async function fetchDirectLink(templateId: string): Promise<DirectLink | null> {
  const res = await apiClient.get<{ link: DirectLink | null }>(base(templateId));
  return res.data.link;
}

export function useDirectLink(templateId: string) {
  return useQuery<DirectLink | null>({
    queryKey: directLinkKey(templateId),
    queryFn: () => fetchDirectLink(templateId),
  });
}

export function useCreateDirectLink(templateId: string) {
  const qc = useQueryClient();
  return useMutation<DirectLinkWithToken, Error, CreateDirectLinkInput>({
    mutationFn: async (body) =>
      (await apiClient.post<DirectLinkWithToken>(base(templateId), body)).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: directLinkKey(templateId) });
    },
  });
}

export function useUpdateDirectLink(templateId: string) {
  const qc = useQueryClient();
  return useMutation<DirectLink, Error, UpdateDirectLinkInput>({
    mutationFn: async (body) => (await apiClient.patch<DirectLink>(base(templateId), body)).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: directLinkKey(templateId) });
    },
  });
}

export function useRotateDirectLink(templateId: string) {
  const qc = useQueryClient();
  return useMutation<DirectLinkWithToken, Error, void>({
    mutationFn: async () =>
      (await apiClient.post<DirectLinkWithToken>(`${base(templateId)}/rotate`)).data,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: directLinkKey(templateId) });
    },
  });
}

export function useDeleteDirectLink(templateId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: async () => {
      await apiClient.delete(base(templateId));
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: directLinkKey(templateId) });
    },
  });
}

/** The absolute URL the owner shares, from the one-time token. */
export function directLinkUrl(token: string): string {
  return `${window.location.origin}/d/${token}`;
}

/**
 * Public side. No session and no cookies: the visitor is anonymous, and the
 * token in the path is the only credential. Uses the unauthenticated axios
 * instance, like the verify page.
 */
export async function fetchPublicDirectLink(token: string): Promise<PublicDirectLink> {
  const res = await verifyApiClient.get<PublicDirectLink>(
    `/direct-links/${encodeURIComponent(token)}`,
  );
  return res.data;
}

export async function claimDirectLink(
  token: string,
  body: ClaimDirectLinkInput,
): Promise<ClaimDirectLinkResult> {
  const res = await verifyApiClient.post<ClaimDirectLinkResult>(
    `/direct-links/${encodeURIComponent(token)}/claim`,
    body,
  );
  return res.data;
}

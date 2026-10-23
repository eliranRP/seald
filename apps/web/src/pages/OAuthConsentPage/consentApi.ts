import { useMutation, useQuery } from '@tanstack/react-query';
import {
  OAuthConsentDescriptionSchema,
  OAuthConsentResultSchema,
  type OAuthAuthorizationRequest,
  type OAuthConsentDescription,
  type OAuthConsentResult,
} from 'shared';
import { apiClient, type ApiError } from '@/lib/api/apiClient';

export const consentKey = (req: OAuthAuthorizationRequest | null) =>
  ['oauth-consent', req] as const;

/** `POST /oauth/consent/describe` with the owner's session. */
export function useConsentDescription(req: OAuthAuthorizationRequest | null, enabled: boolean) {
  return useQuery<OAuthConsentDescription, ApiError>({
    queryKey: consentKey(req),
    queryFn: async () => {
      const res = await apiClient.post<unknown>('/oauth/consent/describe', req);
      return OAuthConsentDescriptionSchema.parse(res.data);
    },
    enabled: enabled && req !== null,
    retry: false,
  });
}

export interface ConsentDecisionInput {
  readonly request: OAuthAuthorizationRequest;
  readonly decision: 'approve' | 'deny';
}

/** `POST /oauth/consent`: the API answers with where the browser goes next. */
export function useConsentDecision() {
  return useMutation<OAuthConsentResult, ApiError, ConsentDecisionInput>({
    mutationFn: async ({ request, decision }) => {
      const res = await apiClient.post<unknown>('/oauth/consent', { ...request, decision });
      return OAuthConsentResultSchema.parse(res.data);
    },
  });
}

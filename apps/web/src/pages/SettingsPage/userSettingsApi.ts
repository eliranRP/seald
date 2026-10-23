import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DEFAULT_USER_SETTINGS, type UserSettings } from 'shared';
import { apiClient } from '@/lib/api/apiClient';

/** The body of `PATCH /me/settings`: any subset, nested objects merge. */
export interface UserSettingsPatch {
  readonly display_name?: string | null;
  readonly signature?: {
    readonly type?: UserSettings['signature']['type'];
    readonly typed_text?: string | null;
    readonly image?: string | null;
  };
  readonly initials?: string | null;
  readonly notify?: Partial<UserSettings['notify']>;
  readonly reminder_default?: UserSettings['reminder_default'];
  readonly expiry_default_days?: UserSettings['expiry_default_days'];
}

export const USER_SETTINGS_KEY = ['me', 'settings'] as const;

/** Applies a patch the way the API merges it, for the optimistic update. */
export function applyPatch(current: UserSettings, patch: UserSettingsPatch): UserSettings {
  const signature = { ...current.signature, ...patch.signature };
  return {
    display_name: patch.display_name === undefined ? current.display_name : patch.display_name,
    signature: signature.type === 'typed' ? { ...signature, image: null } : signature,
    initials: patch.initials === undefined ? current.initials : patch.initials,
    notify: { ...current.notify, ...patch.notify },
    reminder_default: patch.reminder_default ?? current.reminder_default,
    expiry_default_days: patch.expiry_default_days ?? current.expiry_default_days,
  };
}

export function useUserSettings() {
  return useQuery<UserSettings>({
    queryKey: USER_SETTINGS_KEY,
    queryFn: async () => (await apiClient.get<UserSettings>('/me/settings')).data,
    staleTime: 30_000,
  });
}

/**
 * Saves a patch. The cache updates first (switches and segmented controls
 * move at once) and rolls back if the request fails.
 */
export function useUpdateUserSettings() {
  const qc = useQueryClient();
  return useMutation<
    UserSettings,
    Error,
    UserSettingsPatch,
    { readonly previous: UserSettings | undefined }
  >({
    mutationFn: async (patch) => (await apiClient.patch<UserSettings>('/me/settings', patch)).data,
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: USER_SETTINGS_KEY });
      const previous = qc.getQueryData<UserSettings>(USER_SETTINGS_KEY);
      qc.setQueryData<UserSettings>(
        USER_SETTINGS_KEY,
        applyPatch(previous ?? DEFAULT_USER_SETTINGS, patch),
      );
      return { previous };
    },
    onError: (_err, _patch, ctx) => {
      if (ctx?.previous) qc.setQueryData(USER_SETTINGS_KEY, ctx.previous);
    },
    onSuccess: (saved) => {
      qc.setQueryData(USER_SETTINGS_KEY, saved);
    },
  });
}
